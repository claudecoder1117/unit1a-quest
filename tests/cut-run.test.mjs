// tests/cut-run.test.mjs — THE RUN LANE OF THE CUT (designs/CUT-BRIEF.md, designs/CUT-SPEC.md).
//
// This lane owns three files: `site/js/screens/run.js`, `site/js/app.js`, `site/index.html`. Two of
// CUT-BRIEF's hard limits and one of its laws land on them, and this file is where each one is
// proved rather than asserted:
//
//   §1  "at most three numbers on screen at once during play" reaches the APP SHELL. The three the
//       game may print live in `screens/job.js`'s strip; every read-out in the header steps aside.
//   §2  "no word a 14-year-old would have to be taught", and CUT-SPEC §6's list is the whole list:
//       the run route prints NO copy of its own on the game's mount.
//   §3  "no number on any surface that is not exactly the number the engine computes" — the run
//       record's arithmetic, checked against a reimplementation, never against itself.
//   §4  CUT-BRIEF math #6, "improving never costs", over the FULL state space of a ten-item page.
//   §5  CUT-BRIEF math #7, "nothing about the payoff reads a clock" — the record is clock-free.
//   §6  the terminal is idempotent: one sitting files exactly one row, reload or no reload.
//   §7  THE LAW OF TWO LEDGERS, this file's half: not one game field reaches Ledger A, and
//       `commitJobRun` writes what the flat page would have written and nothing else.
//   §8  `captureJobBefore` READS Ledger A and writes none of it.
//
// `tests/job-ledger.test.mjs` owns the other half of §7 — the two arms, byte for byte. This file
// does not repeat it; it holds the parts that are this lane's own code.
//
// Every assertion below was made to FAIL against a deliberately broken copy of the file it covers
// before it was made to pass; the six negative controls are recorded in notes/cut-run.md.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as R from '../site/js/screens/run.js';
import { fresh } from '../site/js/store.js';
import { installation } from '../site/js/trophies.js';
import { startPage, resumePage } from '../site/js/page.js';
import { pageOpts } from '../site/js/plan.js';
import { xpFor } from '../site/js/xp.js';
import { LEDGER_A_KEYS } from '../site/js/job/state.js';
import { SKILL_IDS } from '../site/data/skills.js';
import { read, stripCommentsAndStrings } from './_helpers.mjs';

// app.js is imported dynamically and its side effect undone: importing it evaluates screens/index.js,
// which installs the trophy engine (a module singleton) on a microtask.
const APP = await import('../site/js/app.js');
await Promise.resolve();
installation()?.uninstall();

const NOW = Date.parse('2026-09-17T14:00:00');
const clone = (x) => structuredClone(x);
const INDEX_HTML = read('site/index.html');

/* ================================================================= §1 the shell goes quiet */

/** Every `id="hdr-…"` the shipped shell renders — read off index.html, not off a list in a test. */
function headerIdsInIndex() {
  return [...INDEX_HTML.matchAll(/\bid="(hdr-[a-z-]+)"/g)].map((m) => m[1]).sort();
}

/** The smallest document `renderHeader()` can run against: ids in, elements out, nothing rendered. */
function fakeDom(ids) {
  const mk = (name) => {
    const kids = new Map();
    const el = {
      name, hidden: false, dataset: {}, style: {}, textContent: '', title: '', attrs: {},
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute(k, v) { el.attrs[k] = v; },
      getAttribute(k) { return el.attrs[k] ?? null; },
      querySelector(sel) { if (!kids.has(sel)) kids.set(sel, mk(sel)); return kids.get(sel); },
    };
    return el;
  };
  const els = new Map(ids.map((id) => [id, mk(id)]));
  const bar = mk('.hdr');
  return {
    els, bar,
    document: {
      getElementById: (id) => els.get(id) ?? null,
      querySelector: (sel) => (sel === '.hdr' ? bar : null),
      querySelectorAll: () => [],
      documentElement: mk('html'),
      addEventListener() {}, removeEventListener() {},
    },
  };
}

test('§1 CUT-BRIEF hard limit 1: during a session the shell prints no number at all', async (t) => {
  await t.test('every header read-out index.html renders is on the hide list, and none is kept', () => {
    const inIndex = headerIdsInIndex();
    assert.ok(inIndex.length >= 6, `index.html renders ${inIndex.length} header read-outs`);
    assert.deepEqual([...APP.HDR_JOB_HIDE].sort(), inIndex,
      'a header read-out exists that a game session does not hide — the shell would print a fourth number');
    assert.deepEqual([...APP.HDR_JOB_KEEP], [],
      'nothing survives into a session: hdr-readiness prints 57 and hdr-tminus prints T−3');
  });

  await t.test('setJobHeader(true) hides all six; setJobHeader(null) brings all six back', () => {
    const ids = headerIdsInIndex();
    const dom = fakeDom(ids);
    const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = dom.document;
    try {
      APP.setHeader({ readiness: 57, provisional: false, tminus: 3, level: 4, levelPct: 0.5, xp: 1200, combo: 6, streak: 9 });
      assert.equal(APP.headerItems().length, ids.length, 'outside a session every read-out is on screen');

      APP.setJobHeader(true);
      assert.equal(APP.getJobHeader().on, true);
      assert.deepEqual(APP.headerItems(), [], 'a read-out survived into the session');
      for (const id of ids) assert.equal(dom.els.get(id).hidden, true, `${id} is still on screen during play`);
      assert.equal(dom.bar.dataset.job, 'true');

      APP.setJobHeader(null);
      assert.equal(APP.headerItems().length, ids.length, 'the header did not come back after the session');
      for (const id of ids) assert.equal(dom.els.get(id).hidden, false, `${id} stayed hidden after the session`);
      assert.equal(dom.bar.dataset.job, undefined);
    } finally {
      if (had) Object.defineProperty(globalThis, 'document', had); else delete globalThis.document;
    }
  });
});

/* ================================================================= §2 the route says nothing */

test('§2 CUT-SPEC §6 is the whole list: the run route prints no copy on the game mount', async (t) => {
  await t.test('the game kind has no opening line, and every other delegate still has one', () => {
    assert.equal(R.openingLine('job'), null, 'the game mount would print a string CUT-SPEC §6 does not list');
    for (const k of ['baseline', 'night', 'morning', 'jump', 'post']) {
      assert.match(String(R.openingLine(k)), /^Opening .+…$/, k);
    }
  });

  await t.test('CUT-BRIEF hard limit 3 — no new screen, no new route: the count is still 13', () => {
    assert.equal(APP.ROUTE_PATTERNS.length, 13, APP.ROUTE_PATTERNS.join(' '));
    assert.ok(APP.ROUTE_PATTERNS.includes('/run/:kind/:id?'), 'the game mounts on the run route');
    const jobbish = (list) => list.filter((p) => /job|game|bid|call|bank/i.test(p));
    assert.deepEqual(jobbish(APP.ROUTE_PATTERNS), [], 'the game grew a route of its own');
    // …and the filter is not vacuous: it would catch one if the game ever grew it.
    assert.deepEqual(jobbish([...APP.ROUTE_PATTERNS, '/job/:id']), ['/job/:id']);
  });

  await t.test('the game kind carries no name, and no stub copy behind it', () => {
    const meta = R.kindMeta('job');
    assert.ok(meta, 'screens/home.js gates the game route on kindMeta("job") being there');
    assert.equal(meta.title, '', '"The Job" is a word a 14-year-old would have to be taught');
    assert.equal(meta.game, true, 'the game kind is not one of S1\'s run kinds');
    assert.equal(R.delegateOf('job').fallback, 'today',
      'a stub is a paragraph of copy; the game layer has none to fall back on');
    assert.ok(!R.RUN_KINDS.includes('job'));
  });
});

/* ================================================================= the fixtures */

/**
 * One graded item, in the shape `screens/card.js` hands to `onDone` — a clean first-try clear, or a
 * miss that went to the solution. The XP is `js/xp.js`'s own, so §3 compares the record against the
 * engine rather than against a number typed into this file.
 */
function resultOf(i, ok) {
  const tier = (i % 4) + 1;
  const elapsedMs = 9000 + i * 137;
  const base = {
    id: `c-${i}`, n: i + 1, role: 'new', skill: 'VOC', tier, elapsedMs,
    cleared: ok, firstTry: ok, hints: 0, attempt: ok ? 1 : 3,
    clean: ok, rarity: ok ? 'gold' : null, solutionShown: !ok,
  };
  return { ...base, xp: ok ? xpFor({ tier, firstTry: true, hints: 0, attempt: 1, comboBefore: 0, elapsedMs }).xp : 0 };
}

const vectorResults = (bits) => bits.map((ok, i) => resultOf(i, !!ok));

/** A save with a real composed page under it, so the snapshot has real tiles to read. */
function savedPage(profile = 'cut-run') {
  const s = fresh(NOW);
  s.profileId = profile;
  startPage(s, { now: NOW });
  const ip = resumePage(s);
  assert.ok(ip && ip.queue.length, 'composePage dealt nothing');
  return { save: s, ip };
}

const commitOn = (save, opts) => R.commitJobRun(save, opts);
const pageRows = (save) => (save.runs ?? []).filter((r) => r.kind === 'page');

/* ================================================================= §3 the record's arithmetic */

test('§3 every number in the run record is the number the engine computed', async (t) => {
  await t.test('xp · acc · flawless are the results\' own, recomputed independently', () => {
    const bits = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1];
    const results = vectorResults(bits);
    const { save } = savedPage('arith');
    const rec = commitOn(save, { results, startedAt: NOW, now: NOW + 600_000 });
    assert.ok(rec, 'nothing was recorded');

    let wantXp = 0, wantCleared = 0, wantClean = 0;
    for (const r of results) { wantXp += r.xp; if (r.cleared) { wantCleared++; if (r.clean) wantClean++; } }
    assert.equal(rec.xp, wantXp, `xp ${rec.xp} ≠ Σ xpFor ${wantXp}`);
    assert.equal(rec.acc, wantCleared / results.length);
    assert.equal(rec.flawless, wantClean);
    assert.equal(rec.items.length, results.length);
    assert.equal(rec.startedAt, NOW, 'the row is stamped with the sitting, not with the terminal');
    assert.equal(rec.submittedAt, NOW + 600_000);
    assert.equal(rec.kind, 'page');
    assert.equal(rec.status, 'done');
    // wantXp is a real number, not a coincidence of an all-zero fixture.
    assert.ok(wantXp > 0 && wantCleared === 7 && wantClean === 7, `${wantXp} ${wantCleared} ${wantClean}`);
  });

  await t.test('each item row carries that item\'s own credit, clean flag and milliseconds', () => {
    const bits = [1, 0, 0, 1, 1];
    const results = vectorResults(bits);
    const { save } = savedPage('items');
    const rec = commitOn(save, { results, startedAt: NOW, now: NOW + 1000 });
    results.forEach((r, i) => {
      assert.equal(rec.items[i].id, r.id);
      assert.equal(rec.items[i].credit, r.cleared ? 1 : 0, `item ${i} credit`);
      assert.equal(rec.items[i].clean, !!r.clean, `item ${i} clean`);
      assert.equal(rec.items[i].ms, r.elapsedMs, `item ${i} ms`);
      assert.equal(rec.items[i].tier, r.tier);
      assert.equal(rec.items[i].flagged, false);
    });
  });
});

/* ================================================================= §4 improving never costs */

test('§4 CUT-BRIEF math #6 over the FULL state space of a ten-item page: improving never costs', () => {
  const N = 10;
  const total = 1 << N;
  const recOf = new Array(total);
  for (let v = 0; v < total; v++) {
    const bits = Array.from({ length: N }, (_, i) => (v >> i) & 1);
    recOf[v] = R.makeRunRecord({ kind: 'page', startedAt: NOW, submittedAt: NOW + 1000, results: vectorResults(bits) });
  }

  let flips = 0, bad = 0, minXpGap = Infinity, minAccGap = Infinity;
  for (let v = 0; v < total; v++) {
    for (let i = 0; i < N; i++) {
      if ((v >> i) & 1) continue;                 // item i is a miss: turn it into a clean clear
      const a = recOf[v], b = recOf[v | (1 << i)];
      flips++;
      const dXp = b.xp - a.xp, dAcc = b.acc - a.acc, dFl = b.flawless - a.flawless;
      if (!(dXp > 0 && dAcc > 0 && dFl === 1)) bad++;
      if (dXp < minXpGap) minXpGap = dXp;
      if (dAcc < minAccGap) minAccGap = dAcc;
      // and the one that killed the old design: a right answer never pays less than a wrong one
      if (b.items[i].credit <= a.items[i].credit) bad++;
    }
  }
  assert.equal(flips, N * (1 << (N - 1)), 'the state space was not walked whole');
  assert.equal(bad, 0, `${bad} of ${flips} improvements cost the student something`);
  assert.ok(minXpGap > 0, `the smallest gain from getting one more right is ${minXpGap} XP`);
  assert.ok(Math.abs(minAccGap - 1 / N) < 1e-12, `smallest accuracy gain ${minAccGap}`);
  // the cheapest item in the fixture is a tier-1 card: xp.js pays 10 × 1.5 clean + 5 speed = 20
  assert.equal(minXpGap, 20, 'the smallest thing getting one more right can be worth');
  // …and the aggregate: more right answers is never a lower number, over the whole lattice.
  for (let v = 0; v < total; v++) {
    for (let i = 0; i < N; i++) {
      if ((v >> i) & 1) continue;
      assert.ok(recOf[v | (1 << i)].xp >= recOf[v].xp);
    }
  }
});

/* ================================================================= §5 the record reads no clock */

test('§5 CUT-BRIEF math #7: the record is a function of the answers, not of the clock', async (t) => {
  await t.test('the same answers at two different instants file the same row', () => {
    const results = vectorResults([1, 1, 0, 1, 0, 1]);
    const a = savedPage('clock-a').save;
    const b = savedPage('clock-b').save;
    const ra = commitOn(a, { results, startedAt: NOW, now: NOW + 60_000 });
    const rb = commitOn(b, { results, startedAt: NOW + 9 * 86_400_000, now: NOW + 9 * 86_400_000 + 5_000 });
    const study = ({ startedAt, submittedAt, n, ...rest }) => rest;
    assert.deepEqual(study(ra), study(rb), 'the row moved when only the clock moved');
    assert.equal(ra.limitMs, null);
    assert.equal(ra.tabAway, 0);
  });

  await t.test('makeRunRecord holds no Date of its own: same input, same output', () => {
    const results = vectorResults([1, 0, 1]);
    const one = R.makeRunRecord({ kind: 'page', startedAt: NOW, submittedAt: NOW + 1, results });
    const two = R.makeRunRecord({ kind: 'page', startedAt: NOW, submittedAt: NOW + 1, results });
    assert.deepEqual(one, two);
  });

  /* round 5, ledger-invariance: a Page is the one kind that survives a break, so the duration
     `#/stats` prints for it is the answering and not the wall — otherwise dinner is study, and how
     much of it is study depends on which door the page was answered through. */
  await t.test('a break between two sittings is not study time', () => {
    const results = vectorResults([1, 0, 1, 1]);
    const wantMs = results.reduce((a, r) => a + r.elapsedMs, 0);
    const straight = R.makeRunRecord({ kind: 'page', startedAt: NOW, submittedAt: NOW + 42 * 60_000, results });
    const dinner = R.makeRunRecord({ kind: 'page', startedAt: NOW - 5 * 3_600_000, submittedAt: NOW + 42 * 60_000, results });
    assert.equal(straight.ms, wantMs, 'a Page\'s duration is not its items\'');
    assert.equal(dinner.ms, straight.ms, 'five hours away from the table were filed as study');
    // every other kind is a single sitting and keeps the wall clock `#/stats` has always printed
    const drill = R.makeRunRecord({ kind: 'drill', id: 'CS-LIN', startedAt: NOW, submittedAt: NOW + 60_000, results });
    assert.equal(drill.ms, 60_000);
  });

  await t.test('pageRunStartedAt: the page decides when it started, never the mount', () => {
    assert.equal(R.pageRunStartedAt({ startedAt: NOW }, NOW + 5 * 3_600_000), NOW, 'a re-mount re-stamped the page');
    assert.equal(R.pageRunStartedAt({}, NOW + 5), NOW + 5, 'a page with no stamp falls back to the mount');
  });
});

/* ================================================================= §6 one sitting, one row */

test('§6 the terminal is idempotent: one sitting files exactly one row', async (t) => {
  await t.test('a second commit inside the same render writes nothing', () => {
    const { save, ip } = savedPage('twice');
    const before = R.captureJobBefore(save, ip.queue);
    const results = vectorResults([1, 1, 0]);
    const first = commitOn(save, { results, before, now: NOW + 1000 });
    assert.ok(first);
    assert.equal(pageRows(save).length, 1);
    const second = commitOn(save, { results, before, now: NOW + 2000 });
    assert.equal(second, null, 'the sitting was recorded twice');
    assert.equal(pageRows(save).length, 1);
  });

  await t.test('a reload — a fresh snapshot, the same sitting — still writes nothing', () => {
    const { save, ip } = savedPage('reload');
    const startedAt = NOW - 300_000;
    const results = vectorResults([1, 0, 1, 1]);
    assert.ok(commitOn(save, { results, startedAt, now: NOW }));
    assert.equal(pageRows(save).length, 1);
    // the tab was killed and reopened: no in-memory snapshot survives, only `runs[]` knows
    assert.equal(commitOn(save, { results, startedAt, now: NOW + 10_000 }), null);
    assert.equal(pageRows(save).length, 1);
    // a genuinely different sitting DOES get its own row (the guard is not a blanket refusal)
    assert.ok(commitOn(save, { results, startedAt: startedAt + 1, now: NOW + 20_000 }));
    assert.equal(pageRows(save).length, 2);
  });

  await t.test('a session that answered nothing records nothing', () => {
    const { save } = savedPage('empty');
    assert.equal(commitOn(save, { results: [], startedAt: NOW, now: NOW + 1 }), null);
    assert.equal(commitOn(save, { queue: [], startedAt: NOW, now: NOW + 1 }), null);
    assert.deepEqual(save.runs ?? [], []);
  });
});

/* ================================================================= §7 the Law of Two Ledgers */

/** Every key at every depth of a record, as `a.b.c` paths. */
function keyPaths(value, path = '', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    if (!/^\d+$/.test(k)) out.push(p);
    keyPaths(v, p, out);
  }
  return out;
}

/** Every noun the game layer owns. None of them may appear as a key in a Ledger A record. */
const GAME_NOUNS = ['pile', 'streak', 'call', 'bank', 'best', 'points', 'pay', 'cost', 'split',
  'today', 'player', 'game', 'sure', 'mult', 'posted', 'loot', 'chain', 'bag', 'board', 'crew', 'guard'];

test('§7 the record is the flat page\'s, and not one game field reaches Ledger A', async (t) => {
  await t.test('commitJobRun writes the row #/run/page would have written for the same answers', () => {
    const results = vectorResults([1, 1, 0, 1, 1, 0, 1]);
    const game = savedPage('ledger-game').save;
    const flat = savedPage('ledger-flat').save;
    const rec = commitOn(game, { results, startedAt: NOW, now: NOW + 900_000 });
    // the flat path's own two lines, from `mountCardRun.finish()`
    const want = R.pushRun(flat, R.makeRunRecord({
      kind: 'page', id: null, seed: null, seedTag: null,
      startedAt: NOW, submittedAt: NOW + 900_000, results, extra: {},
    }));
    assert.deepEqual(rec, want, 'the game filed a different row than the flat page for the same answers');
  });

  await t.test('no key of the row is a game noun, at any depth', () => {
    const results = vectorResults([1, 0, 1]);
    const { save } = savedPage('nouns');
    const rec = commitOn(save, { results, startedAt: NOW, now: NOW + 1000 });
    const paths = keyPaths(rec);
    assert.ok(paths.length > 10, `${paths.length} keys walked`);
    for (const p of paths) {
      const leaf = p.split('.').pop();
      assert.ok(!GAME_NOUNS.includes(leaf), `the run record carries a game field: ${p}`);
    }
    assert.deepEqual(Object.keys(rec).sort(), [
      'acc', 'flawless', 'items', 'kind', 'limitMs', 'ms', 'n', 'seed', 'seedTag',
      'startedAt', 'status', 'submittedAt', 'tabAway', 'xp',
    ]);
  });

  /**
   * ROUND 5, ledger-invariance. The row above is filed for a page answered in ONE sitting, and that
   * is the easy case: both writers see the same clock. The case that broke was a page interrupted —
   * quit after five questions, dinner, back — where the flat runner re-stamped its own mount and the
   * game kept `inProgress`'s, so `#/stats` printed `42m` for one door and `5h 52m` for the other
   * over the same study, and `page.js pageIndexFor` counted the page on two different days.
   */
  await t.test('a five-hour break cannot move the row: one page, two sittings, either door', () => {
    const PAGE_AT = NOW;                          // the page was dealt at 14:00
    const RESUME_AT = NOW + 5 * 3_600_000;        // the screen is mounted again after dinner
    const DONE_AT = RESUME_AT + 42 * 60_000;
    const results = vectorResults([1, 1, 0, 1, 1, 0, 1, 1]);
    const answering = results.reduce((a, r) => a + r.elapsedMs, 0);

    // ARM A — the flat runner's own two lines from `mountCardRun.finish()`, with its `Date.now()`
    // at the RE-mount, which is what re-stamped the row.
    const flat = savedPage('break-flat');
    flat.ip.startedAt = PAGE_AT;
    const flatRec = R.pushRun(flat.save, R.makeRunRecord({
      kind: 'page', id: null, seed: flat.ip.seed, seedTag: flat.ip.seedTag,
      startedAt: R.pageRunStartedAt(flat.ip, RESUME_AT), submittedAt: DONE_AT, results, extra: {},
    }));

    // ARM B — the game's terminal, off the snapshot the session took when it started.
    const game = savedPage('break-game');
    game.ip.startedAt = PAGE_AT;
    const before = R.captureJobBefore(game.save, game.ip.queue);
    const gameRec = commitOn(game.save, { results, before, now: DONE_AT });
    assert.ok(gameRec, 'the game recorded nothing');

    assert.equal(flatRec.startedAt, PAGE_AT, 'the flat route stamped the sitting, not the page');
    assert.equal(gameRec.startedAt, flatRec.startedAt, 'two doors, two answers to "when did this start?"');
    assert.equal(gameRec.ms, flatRec.ms, 'two doors, two durations for the same study');
    assert.equal(flatRec.ms, answering, 'the duration is not the sum of what the items took');
    assert.ok(flatRec.ms < DONE_AT - PAGE_AT, 'the dinner was filed as study time');

    const study = ({ n, seed, seedTag, ...rest }) => rest;
    assert.deepEqual(study(gameRec), study(flatRec), 'the interrupted page filed two different rows');
  });

  await t.test('Ledger B is not touched by the terminal either — the game writes it, the screen does not', () => {
    const { save, ip } = savedPage('ledger-b');
    save.player = { best: 274 };
    save.game = { today: 186, day: '2026-09-17' };
    const b0 = clone({ player: save.player, game: save.game });
    R.captureJobBefore(save, ip.queue);
    commitOn(save, { results: vectorResults([1, 1, 0]), startedAt: NOW, now: NOW + 1000 });
    assert.deepEqual({ player: save.player, game: save.game }, b0);
  });
});

/* ================================================================= §8 the before-snapshot */

test('§8 captureJobBefore reads Ledger A and writes none of it', async (t) => {
  await t.test('the snapshot is the flat Page\'s own keys plus the sitting\'s identity — and nothing else', () => {
    const { save, ip } = savedPage('snap');
    const snap = R.captureJobBefore(save, ip.queue);
    assert.deepEqual(Object.keys(snap).sort(),
      ['coverage', 'readiness', 'seed', 'seedTag', 'skills', 'startedAt', 'tiles', 'xp']);
    assert.ok(!('wallMs' in snap), 'wallMs is a number nothing prints — it went with the debrief');
    assert.equal(snap.seed, ip.seed);
    assert.ok(snap.startedAt > 0);
    assert.ok(R.pageBefore(resumePage(save)), 'the snapshot is where a Page\'s own already lives');
  });

  await t.test('it is idempotent: the second call is the first call\'s object', () => {
    const { save, ip } = savedPage('snap2');
    const a = R.captureJobBefore(save, ip.queue);
    a.xp = 999;                                   // a value only the FIRST snapshot can have
    const b = R.captureJobBefore(save, ip.queue);
    assert.equal(b.xp, 999, 'the snapshot was retaken mid-session — the delta would be measured from the wrong start');
  });

  await t.test('every Ledger A key is byte-identical across the capture', () => {
    const { save, ip } = savedPage('snap3');
    const a0 = Object.fromEntries(LEDGER_A_KEYS.map((k) => [k, clone(save[k])]));
    R.captureJobBefore(save, ip.queue);
    for (const k of LEDGER_A_KEYS) assert.deepEqual(save[k], a0[k], `captureJobBefore wrote Ledger A key ${k}`);
  });

  await t.test('after the terminal the snapshot is stamped, and still carries no clock of its own', () => {
    const { save, ip } = savedPage('snap4');
    const snap = R.captureJobBefore(save, ip.queue);
    commitOn(save, { results: vectorResults([1, 0]), before: snap, now: NOW + 5000 });
    assert.equal(snap.runRecorded, true);
    assert.ok(!('wallMs' in snap));
  });
});

/* ================================================== §9 Drill 5 deals five, and says what it dealt */

/**
 * A save on which `skill` is a WEAK SPOT — the exact state Home renders its "Drill 5" link from
 * (`readiness.weakSpots`: n ≥ 1, a miss, m_shown < 70). Everything else on the save is untouched,
 * which is the ordinary case and the one the defect below lived in.
 */
function weakSave(skill, { able = false } = {}) {
  const s = fresh(NOW - 5 * 86_400_000);
  s.profileId = `drill-${skill}`;
  s.skills = { ...(s.skills ?? {}) };
  /* `able` is the same student with every PREREQUISITE met — the only variable between the two arms
     of the third case below. */
  if (able) for (const id of SKILL_IDS) s.skills[id] = { m: 90, n: 8, lastAt: NOW - 86_400_000, lastDueCorrectAt: null };
  s.skills[skill] = { m: 25, n: 4, misses: 2, lastAt: NOW - 86_400_000, lastDueCorrectAt: null };
  return s;
}

const drillFor = (skill, opts) => R.buildRun('drill', weakSave(skill, opts), { id: skill, now: NOW });

test('§9 Drill 5 deals five, and the number it prints is the number it dealt', async (t) => {
  await t.test('every skill in the bank deals DRILL_ITEMS', () => {
    const short = SKILL_IDS
      .map((skill) => [skill, drillFor(skill).items.length])
      .filter(([, n]) => n !== R.DRILL_ITEMS)
      .map(([skill, n]) => `${skill}: ${n}`);
    assert.deepEqual(short, [],
      'the "Drill 5" link on Home, the Boss miss strip and Stats is a published count — a skill that ' +
      'deals fewer has made all four surfaces print a number the engine did not compute');
  });

  await t.test('the count in the title is read off the queue, never hard-coded', () => {
    for (const skill of SKILL_IDS) {
      const run = drillFor(skill);
      const claimed = Number(String(run.title).match(/^Drill (\d+)/)?.[1]);
      assert.equal(claimed, run.items.length, `the head says "${run.title}" over a queue of ${run.items.length}`);
    }
  });

  await t.test('no `needs` gate may shrink a drill: an untouched prerequisite deals the same five', () => {
    /* THE DEFECT THIS PINS (notes/cut-run.md, round 1). J5b filtered the drill's templates by
       item-level `needs`. Five templates carry one — four of them need QUAD-SOLVE, which is late
       algebra — so the ordinary student, weak in BISECT-Q and never having touched QUAD-SOLVE, was
       dealt ONE card under a head that read "Drill 5 · Does It Bisect? Two Cases · 0 of 1 done".
       The two arms below differ ONLY in prerequisites, so they must deal the same queue. */
    for (const skill of ['BISECT-Q', 'SEG-ALG', 'CS-QUAD', 'SYS', 'FIG-ALG', 'ASN-PLP', 'ASN-ANG']) {
      const bare = drillFor(skill);
      const able = drillFor(skill, { able: true });
      assert.equal(bare.items.length, R.DRILL_ITEMS, `Drill ${skill} dealt ${bare.items.length} to a student whose prerequisites are untouched`);
      assert.deepEqual(
        bare.items.map((it) => it.template ?? it.id),
        able.items.map((it) => it.template ?? it.id),
        `Drill ${skill} deals a different family depending on a skill the student did not ask to drill`,
      );
    }
  });

  await t.test('the drill arm holds no prerequisite gate at all', () => {
    const src = stripCommentsAndStrings(read('site/js/screens/run.js'));
    assert.equal(/needsMet/.test(src), false,
      'a `needs` filter is back on a run queue in this file — page.js can afford one (it fills a whole ' +
      'page from several pools); Drill has one skill\'s templates and a count already in print');
  });
});

/* ================================ §10 one page for both routes: the queue is never game-conditioned */

test('§10 the game is Today\'s Page — nothing here composes a different queue when it is on', async (t) => {
  /* CUT-BRIEF "Session shape": *"Same queue as Today's Page, same length, same items"*, and *"The
     composer still owns what is studied. The game re-skins composePage's queue; it never chooses,
     adds, removes or reorders a question."*

     This is the guard against a repair that was proposed and is a non-fix twice over: shortening the
     queue when `settings.game` is on, to lift the measured session split. It cannot lift it — the
     split is a PER-QUESTION ratio, measured 10 % at 1, 2, 3, 4, 6, 8 and 11 questions on the shipped
     engine (notes/cut-run.md round 1) — and it breaks both lines above on the way. */

  await t.test('`pageOpts` does not branch on the game switch', () => {
    const on = fresh(NOW - 5 * 86_400_000);
    on.profileId = 'opts';
    on.settings.testDate = '2026-09-24';
    on.settings.game = true;
    const off = clone(on);
    off.settings.game = false;
    assert.deepEqual(pageOpts(on), pageOpts(off),
      'the opts the routes hand `composePage` differ with the game switch — the game would not be Today\'s Page');
  });

  await t.test('this file starts Today\'s Page exactly once, through `pageOpts`, with no other option', () => {
    const src = read('site/js/screens/run.js');
    const calls = [...src.matchAll(/startPage\(.*$/gm)].map((m) => m[0].trim());
    assert.equal(calls.length, 1, `run.js composes Today's Page ${calls.length} times: ${calls.join(' | ')}`);
    assert.match(calls[0], /^startPage\(s, \{ \.\.\.pageOpts\(s\), now: startedAt \}\);/,
      'the page arm passes something other than `pageOpts` — a second implementation of the composer\'s opts');
  });

  await t.test('no queue in this file is conditioned on the game switch', () => {
    const src = stripCommentsAndStrings(read('site/js/screens/run.js'));
    assert.equal(/settings\s*\.\s*game|\bgameOn\b/.test(src), false,
      'a run queue now reads the game switch: the two routes can deal different pages, and CUT-BRIEF\'s ' +
      '"same length, same items" is no longer true of the route that promises it');

    /* ROUND 3, and the ban above did NOT move an inch to allow it. `handoffFor` (§11) has to know
       whether the route it names will accept the hand-off, and one of the two things that decides
       that is the switch — so it asks `plan.jobOwnsPage`, the DOOR's own predicate, and the answer
       crosses into this file while the flag does not. `tests/job-ledger.test.mjs` ("only the door
       itself reads the flag — no study module does") names `js/screens/run.js` explicitly, which is
       what makes that the only shape this fix could take. */
    assert.match(src, /\bjobOwnsPage\b/,
      'the hand-off no longer asks the door who owns the page — see §11');
    const guardAt = src.indexOf('export function handoffFor');
    const guardEnd = src.indexOf('function handOff', guardAt);
    assert.ok(guardAt >= 0 && guardEnd > guardAt, 'handoffFor is no longer where this test can read it');
    const uses = [...src.matchAll(/\bjobOwnsPage\s*\(/g)].map((m) => m.index);
    assert.equal(uses.length, 1, `the door's answer is consulted ${uses.length} times, not once`);
    assert.ok(uses[0] > guardAt && uses[0] < guardEnd,
      'the door\'s answer is read outside `handoffFor` — the only place in this file that routes');
    assert.equal(/\b(startPage|composePage|resumePage|dueList|requeueReview)\s*\(/
      .test(src.slice(guardAt, guardEnd)), false, 'the hand-off guard composes a queue');
  });
});

/* ==========================================================================================
   §11 ONE PAGE, ONE RUNNER — the live session's queue is not served flat

   `#/run/page` and `#/run/job` are not two pages. They are the same `save.inProgress`: the runner in
   this file, and the game's strip over the identical queue. While a session was live this route
   therefore was not a second VIEW of that page, it was a second DOOR into it, and both of the two
   ideas CUT-BRIEF keeps fell straight through it (exploit-hunt round 2, measured on the shipped
   payoff table — PEEK+SKIP is worth 1.23x-3.17x honest play, and no wrong answer is involved, so no
   cheating detector can see it):

     · *"You bid on yourself before you see the question"* — mount `#/run/page`, read the question,
       go back to the face-down card, call `sure`.
     · *"Your streak is a pile you can lose"* — answer it there instead: `markItem` advanced the
       index with no call, no cost and the streak intact.
     · and `finishPage` there cleared `inProgress`, taking the record and the whole unbanked pile
       with it, under the words "Page complete".

   What is proved below is the invariant, not the symptom: WHILE A RECORD IS LIVE THIS FILE NEITHER
   COMPOSES, WRITES NOR RENDERS. Each case was run against a copy of `screens/run.js` with the guard
   deleted first (notes/cut-run.md round 2, "Negative controls").
   ========================================================================================== */

import * as JOB from '../site/js/job/state.js';
import { getState as storeState, update as storeUpdate } from '../site/js/store.js';

/** A save with a session LIVE on Today's Page — the engine's own record, never a hand-made marker. */
function liveSave() {
  const s = fresh(NOW - 5 * 86_400_000);
  s.profileId = 'handoff';
  s.settings.testDate = '2026-09-24';
  JOB.startJob(s, { ...pageOpts(s), now: NOW });
  assert.ok(JOB.stateOf(s), 'fixture: the engine wrote no session record');
  assert.ok(s.inProgress.queue.length > 0, 'fixture: an empty page proves nothing');
  return s;
}

/** The smallest thing `app.js mount()` hands a render. It must come back untouched. */
function nullEl() {
  const kids = [];
  return {
    kids,
    append: (...c) => { kids.push(...c); },
    replaceChildren: (...c) => { kids.length = 0; kids.push(...c); },
  };
}

test('§11 a live session owns its page: `#/run/page` is not a second door into it', async (t) => {
  await t.test('the hand-off fires on exactly one route, and only while a record is live', () => {
    const live = liveSave();
    const flat = clone(live);
    delete flat.inProgress.game;                       // the same page, no session on it
    assert.ok(R.RUN_KINDS.includes('page'), 'the kind this guard is about is no longer a run kind');
    for (const k of [...R.RUN_KINDS, 'job', 'post', 'nonsense']) {
      assert.equal(R.handoffFor(k, flat), null,
        `#/run/${k} handed the student off with no session live — a plain page can no longer be run`);
      assert.equal(R.handoffFor(k, live), k === 'page' ? '/run/job' : null,
        `#/run/${k} names the wrong owner while a session is live`);
    }
    assert.equal(R.handoffFor('page', null), null, 'a missing save is not a live session');
    assert.equal(R.handoffFor('page', {}), null, 'a save with no page is not a live session');
  });

  await t.test('it cannot ping-pong, in EITHER direction: both of the game screen\'s refusals are closed here', () => {
    /* `screens/job.js` refuses to mount on exactly two conditions, and each one is a direction this
       guard has to close. If either can be true at the instant this guard names `/run/job`, the two
       routes trade the student forever and Today's Page is gone.

         · `state.pageInProgress` — "the flat page has been answered into, so a session may not start
           over it" — bounces to `#/run/page`. Closed by the ENGINE: it returns null over a live
           record, so it is never true when this one is, and it is asserted against the engine.
         · `gameOn` — the switch — bounces to `#/today`. ROUND 3: this direction had no guard at all.
           `#/today` → `#/run/page` (Home's resume button: `plan.nextActionFor` leaves it pointing
           here with the switch off) → `/run/job` → `#/today`, forever, with nothing on any of the
           three screens clearing the record, so the save could not heal itself either.

       Both are asserted as ONE property over every combination of the two bits, and it is the
       property that matters rather than either symptom: THE ROUTE THIS FILE HANDS TO MUST BE ONE
       THAT WILL ACCEPT THE HAND-OFF. */
    const on = liveSave();
    const off = clone(on); off.settings.game = false;
    const flatOn = clone(on); delete flatOn.inProgress.game;
    const flatOff = clone(off); delete flatOff.inProgress.game;

    for (const [name, s] of [['live/on', on], ['live/off', off], ['flat/on', flatOn], ['flat/off', flatOff]]) {
      if (R.handoffFor('page', s) !== '/run/job') continue;
      assert.equal(s.settings.game !== false, true,
        `${name}: handed off to a screen the switch has shut — #/today and #/run/page trade the student forever`);
      assert.equal(JOB.pageInProgress(s), null,
        `${name}: the game screen would bounce back to #/run/page — the two guards would trade the student forever`);
    }

    assert.equal(R.handoffFor('page', off), null,
      'the switch is off and the hand-off still fires: Today\'s Page is unreachable and the save cannot heal');
    assert.equal(R.handoffFor('page', on), '/run/job',
      'the switch is on, a session is live, and the flat runner would serve its queue anyway');
    assert.equal(R.handoffFor('job', on), null, 'the game route would hand itself off');
  });

  await t.test('with the switch off the record is DORMANT, not destroyed: flipping it back on resumes that session', () => {
    /* The old comment here refused the switch term on the grounds that it would "re-open
       `finishPage`'s silent destruction of the pile in the one corner it cannot reach". It does not.
       All three defects §11 lists need the game SCREEN — peeking needs a face-down card to go back
       to, dodging needs a session to carry the intact streak into, and the pile can only be stolen
       from a student who could otherwise still bank it. With the switch off `screens/job.js` refuses
       to mount, so there is no such screen. What this guard hands back is the flat page over an
       untouched record, and that is reversible: the guard reads it and nothing here writes or drops it.
       `qa/cut-run-r3.mjs` carries the same property end to end, where the flat runner really runs. */
    const off = liveSave();
    off.settings.game = false;
    const record = clone(JOB.stateOf(off));
    assert.ok(record, 'fixture: no record to keep');

    assert.equal(R.handoffFor('page', off), null, 'the hand-off still fires with the switch off');
    assert.deepEqual(JOB.stateOf(off), record, 'the guard touched the record');

    off.settings.game = true;                                   // the student flips it back
    assert.equal(R.handoffFor('page', off), '/run/job', 'the session did not come back with the switch');
    assert.deepEqual(JOB.stateOf(off), record, 'the session came back changed — the pile or the streak moved');
  });

  await t.test('mounting #/run/page over a live session composes nothing, writes nothing, renders nothing', () => {
    const s = liveSave();
    storeUpdate(() => s);
    const before = JSON.stringify(storeState().inProgress);
    const el = nullEl();

    const cleanup = R.mountRun({ kind: 'page' }, null)(el);
    assert.equal(typeof cleanup, 'function', 'the route returned no cleanup');
    cleanup();                       // cancels the deferred hand-off: this process has no document

    assert.equal(el.kids.length, 0, 'the flat runner rendered over a live session');
    assert.equal(JSON.stringify(storeState().inProgress), before,
      'the flat runner wrote to the live page — `startPage` recomposed it, or the index moved');
    assert.ok(JOB.stateOf(storeState()), 'the session record did not survive the visit');
  });

  await t.test('the page is closed in exactly one place, and `mountRun` asks who owns it first', () => {
    /* The second defect — `finishPage` throwing the unbanked pile away — has the same root and needs
       no second guard, PROVIDED the only `finishPage` in this file sits behind the only door. Both
       halves are checked, so a later edit that adds a close, or dispatches before the guard, fails. */
    const src = stripCommentsAndStrings(read('site/js/screens/run.js'));
    assert.equal([...src.matchAll(/\bfinishPage\s*\(/g)].length, 1,
      'run.js closes Today\'s Page in more than one place — one of them is not behind the guard');

    const start = src.indexOf('export function mountRun');
    const end = src.indexOf('function renderUnknown', start);
    assert.ok(start >= 0 && end > start, 'mountRun is no longer where this test can read it');
    const body = src.slice(start, end);
    const guard = body.indexOf('handoffFor(');
    assert.ok(guard >= 0, 'mountRun no longer asks who owns the page');
    for (const dispatch of ['delegateRun(', 'mountBlitz(', 'mountCardRun(']) {
      const at = body.indexOf(dispatch);
      assert.ok(at > guard,
        `mountRun dispatches to ${dispatch.slice(0, -1)} before it asks who owns the page`);
    }
  });
});
