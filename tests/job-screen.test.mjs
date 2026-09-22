// tests/job-screen.test.mjs — J6, THE JOB's screen (`site/js/screens/job.js`, `site/css/job.css`).
//
// Two halves, because two different things can rot:
//
//   1. **STATIC** — the laws that are structural in the source and must stay structural: the seal
//      (no card id, no template, no `createCardView` reachable from the pre-call render), the
//      EV-max ban (Global law 6: `argmaxCall` / `evTable` / `evFor` are not imported at all), the
//      route count (still 13), the header swap's two lists, `data/job.js`'s constants being read
//      rather than re-typed, the container/floor conventions of notes/LAYOUT-ROOT.md, and the six
//      animation cues. These run everywhere, in milliseconds, with no browser.
//
//   2. **MEASURED** — `node qa/job-screen.mjs`, which walks a full job in chromium AND webkit at
//      375x667 with the keyboard open and measures the board's height on every target, the header's
//      item count, the seal, the EV-max ban and the focus ring. It SKIPS (never fails) when no
//      Playwright browser is installed, exactly as tests/layout-audit.test.mjs does, so
//      `node --test tests/` stays green on a machine without browsers.
//
// The one thing this file deliberately does NOT do is re-assert the mechanics: every number the
// screen prints is `js/job/state.js`'s, and `tests/job-state.test.mjs` owns those.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { read, repoPath, stripCommentsAndStrings as strip } from './_helpers.mjs';

const JOB_JS = read('site/js/screens/job.js');
const JOB_CSS = read('site/css/job.css');
const APP_JS = read('site/js/app.js');
const RUN_JS = read('site/js/screens/run.js');
const INDEX = read('site/index.html');
const CODE = strip(JOB_JS);

const { HEADER, LAYOUT, KEYS, ANIMATION, COPY, GUARD, CHAIN } = await import('../site/data/job.js');
const screen = await import('../site/js/screens/job.js');
const state = await import('../site/js/job/state.js');

/* ================================================================================================
   1. The route — still 13, and the job is not one of them
   ================================================================================================ */

describe('J6 — the route count is still 13 and #/run/job is a delegate, not a route', () => {
  test('ROUTE_PATTERNS is 13 and contains no /job', async () => {
    const app = await import('../site/js/app.js');
    await Promise.resolve();
    try { (await import('../site/js/trophies.js')).installation()?.uninstall(); } catch { /* not installed */ }
    assert.equal(app.ROUTE_PATTERNS.length, 13, app.ROUTE_PATTERNS.join(' '));
    assert.ok(!app.ROUTE_PATTERNS.some((p) => /job/.test(p)), 'the job must not add a route (G10 #14)');
    assert.ok(app.ROUTE_PATTERNS.includes('/run/:kind/:id?'), 'it mounts on the run route');
  });

  test('run.js carries one KIND_META entry and one DELEGATES entry for it', async () => {
    const run = await import('../site/js/screens/run.js');
    assert.equal(run.kindMeta('job')?.title, 'The Job');
    assert.equal(run.kindMeta('job')?.back, '/today');
    assert.equal(run.kindMeta('job')?.mode, 'card');
    assert.equal(run.delegateOf('job').mod, './job.js');
    assert.deepEqual(run.delegateOf('job').fns, ['mountJob']);
    assert.ok(RUN_JS.includes('./job.js'), 'the delegate names the module');
  });

  test('`job` is NOT one of S1’s eleven run kinds (the same reading `post` already has)', async () => {
    const run = await import('../site/js/screens/run.js');
    assert.ok(!run.RUN_KINDS.includes('job'), 'RUN_KINDS is S1’s list, and the job is the game layer');
    assert.equal(run.RUN_KINDS.length, 11);
  });

  test('screens/job.js exports mountJob, and index.html links css/job.css exactly once', () => {
    assert.equal(typeof screen.mountJob, 'function');
    assert.equal(screen.default, screen.mountJob);
    const links = INDEX.match(/href="css\/job\.css"/g) ?? [];
    assert.equal(links.length, 1, 'one <link> line, per G7');
    // it must come after polish.css, or `.screen`'s own max-width wins over `.job-screen`'s
    assert.ok(INDEX.indexOf('css/job.css') > INDEX.indexOf('css/polish.css'), 'job.css is linked after polish.css');
  });

  test('both new files are precached, or the job 404s in airplane mode', () => {
    const sw = read('site/sw.js');
    assert.ok(sw.includes("'js/screens/job.js'"), 'run: node qa/gen-precache.mjs');
    assert.ok(sw.includes("'css/job.css'"), 'run: node qa/gen-precache.mjs');
  });
});

/* ================================================================================================
   2. The seal, and the EV-max ban (Global law 6) — both structural in the source
   ================================================================================================ */

describe('J6 — the sealed envelope cannot leak a stem, and no pre-call surface names the argmax', () => {
  test('the screen reaches the stem ONLY through state.stemRefFor', () => {
    assert.ok(/state\.stemRefFor\(/.test(CODE), 'the stem address comes from the machine');
    // the only card lookups in the file are inside sourceFor / the vault line, both AFTER a stemRef
    const renderEnvelope = CODE.slice(CODE.indexOf('function renderEnvelope'), CODE.indexOf('function renderNoStakes'));
    for (const banned of ['cardById[', 'T.generate', 'createCardView', 'stemRefFor']) {
      assert.ok(!renderEnvelope.includes(banned), `renderEnvelope must not touch ${banned} — that is the seal`);
    }
    assert.ok(renderEnvelope.includes('state.envelopeFor'), 'it renders envelopeFor() and nothing else');
  });

  test('createCardView is called exactly once, from renderAnswer, behind stemRefFor', () => {
    assert.equal((CODE.match(/createCardView\(/g) ?? []).length, 1);
    const renderAnswer = CODE.slice(CODE.indexOf('function renderAnswer'), CODE.indexOf('function sourceFor'));
    assert.ok(renderAnswer.indexOf('state.stemRefFor') < renderAnswer.indexOf('createCardView('),
      'the stem is addressed before it is mounted, never the other way round');
    assert.ok(/if\s*\(!ref\)/.test(renderAnswer), 'a null stemRef renders nothing');
  });

  test('the file does not import or mention argmaxCall / evTable / evFor anywhere', () => {
    for (const banned of ['argmaxCall', 'evTable', 'evFor', 'EV-max', 'evMaxBands']) {
      assert.ok(!CODE.includes(banned), `screens/job.js must not reach for ${banned} (Global law 6)`);
    }
    // the copy table it prints has no recommendation in it either, on the pre-call lines
    for (const key of ['envelope', 'evidence', 'guard', 'guardToken']) {
      const line = String(COPY[key]);
      assert.ok(!/argmax|recommend|EV-?max|best/i.test(line), `COPY.${key} names a recommended action`);
    }
  });

  test('every grade still belongs to card.js — the screen writes none', () => {
    for (const banned of ['applyOutcome', 'scoreFor', 'rarityOf', 'xpFor', 'grade(', 'updateSkill', 'save.cards', 'save.skills']) {
      assert.ok(!CODE.includes(banned), `screens/job.js must not duplicate the grade path (${banned})`);
    }
    assert.ok(/state\.applyTarget\(/.test(CODE), 'it prices card.js’s own result object');
  });

  test('no Math.random, and nothing seeds itself (site-wide rule, restated on the new file)', () => {
    assert.ok(!/Math\s*\.\s*random/.test(CODE));
  });

  test('the GUARD line names a wing only once the guard has DRAWN', () => {
    // `COPY.guard` prints "GUARD: <wing>", so printing it from the published distribution alone
    // would name a wing the House has not chosen. Caught in review after the first screenshot.
    assert.ok(/if \(gv\?\.guard\?\.wing\) sayGuard\(gv\)/.test(CODE), 'the guard line is gated on the draw');
    assert.ok(!/bars\[0\]\.wing/.test(CODE), 'the first bar is not the guard');
  });

  test('no conditional row can print itself — every append goes through the null-safe add()', () => {
    // `h()` drops null children; the native `Element.append()` stringifies null into the text
    // "null", and this screen is built out of conditional rows. Two literal `null`s reached the
    // board and the envelope before this rule existed.
    const targets = [...new Set([...CODE.matchAll(/(\w+)\.append\(/g)].map((m) => m[1]))].sort();
    assert.deepEqual(targets, ['el', 'host', 'root'],
      `a panel appends directly: ${targets.join(' ')} — use add(panel, …)`);
  });
});

/* ================================================================================================
   3. The header swap — five items during a job, six outside one
   ================================================================================================ */

describe('J6 — the header swap (G7 "Extended", G10 #22)', () => {
  test('app.js hides exactly the four data/job.js names and adds exactly the three', async () => {
    const app = await import('../site/js/app.js');
    assert.deepEqual([...app.HDR_JOB_HIDE], [...HEADER.hiddenDuringJob]);
    assert.deepEqual([...app.HDR_JOB_ADD], [...HEADER.addedDuringJob]);
    assert.deepEqual([...app.HDR_JOB_KEEP], [...HEADER.keptDuringJob]);
  });

  test('the arithmetic is the spec’s: 2 kept + 3 added = 5, 2 kept + 4 hidden = 6', () => {
    assert.equal(HEADER.keptDuringJob.length + HEADER.addedDuringJob.length, HEADER.itemsDuringJob);
    assert.equal(HEADER.keptDuringJob.length + HEADER.hiddenDuringJob.length, HEADER.itemsOutsideJob);
    assert.equal(HEADER.itemsDuringJob, 5);
    assert.equal(HEADER.itemsOutsideJob, 6);
  });

  test('index.html ships the six, and the three are created by app.js (never by the shell)', () => {
    for (const id of [...HEADER.keptDuringJob, ...HEADER.hiddenDuringJob]) {
      assert.ok(INDEX.includes(`id="${id}"`), `${id} is missing from the shell`);
    }
    for (const id of HEADER.addedDuringJob) {
      assert.ok(!INDEX.includes(`id="${id}"`), `${id} must not be in the shell — the job paints it`);
      assert.ok(APP_JS.includes(`'${id}'`), `${id} is not named in app.js`);
    }
  });

  test('the screen swaps the header on and off, and off on teardown', () => {
    assert.ok(/setJobHeader\(null\)/.test(CODE), 'the header goes back to six when the screen unmounts');
    assert.ok(/setJobHeader\(\{[^}]*loose/.test(CODE), 'and carries LOOSE · BAG · chain while the job runs');
  });
});

/* ================================================================================================
   4. The board collapse, the containers and the floors (notes/LAYOUT-ROOT.md)
   ================================================================================================ */

describe('J6 — css/job.css obeys the LAYOUT-ROOT conventions', () => {
  const css = JOB_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

  test('the board collapses from the STEM’S OWN PRESENCE, to exactly LAYOUT.boardCollapsedPx', () => {
    assert.ok(css.includes('.job-screen:has(.card-screen) .job-board'),
      'the collapse must key on :has(.card-screen), so a renderer cannot forget it');
    assert.ok(new RegExp(`--job-board-collapsed:\\s*${LAYOUT.boardCollapsedPx}px`).test(css),
      `the collapsed height must be data/job.js LAYOUT.boardCollapsedPx (${LAYOUT.boardCollapsedPx})`);
    assert.ok(/block-size:\s*var\(--job-board-collapsed\)/.test(css));
    assert.ok(/max-block-size:\s*var\(--job-board-collapsed\)/.test(css));
    assert.ok(css.includes('.job-screen:has(.card-screen) .job-board-body { display: none; }'),
      'the rows are removed from flow, so nothing clipped can sit on the card');
  });

  test('every box that decides columns is its own @container, and NOT a viewport query', () => {
    for (const sel of ['.job-board', '.job-panel', '.job-beat']) {
      assert.ok(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*container-type:\\s*inline-size`).test(css),
        `${sel} must be a query container (it is hosted at a width the viewport does not know)`);
    }
    assert.equal((css.match(/@media\s*\([^)]*min-width/g) ?? []).length, 0,
      'no viewport width query may decide a column in this file');
    assert.ok((css.match(/@container job \(/g) ?? []).length >= 2, 'the columns are decided by @container job');
  });

  test('every grid that holds words has a ch floor and a one-column fallback', () => {
    const decls = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
    assert.ok(decls.length >= 4, `expected several grids, saw ${decls.length}`);
    for (const d of decls) {
      if (!/minmax\(/.test(d)) continue;                        // fixed tracks (var(--tap), 2.5ch) need no floor
      assert.ok(!/minmax\(\s*0\s*,/.test(d), `a 0px floor on a text track: ${d}`);
      assert.ok(/minmax\(\s*min\(100%,\s*[\d.]+ch\s*\)/.test(d), `no ch floor (or no min(100%,…) guard): ${d}`);
    }
  });

  test('nothing is position: fixed (the tile mint stays the only full-screen moment — G10 #13)', () => {
    assert.ok(!/position:\s*fixed/.test(css));
  });

  /* ---- round 1 fixes: the decision, the brief and the rail are all LAYOUT promises ---- */

  test('the payout beat rides the fold, offset by the dock the screen MEASURES', () => {
    // G1 counts BAG / PUSH nine times a job. Shipped, the payout line rendered at y = 1016 and BAG
    // at y = 1100 in an 812 px viewport: the decision was off-screen and the dock's PUSH was the
    // only control at rest. `sticky`, not `fixed`, so G10 #13 is untouched.
    assert.ok(/\.job-beat\s*\{[^}]*position:\s*sticky/.test(css), 'the beat must be sticky');
    /* ROUND 3: the rule is now `bottom: calc(var(--job-dock-h, 0px) + var(--kb, 0px))` — it clears
       the dock AND the on-screen keyboard's inset (`widgets/base.js keyboardInset()` publishes
       `--kb`; a sticky box's `bottom` is measured from the LAYOUT viewport's floor, which a keyboard
       does not move, so without that term the beat sat ~100–260 px under the keys). The assertion
       reads the same claim off the new form: the offset is MEASURED, never a constant. */
    const beat = /\.job-beat\s*\{[^}]*bottom:\s*([^;]+);/.exec(css)?.[1] ?? '';
    assert.ok(/var\(--job-dock-h/.test(beat),
      `it must clear card.js’s dock by the measured height, not by a guessed constant (bottom: ${beat || 'absent'})`);
    assert.ok(!/\b\d+px\s*\+|\+\s*\d+px\b/.test(beat.replace(/var\([^)]*\)/g, '')),
      `a guessed constant crept into the beat's offset: ${beat}`);
    assert.ok(/var\(--kb/.test(beat),
      'and the keyboard inset too — a sticky bottom is measured from the layout viewport, which an '
      + 'open keyboard does not move. WHERE that term is measured is not claimed here: it is '
      + 'asserted by the next test, because "qa/job-screen.mjs rule 6 measures this" was true of '
      + 'exactly one phone and read as though it were true of all of them.');
    assert.ok(/--job-dock-h:\s*0px/.test(css), 'and the fallback is 0px when there is no dock');
    assert.ok(CODE.includes('syncDockOffset'), 'screens/job.js measures the dock into that property');
    assert.ok(/getElementById\('dock'\)/.test(JOB_JS), 'measured off the real element');
  });

  /**
   * THE NET UNDER THE `--kb` TERM, MEASURED — its width, and the belief it used to rest on.
   * (verify round 3, layout-safari MAJOR.)
   *
   * The assertion above used to end "(qa/job-screen.mjs rule 6 measures this)", full stop. Rule 6's
   * own loop is `for (const [vh, withKb] of [[667, false], [812, false], [667, true]])` with the
   * width pinned to `PHONE_W`, so the keyboard pass runs at 375x667 and nowhere else — one phone,
   * cited as though it were the net. Nothing else in the repo can stand in: `qa/audit-states.mjs`'s
   * `job-payout-kb` sets `--kb: 0px` and `data-kb = closed` ON PURPOSE, so rule 6's third pass is
   * the only keyboard-open measurement of this beat that exists. That is asserted below, which is
   * what makes the width coverage load-bearing rather than trivia.
   *
   * AND THE TWO HARNESSES BELIEVED OPPOSITE THINGS. Rule 6's comment says the keyboard is up at the
   * payout beat "because tapping submit does not blur the field"; `qa/audit-states.mjs:979-1004`
   * says `card.js lockAll()` runs first, so there is nothing focused for a keyboard to be open for,
   * and the state THROWS if any field is still editable when it gets there. The code settles it and
   * `audit-states` is right: `screens/card.js`'s grade path calls `lockAll()`, which calls
   * `e.w.lock(true)` on every entry and then moves focus to the Continue button. So the keyboard
   * pass is a CONSERVATIVE check of a state the student is not in — worth running, not worth
   * believing a reason for — and `site/css/job.css`'s own claim that "`screens/card.js` never blurs
   * on grade" is the same refuted belief, filed as a Request in notes/repair-tests.md.
   *
   * WHY THE WIDTH MATTERS, measured by the round-3 critic with a real visual-viewport keyboard
   * (layout viewport unchanged, `--kb` published by the app's own `keyboardInset()`), chromium and
   * webkit identical to the pixel:
   *
   *     375x667   fold 331   --kb 336   beat  89..270   payout 102..147   dock 270..331   PASS
   *     320x568   fold 232   --kb 336   beat −38..183   payout −25.. 20   dock 171..232
   *               → the beat's top is 38 px ABOVE y = 0 and 25 of the payout line's 45 px are
   *                 clipped off the TOP. The beat is 221 px tall against a 232 px band, so no
   *                 `bottom` offset can make it fit.
   *
   * 320x568 is `qa/layout-audit.mjs` VP_ALL row 1 and `qa/audit-states.mjs` VP_KB row 4, and 336 is
   * the repo's own KB_PX. So the remedy is `.job-beat` SHRINKING when `100dvh - var(--kb)` is under
   * its own height — a `site/css/job.css` change — and rule 6 running at every width in its own
   * REACH_VPS. Neither file is this lane's. What this lane can do is stop the citation overstating
   * its net and make the coverage a number that has to be maintained: the uncovered widths may only
   * SHRINK from here, and the day rule 6 covers them this test goes red and someone deletes the
   * exemption rather than leaving a stale comment behind.
   */
  test('the `--kb` net is ONE phone wide, that number is pinned, and the "submit does not blur" belief behind it is refuted by card.js', () => {
    const QA = read('qa/job-screen.mjs');
    const STATES_SRC = read('qa/audit-states.mjs');
    const CARD_SRC = read('site/js/screens/card.js');

    /* ---- 1. the code closes the keyboard itself: lockAll locks every entry and takes focus ---- */
    const lockAll = /function lockAll\(\)\s*\{([\s\S]*?)\n {2}\}/.exec(CARD_SRC)?.[1] ?? '';
    assert.ok(lockAll, 'screens/card.js no longer defines lockAll() — the belief below cannot be settled');
    assert.ok(/e\.w\.lock\(true\)/.test(lockAll),
      'card.js lockAll() no longer locks every entry widget — if a field survives the grade, the '
      + 'payout beat really does arrive with the keyboard up and qa/audit-states.mjs job-payout-kb '
      + 'must go back to pinning an inset');
    assert.ok(/contBtn\.focus/.test(lockAll),
      'card.js lockAll() no longer moves focus off the field at the grade');
    assert.ok(/lockAll\(\);/.test(CARD_SRC), 'nothing calls lockAll() — the grade path has been rewritten');
    assert.match(STATES_SRC, /the app closes the keyboard itself/,
      'qa/audit-states.mjs no longer states which side of the contradiction it measured');
    assert.match(STATES_SRC, /STILL editable at the payout beat/,
      'job-payout-kb no longer THROWS when a field survives to the beat — its "no keyboard here" '
      + 'reasoning would then be an assumption rather than an assertion');

    /* ---- 2. rule 6's keyboard pass is the ONLY keyboard-open measurement of this beat ---- */
    assert.match(STATES_SRC, /--kb', '0px'|setProperty\('--kb', '0px'\)/,
      'job-payout-kb no longer forces `--kb: 0px`, so it may now be a second keyboard-open '
      + 'measurement of the beat — re-scope the coverage assertion below before trusting it');

    /* ---- 3. the coverage, read out of the harness rather than described ---- */
    const loopLine = QA.split('\n').find((l) => l.includes('const [vh, withKb] of'));
    assert.ok(loopLine, 'qa/job-screen.mjs rule 6 no longer loops `[vh, withKb]` — re-read its shape');
    const passes = JSON.parse(loopLine.slice(loopLine.indexOf('[['), loopLine.lastIndexOf(']]') + 2));
    const ruleWidth = Number(/setViewportSize\(\{ width: (\d+), height: vh \}\)/.exec(QA)?.[1] ?? NaN);
    assert.equal(ruleWidth, LAYOUT.phoneWidthPx,
      `rule 6 sets its viewport to width ${ruleWidth}; LAYOUT.phoneWidthPx is ${LAYOUT.phoneWidthPx}`);
    const kbHeights = passes.filter(([, withKb]) => withKb).map(([vh]) => vh);
    assert.ok(kbHeights.length > 0, 'rule 6 no longer runs a keyboard pass at all — the `--kb` term has no net');

    const reachLine = QA.split('\n').find((l) => l.startsWith('const REACH_VPS'));
    assert.ok(reachLine, 'qa/job-screen.mjs no longer declares REACH_VPS');
    const reach = [...reachLine.matchAll(/\[\s*(PHONE_W|\d+)\s*,\s*(\d+)\s*\]/g)]
      .map((m) => [m[1] === 'PHONE_W' ? LAYOUT.phoneWidthPx : Number(m[1]), Number(m[2])]);
    assert.ok(reach.length >= 4, `REACH_VPS parsed as ${JSON.stringify(reach)} — the sweep's own list has changed shape`);

    /** every viewport the file itself calls a phone, minus the ones the keyboard pass visits */
    const covered = new Set(kbHeights.map((h) => `${ruleWidth}x${h}`));
    const uncovered = reach.filter(([w, h]) => !covered.has(`${w}x${h}`)).map(([w, h]) => `${w}x${h}`);
    /* MEASURED TODAY: the keyboard pass runs at 375x667 only, so three of REACH_VPS's four are
       unmeasured — and 320x568 is the one the round-3 measurement above FAILS at. This list may
       only shrink. When rule 6 grows to cover a width, delete it from here in the same edit. */
    const KNOWN_UNCOVERED = ['320x568', '360x740', '844x390'];
    for (const vp of uncovered) {
      assert.ok(KNOWN_UNCOVERED.includes(vp),
        `rule 6's keyboard pass has stopped covering ${vp}. The \`--kb\` term on \`.job-beat\` is `
        + 'measured by that pass and by nothing else in this repo, so narrowing it leaves the term '
        + 'unverified at a phone the sweep itself walks');
    }
    assert.ok(uncovered.length < reach.length,
      'rule 6\'s keyboard pass covers none of REACH_VPS — the `--kb` term is measured at no viewport '
      + 'the reach sweep visits');
    assert.equal(covered.size, 1,
      `rule 6 now measures the keyboard at ${covered.size} viewports (${[...covered].join(', ')}). That is `
      + `the repair layout-safari asked for — delete the widths it now covers from KNOWN_UNCOVERED `
      + '(and, if 320x568 is among them, it will fail on the numbers in this test\'s docblock until '
      + '`.job-beat` can shrink inside `100dvh - var(--kb)`)');
  });

  test('the board collapses at the BRIEF too, and the brief’s primary is pinned', () => {
    // The sheet sprang back to ~280 px between targets and the brief panel opened under it, which
    // put "Skip" ~680 px below an 812 px fold. `[data-phase]` is render()’s own attribute.
    assert.ok(css.includes('.job-screen[data-phase="brief"] .job-board-body { display: none; }'),
      'the brief collapses the sheet the same way call-lock does');
    assert.ok(/\.job-brief > \.run-actions\s*\{[^}]*position:\s*sticky/.test(css),
      'the brief’s primary has to stay on screen through a 900 px panel');
  });

  test('…and so is the BOARD’s primary, which is the button every job starts with', () => {
    /* ROUND 1 VERIFICATION (layout-safari, MAJOR + MAJOR). Measured at rest, scrollY 0, in both
       engines to the pixel: `.job-primary` at y 1011–1099 on a 375x667 phone (344 px below the
       fold) and 1023–1134 at 320x568 (455 px). The file had applied this exact remedy twice — the
       brief above, and `.job-beat` — and `grep -n 'job-start' css/job.css` returned nothing.
       `tests/_job-reach.mjs` measures the rectangle; this pins the rule that produces it. */
    const rule = /\.job-start > \.run-actions\s*\{([^}]*)\}/.exec(css);
    assert.ok(rule, '.job-start > .run-actions has no rule at all');
    assert.match(rule[1], /position:\s*sticky/, 'sticky, not fixed (G10 #13 keeps the tile mint the only full-screen moment)');
    assert.match(rule[1], /bottom:\s*calc\(var\(--job-dock-h, 0px\) \+ var\(--kb, 0px\)\)/,
      'the same measured dock offset and keyboard inset the brief and the beat already clear');
    assert.ok(!/position:\s*fixed/.test(css), 'still nothing in the file is fixed');
  });

  test('the clipped draft list carries an affordance, at the phase where the list IS the decision', () => {
    /* ROUND 1 VERIFICATION (player-feel, MAJOR): at 375x667 the sheet is a 251 px window onto a
       502 px list — A and B whole, C sliced through its own text, D and E not on screen — with no
       gradient, no scrollbar and no count. The 264 px cap itself stays: it is G6's published sheet
       and `qa/job-screen.mjs` measures it AT THIS PHASE (`sheetCheck('the board phase')`), so
       uncapping it here would turn a shipped rule red. What was missing is the affordance. */
    /* ROUND 2 VERIFICATION (layout-safari, MAJOR; player-feel, MAJOR): both affordances were scoped
       to `[data-phase="board"]`, which is the phase where the sheet is LARGEST. At the staked beats,
       where `--job-board-fit` makes it smallest, there was nothing at all:
       `job-envelope 320×568 h=80 client=78 scrollH=677 rows=5 whole=0 shadows=none teach=null` — an
       11 % window onto the list, not one contract row whole, and no cue that it scrolls. So the
       shadow lives on the BASE rule (its `local` covers are content-driven, so it costs nothing
       where the list fits) and the count is a live element inside the sheet rather than a sentence
       that exists only while the draft does. */
    const base = /\n\.job-board\s*\{([\s\S]*?)\n\}/.exec(css);
    assert.ok(base, 'the base .job-board rule is readable');
    assert.ok((base[1].match(/gradient\(/g) ?? []).length >= 4,
      'the scroll shadow is two `local` covers over two shadows — that is what makes it vanish at the ends');
    assert.match(base[1], /scrollbar-width:\s*thin/, 'and the sheet admits it scrolls');
    const phaseScoped = /\.job-screen\[data-phase="board"\] \.job-board\s*\{([^}]*)\}/.exec(css);
    assert.ok(!phaseScoped || !/gradient\(/.test(phaseScoped[1]),
      'the scroll shadow must not be scoped back to the draft — that is the defect this replaced');
    assert.ok(/take \$\{board\?\.draft \?\? 3\} of these \$\{rows\.length\}/.test(JOB_JS),
      'the teach line names how many contracts there are — the count is what the clip takes away');
    // …and the LIVE remainder, which is the part the teach line cannot carry once the draft is over
    assert.match(css, /\.job-board-more\s*\{[^}]*position:\s*sticky/, 'the count rides the sheet’s own bottom edge');
    assert.ok(/more\.textContent !== text/.test(JOB_JS), 'and it is written only when it changes (the mutation loop)');
    assert.ok(/\$\{below\} more ↓/.test(JOB_JS), 'the count names how many rows are below the clip');
  });

  test('the sheet has two measured states UNDER its floor, and both are the narrow form’s', () => {
    /* ROUND 2 VERIFICATION (layout-safari, two MAJORs). The third term floors at
       `LAYOUT.boardCollapsedPx`, and two measurements showed the floor is not the end of it:
       a 78 px sheet slices a contract row through its own glyphs (`whole=0`), and at 320×568 with
       the browser's text size at 20 px the floor itself still left the call row 16 px below the
       fold in both engines. `tests/_job-reach.mjs` rules 5 and 6 measure both; this pins the
       mechanism that produces them. */
    assert.ok(/data-boardfit="strip"/.test(css) && /data-boardfit="off"/.test(css),
      'css/job.css declares both measured states');
    const off = /\.job-screen\[data-boardfit="off"\] \.job-board\s*\{([^}]*)\}/.exec(css);
    assert.ok(off, 'the `off` state is readable');
    /* `display: none`, NOT a zero-height clip. The first form of this rule clipped the sheet to
       `block-size: 0; overflow: hidden` so its rows stayed measurable, and `qa/layout-audit.mjs`
       rule 2 graded it `BLOCKER zero-track — grid child collapsed to 0.0px tall but carries text`
       at 320x568@zoom20 in both themes. A list clipped to nothing is still read aloud in full. */
    assert.match(off[1], /display:\s*none/, 'the `off` state removes the sheet from the layout');
    assert.ok(!/block-size:\s*0/.test(off[1]), 'and never as a 0px box that still carries its text');
    assert.ok(/boardNeed\s*=/.test(JOB_JS) && /boardNeed > 0/.test(JOB_JS),
      'so the row height that re-opens it is cached, not re-measured from inside the closed state');
    const strip = /\.job-screen\[data-boardfit="strip"\] \.job-board\s*\{([^}]*)\}/.exec(css);
    assert.ok(strip && /var\(--job-board-collapsed\)/.test(strip[1]),
      'the strip is the same published 36 px line call-lock already takes');
    // both are the narrow form's: above --job-rail-at the board is a rail with no decision under it
    const narrowBlocks = css.split(/@container jobscreen \(max-width:/).slice(1);
    assert.ok(narrowBlocks.some((b) => b.includes('[data-boardfit="off"]')),
      'the measured states are inside a narrow-form container query');
    // and the screen writes them from a measurement, never from a phase name
    assert.ok(/root\.dataset\.boardfit = state/.test(JOB_JS), 'screens/job.js writes the state it measured');
    assert.ok(/function boardFitState/.test(JOB_JS) && /boardNeed/.test(JOB_JS),
      'and the threshold is a measured row height, not a typed constant');
    assert.ok(!/boardFitState\([^)]*\)\s*\{[^}]*data-phase/.test(JOB_JS), 'the decision reads no phase name');
  });

  test('the ≥1024 px rail EXISTS, is @container-driven, and the collapse is scoped to the narrow form', () => {
    // COMPOSED-GAME G6: "≥ 1024 px: the board lives in the 320 px right rail, permanently visible."
    // That sentence shipped with no rule behind it — the board was one 36 px line at every width.
    assert.ok(/@container jobscreen \(min-width:\s*\d+px\)/.test(css), 'the rail is a container query');
    assert.ok(/@container jobscreen \(max-width:\s*[\d.]+px\)/.test(css),
      'and the collapse belongs to the narrow form, or the rail would collapse too');
    const rail = /@container jobscreen \(min-width:[^)]*\)\s*\{([\s\S]*?)\n\}/.exec(css);
    assert.ok(rail, 'the rail block is readable');
    assert.ok(/grid-template-columns:[^;]*var\(--job-rail\)/.test(rail[1]), 'the board gets its own track');
    assert.ok(/--job-rail:\s*var\(--rail\)/.test(css), 'and that track is theme.css’s own 320 px rail token');
    // the collapse rules must be INSIDE the narrow block, not beside it
    const narrow = /@container jobscreen \(max-width:[^)]*\)\s*\{([\s\S]*?)\n\}/.exec(css);
    assert.ok(narrow && narrow[1].includes('.job-screen:has(.card-screen) .job-board'),
      'the :has() collapse is scoped to the narrow form');
    // and the DOM the rail needs is the screen's own, so no renderer decides a width
    assert.ok(/h\('div\.job-main'/.test(JOB_JS) && /h\('div\.job-body'/.test(JOB_JS),
      'screens/job.js builds .job-body / .job-main — the two-column form is CSS alone');
    assert.ok(/container-name:\s*run jobscreen/.test(css),
      'the screen keeps polish.css’s `run` name (the debrief IS a Page Summary) and adds its own');
  });

  test('text colour is only ever an ink token, so both themes clear 4.5:1 by construction', () => {
    const fills = ['--gold', '--ok', '--bad', '--warn', '--almost', '--violet', '--bronze', '--silver', '--plat'];
    for (const m of css.matchAll(/(?:^|[;{\s])color:\s*var\((--[a-z0-9-]+)\)/g)) {
      const token = m[1];
      assert.ok(!fills.includes(token), `${token} is a FILL token and may never be a color: (theme.css "FILL vs INK")`);
    }
  });

  test('exactly the six cues of data/job.js ANIMATION, all transform/opacity, all <= 600 ms', () => {
    const frames = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    assert.equal(frames.length, ANIMATION.cues.length, `expected ${ANIMATION.cues.length} keyframes, saw ${frames.join(' ')}`);
    for (const cue of ANIMATION.cues) {
      assert.ok(frames.includes(`job-${cue.id}`), `the "${cue.id}" cue has no keyframe`);
      // the cue's own duration, as the stylesheet actually plays it
      const used = new RegExp(`animation:[^;]*job-${cue.id}\\s+(\\d+)ms`).exec(css);
      assert.ok(used, `job-${cue.id} is declared but never played`);
      assert.equal(Number(used[1]), cue.ms, `job-${cue.id} plays at ${used[1]}ms, spec says ${cue.ms}ms`);
      assert.ok(Number(used[1]) <= ANIMATION.maxMs);
    }
    // every animated property is transform or opacity — nothing that costs a layout
    const bodies = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    for (const b of bodies) {
      for (const p of [...b.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1])) {
        assert.ok(p === 'transform' || p === 'opacity', `keyframes animate "${p}" — transform/opacity only`);
      }
    }
    assert.ok(!/transform:[^;]*rotate/.test(css), 'no rotate on the envelope (G11 killed the tilt)');
  });

  test('reduced motion zeroes every duration and keeps every colour', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
    assert.ok(block, 'job.css states its own reduced-motion rule');
    assert.ok(/animation-duration:\s*0s/.test(block[1]));
    assert.ok(!/color:/.test(block[1]), 'reduced motion must not change a colour');
  });
});

/* ================================================================================================
   5. The keys, the copy and the pure helpers
   ================================================================================================ */

describe('J6 — keyboard-complete, and every string comes from data/job.js COPY', () => {
  test('the seven verbs are bound from KEYS, never from a literal', () => {
    for (const k of ['KEYS.draft', 'KEYS.call', 'KEYS.push', 'KEYS.bag', 'KEYS.crack', 'KEYS.walk', 'KEYS.commit']) {
      assert.ok(CODE.includes(k), `${k} is not read by the screen`);
    }
    assert.ok(CODE.includes('KEYS.tokens'), 'PRESS is on the arrows, read from KEYS.tokens (G1)');
    assert.deepEqual([...KEYS.tokens], ['ArrowLeft', 'ArrowRight']);
    assert.deepEqual([...KEYS.call], ['1', '2', '3', '4']);
    assert.deepEqual([...KEYS.draft], ['1', '2', '3', '4', '5']);
    assert.equal(KEYS.bag, 'b'); assert.equal(KEYS.crack, 'k'); assert.equal(KEYS.walk, 'w');
    assert.equal(KEYS.commit, 'c'); assert.equal(KEYS.push, 'Enter');
  });

  test('the screen composes no user-facing sentence of its own', () => {
    // every printed line is a COPY.* call; the only bare strings left are labels and aria text
    for (const key of ['envelope', 'clear', 'miss', 'bagPrompt', 'bag', 'guard', 'walk', 'callIt', 'collapsedBoard']) {
      assert.ok(CODE.includes(`COPY.${key}(`), `COPY.${key} is never printed`);
    }
    /* TWO EXCEPTIONS, both struck for the SAME reason and both replaced by the same function.
       `COPY.evidence` went first (round 3, call-propriety) and `COPY.vault` follows it (round 1
       verification, player-feel): each prints a make's own record as a bare fraction, which
       composes with Settings' published `evMaxBands()` into the single call rung Global law 6
       bans — `7/9 → q̂ 0.7778 → argmaxCall 70`, and the coarse band the envelope prints straddles
       the 70/85 boundary at exactly that q̂, which is the whole of why the band is safe and the
       fraction is not. Their replacement is `evidenceWordsOf`, below, via `vaultLineOf`.
       A one-line rewording of the `COPY.vault` entry would let the table own that sentence again —
       notes/repair-screen.md Request 2, for `site/data/job.js`'s owner. */
    for (const key of ['evidence', 'vault']) {
      assert.ok(!CODE.includes(`COPY.${key}(`),
        `COPY.${key} prints the raw hits/of — a surface that composes back into the EV-max rung`);
    }
    const vaultFn = CODE.slice(CODE.indexOf('function vaultLineOf'), CODE.indexOf('function envelopeLinesOf'));
    assert.ok(/evidenceWordsOf\(/.test(vaultFn), 'the vault line prints the coarse band instead');
    assert.ok(!/\bhits\b/.test(vaultFn.replace(/qHat\.of|qHat\b/g, '')), 'and never reads the hit count');
  });

  test('the vault line prints the band and never the fraction, at either of its two surfaces', () => {
    /* ROUND 1 VERIFICATION (player-feel, MAJOR): the getaway printed `FAC2 grade 3 · your last 9:
       7/9 · crack breaks even at 0.00` one tap before an envelope that deliberately printed only
       `clear rate 69 %–84 %` for the same make. Both of this screen's call sites now go through
       `vaultLineOf`, so the claim is asserted over the function every `of` in the window can
       reach — the same shape as the envelope's own test above. */
    for (let of = 1; of <= 12; of++) {
      for (let hits = 0; hits <= of; hits++) {
        const line = screen.vaultLineOf({ make: 'FAC2', grade: 3, qHat: { qHat: hits / of, hits, of }, breakeven: '0.43' });
        assert.ok(!new RegExp(`\\b${hits}\\s*/\\s*${of}\\b`).test(line), `the vault line prints the fraction: "${line}"`);
        assert.ok(!new RegExp(`\\b${of}\\b`).test(line.replace('grade 3', '')), `the vault line prints the window size: "${line}"`);
      }
    }
    assert.equal(screen.vaultLineOf({ make: 'FAC2', grade: 3, qHat: { qHat: 0.9, hits: 9, of: 10 }, breakeven: '0.43' }),
      `FAC2 grade 3 · ${screen.evidenceWordsOf(0.9)} · crack breaks even at 0.43`);
    assert.equal(screen.vaultLineOf({ make: 'FAC2', grade: 3, qHat: { qHat: null, hits: 0, of: 0 }, breakeven: null }),
      'FAC2 grade 3 · no history yet', 'no history, and no threshold to quote: neither is faked');
  });

  /* ------------------------------------------------------------------------------------------
     R3 · GLOBAL LAW 6, BY COMPOSITION — the string the SCREEN paints, not a primitive beside it
     ------------------------------------------------------------------------------------------ */

  test('no pre-call line this screen paints decodes to a single call rung', async () => {
    /* The round-2 test in tests/job-call.test.mjs checks `evidenceBandOf(hits/of)` — a function.
       This checks the SENTENCE, rendered by the shipped `envelopeLinesOf`, which is what round 3
       found still printing `your last 10 on FAC2: 7/10` while `evidenceBands()` had no caller at
       all (`grep -rn evidenceBand site/js/screens site/js/app.js` → nothing). */
    const call = await import('../site/js/job/call.js');
    const env = { make: 'FAC2', name: 'Factoring a > 1', grade: 2, cold: 1.2, posted: 40, from: 'F', tell: null, n: 1, of: 10 };
    const seen = new Map();
    for (let of = 1; of <= call.RATING.qHatWindow; of++) {
      for (let hits = 0; hits <= of; hits++) {
        const qHat = hits / of;
        const line = screen.envelopeLinesOf(env, { qHat, hits, of }).evidence;
        assert.ok(!new RegExp(`\\b${hits}\\s*/\\s*${of}\\b`).test(line),
          `the envelope still prints the raw fraction: "${line}"`);
        if (!seen.has(line)) seen.set(line, new Set());
        seen.get(line).add(qHat);
      }
    }
    /* VERIFY r3 (player-feel, MAJOR). There is now a FOURTH sentence: a record too one-sided to
       carry any weight gets its own line INSTEAD of a band, because `INFORMATIVE_MIN` cuts at
       q̂ = 0.9330127 — strictly inside the top band — so the band alone could not tell a call that
       counts from one worth exactly 0, and 60 % of the calls on this repo's own mid-week fixture
       are the second kind. That sentence is NOT a band: it is the union of BOTH tails, so the
       region it denotes is `[0, 0.06699) ∪ (0.93301, 1]` and it must be checked over that union,
       not over one band. Doing so makes this arm STRICTER, not looser — it is the only sentence
       here whose region is disconnected, and if it ever collapsed onto one tail it would name a
       rung (50 on the low tail, 95 on the high one) and this loop would catch it. */
    const regionOf = (qs) => {
      const bands = [...new Set([...qs].map((q) => call.evidenceBandOf(q)))]
        .map((i) => call.evidenceBands()[i]);
      const measures = call.evidenceOf([...qs][0]).measures;
      return { bands, measures };
    };
    for (const [line, qs] of seen) {
      const { bands, measures } = regionOf(qs);
      const evMax = new Set(); const honest = new Set();
      for (const b of bands) {
        for (let k = 0; k <= 200; k++) {
          const q = b.from + ((b.to - b.from) * k) / 200;
          /* a blank sentence denotes only the non-measuring part of the bands it touches, and a
             band sentence only the measuring part — the two never overlap, which is the point */
          if (call.evidenceOf(q).measures !== measures) continue;
          evMax.add(call.argmaxCall(q)); honest.add(call.honestCall(q));
        }
      }
      assert.ok(evMax.size >= 2 && honest.size >= 2,
        `"${line}" decodes to the single rung ${[...evMax]} / ${[...honest]}`);
      // …and every q̂ that prints it agrees about whether the call is a measurement at all
      for (const q of qs) assert.equal(call.evidenceOf(q).measures, measures, `"${line}" is two states`);
      // a MEASURING sentence is still a pure function of one band; the blank one spans both tails
      if (measures) assert.equal(bands.length, 1, `"${line}" spans two bands`);
      else assert.equal(bands.length, 2, `the blank sentence "${line}" resolved to a single tail`);
    }
    assert.equal(seen.size, call.evidenceBands().length + 1,
      'one sentence per band, plus the one blank-record sentence shared by BOTH tails');
    assert.equal(screen.envelopeLinesOf(env, { qHat: null, hits: 0, of: 0 }).evidence, 'no history on FAC2 yet');
    // and the blank sentence names no rung, no fraction and no window size
    const blank = screen.evidenceWordsOf(1);
    assert.equal(blank, screen.evidenceWordsOf(0), 'the two tails must print the SAME sentence');
    assert.ok(!/\d/.test(blank), `the blank sentence carries a numeral: "${blank}"`);
  });

  test('…and the window count is not printed beside it, which is what made the band honest', () => {
    /* The band is coarse over the CONTINUUM. Over the reachable grid `hits/of` it is not: at
       `of = 10` band 0 is EV-max 50 alone and band 2 is 95 alone; at `of = 4` all three bands are
       singletons. So `of` is the carrier, and no pre-call surface prints it. */
    const env = { make: 'FAC2', name: 'x', grade: 2, cold: 0, posted: 10, from: 'F', tell: null, n: 1, of: 10 };
    for (const of of [1, 3, 4, 7, 10]) {
      const line = screen.envelopeLinesOf(env, { qHat: 0.9, hits: Math.round(0.9 * of), of }).evidence;
      assert.ok(!new RegExp(`\\b${of}\\b`).test(line), `the window size ${of} is printed: "${line}"`);
    }
    /* ROUND 3: the row reads `int(qh.of, 0) > 0` as its "is there any history" guard, which the old
       token test (`!/qh\.of|\bhits\b/`) could not tell from PRINTING the fraction. The claim is
       about what reaches the line, so that is what is asserted: nothing named `hits`, and `of`
       readable only as the guard — never inside an interpolation. */
    const rawRow = JOB_JS.slice(JOB_JS.indexOf('function thresholdRow'), JOB_JS.indexOf('function relabelContinue'));
    assert.ok(!/\$\{[^}]*\b(hits|qh\.of|\.of)\b[^}]*\}/.test(rawRow),
      'the bag/push row interpolates a window count into its line — it is a pre-call surface too');
    assert.ok(!/\bhits\b/.test(rawRow), 'the row reads the hit count at all');
    assert.equal([...rawRow.matchAll(/qh\.of/g)].length, 1, '`of` is read more than once — only the guard may');
    assert.match(rawRow, /int\(qh\.of, 0\) > 0/, 'and that one read is the has-history guard');
    assert.ok(/evidenceWordsOf\(/.test(rawRow), 'it prints the same coarse band as the envelope');
  });

  test('collapsedLineOf is COPY.collapsedBoard, about the TARGET — its wing, its tokens, its multiplier', () => {
    /* ROUND 2 (player-feel, MAJOR: "the one line on screen while you answer lies about your
       tokens"). It printed `g.guard.wing` — the GUARDED wing, whatever target was live — and, as
       the ⟨n⟩, the SUM over every wing: a target on RECALL with one token of three read
       `WORDS ⟨3⟩`, the wrong wing beside a count that was nobody's. While a stem is up this is the
       only line the job still owns. */
    const g = { guard: { wing: 'WORDS', mult: 0.55 }, tokens: { WORDS: 1, RECALL: 1, ALGEBRA: 1 }, loose: 24, chain: 1 };
    const line = screen.collapsedLineOf(g, 'RECALL');
    assert.equal(line, COPY.collapsedBoard({ wing: 'RECALL ×1.25', tokens: 1, loose: 24, mult: '1.2', chain: 1 }),
      'the published template, fed the target’s own wing, that wing’s own tokens and that wing’s own multiplier');
    assert.ok(line.startsWith('RECALL '), 'the wing being answered leads the line');
    assert.ok(!line.includes('⟨3⟩'), 'the ⟨n⟩ is that wing’s count, never the sum over wings');
    assert.equal(1 + GUARD.tokenBonus * 1, 1.25, 'and ×1.25 is GUARD.tokenBonus, not a typed constant');
    assert.ok(line.length <= 48, `the 36 px line is ${line.length} chars — it has to fit a 375 px phone`);

    // the guarded wing: G3.4 voids the tokens on it and the guard's own multiplier is what pays
    const guarded = screen.collapsedLineOf(g, 'WORDS');
    assert.match(guarded, /^WORDS guarded ×0\.55 ⟨0⟩ · loose 24/);
    /* the guarded form is 3 chars over the 48 the unguarded one fits, and the CSS ellipsis takes
       them off the TAIL (`chain 1`, which the header carries anyway). What must survive is the wing
       clause, so that is what is pinned rather than a length the honest line cannot meet. */
    assert.ok(guarded.slice(0, 24).includes('×0.55'), 'the multiplier survives the ellipsis');

    // with no priced target to read, the line falls back to the guard's wing — never to a made-up one
    assert.equal(screen.collapsedLineOf(g), guarded);
  });

  test('payoutLineOf prints COPY.clear on a clear and COPY.miss on a miss', () => {
    const clear = screen.payoutLineOf({ ok: true, delta: 24, chain: 1, credit: 9.9, w: 0.36 }, null, 0.11);
    assert.equal(clear, COPY.clear({ loose: 24, chain: 1, credit: 0.11, w: 0.36 }),
      'the published template, with the MEASURED rating move where the credit used to be');
    const miss = screen.payoutLineOf({ ok: false, delta: -12, chain: 0, target: { make: 'FAC2', tell: { tag: 'dropped-gcf' } } }, null, -0.2);
    assert.equal(miss, COPY.miss({ make: 'FAC2', tell: 'dropped-gcf', loose: 12, chain: 0 }));
    assert.equal(screen.payoutLineOf({ free: true }, null), '');
  });

  /* ------------------------------------------------------------------------------------------
     R1-VERIFY · THE PAYOUT LINE IS ABOUT THE RATING, MEASURED — not about the button pressed
     ------------------------------------------------------------------------------------------ */

  test('the numeral beside the word “rating” is the rating’s own measured move, on a FULL window', async () => {
    /* ROUND 1 VERIFICATION (player-feel, BLOCKER): the line printed `p.credit` — `call.creditOf`,
       a pure function of which BUTTON was pressed — under the word "rating". `rating +9.1` beside
       a measured move of +0.1085 is 84×, on a 0–10 scale whose rank bands are 1.1–1.5 wide. This
       drives the SHIPPED machine: `applyTarget` writes `player.rating.value` from the window it has
       just pushed, so the move is the difference across the one call, eviction included — which is
       exactly what the screen reads either side of its own `update()` (see `applyResult`). */
    const call = await import('../site/js/job/call.js');
    const mk = (n, at) => Array.from({ length: n }, (_, i) => call.callEntry({ call: 70, ok: (i % 10) < 7, qHat: 0.7, skill: 'FAC2', at: at + i }));
    for (const slots of [0, 10, 50]) {                    // below the window, and AT it (the failing case)
      let calls = mk(slots, 0);
      const before = call.ratingDetail(calls, 50);
      const entry = call.callEntry({ call: 85, ok: true, qHat: 0.9, skill: 'FAC2', at: 9999 });
      calls = call.windowPush(calls, entry, { N: 50 });
      const after = call.ratingDetail(calls, 50);
      const move = after.value - before.value;
      const line = screen.payoutLineOf({ ok: true, delta: 91, chain: 2, credit: call.creditOf(85, true), w: entry.w }, null, move);
      const printed = /rating ([+−])(\d+(?:\.\d+)?)/.exec(line);
      assert.ok(printed, `no rating figure in "${line}"`);
      const value = (printed[1] === '−' ? -1 : 1) * Number(printed[2]);
      assert.ok(Math.abs(value - move) <= 0.005 + 1e-9,
        `${slots} slots: the line says rating ${printed[1]}${printed[2]}, the rating moved ${move.toFixed(4)} — "${line}"`);
      assert.ok(!line.includes(String(call.creditOf(85, true))),
        `the credit of the button pressed is still printed as a rating: "${line}"`);
    }
  });

  test('…and END-TO-END through applyTarget, which is where the screen reads it', async () => {
    /* The screen's assumption, pinned in the machine: `player.rating.value` either side of one
       `state.applyTarget` IS the rating's move over that target (`applyTarget` rewrites it from
       `call.ratingDetail` after the window push — state.js). If a writer ever stops keeping that
       field in step with the window, this fails instead of the line quietly going stale. */
    const { freshen } = await import('../qa/fixtures/audit-build.mjs');
    const cards = await import('../site/data/cards.js');
    const call = await import('../site/js/job/call.js');
    const save = freshen(JSON.parse(read('qa/fixtures/audit/midweek.json')));
    /* a FULL 50-slot window: the state where the round-3 sentence became false */
    const p = save.player ?? (save.player = {});
    p.rating = p.rating ?? { calls: [], value: 5, n: 0 };
    p.rating.calls = [];
    for (let i = 0; i < 50; i++) {
      p.rating.calls = call.windowPush(p.rating.calls, call.callEntry({ call: 70, ok: (i % 10) < 7, qHat: 0.7, skill: 'FAC2', at: i }), { N: 50 });
    }
    const d0 = call.ratingDetail(p.rating.calls, 50);
    p.rating.value = d0.value; p.rating.n = d0.n; p.rank = d0.rank;

    const now = Date.now();
    const started = state.startJob(save, { now, cards: cards.byId });
    assert.ok(started && !started.error, `startJob refused: ${JSON.stringify(started)}`);
    state.beginTargets(save, { now, cards: cards.byId });
    let measured = 0;
    for (let n = 0; n < 4 && state.targetsLeft(save) > 0; n++) {
      const avail = state.callsAvailable(save);
      const id = avail[Math.min(2, avail.length - 1)];
      if (!state.canLockCall(save, id)) break;
      state.lockCall(save, id, { now, cards: cards.byId });
      const before = save.player.rating.value;
      const res = state.applyTarget(save, { cleared: n % 3 !== 0, firstTry: true, hints: 0, attempt: 1 }, { now, cards: cards.byId });
      const move = save.player.rating.value - before;
      const line = screen.payoutLineOf(res, null, move);
      const printed = /rating ([+−])(\d+(?:\.\d+)?)/.exec(line);
      if (printed) {
        const value = (printed[1] === '−' ? -1 : 1) * Number(printed[2]);
        assert.ok(Math.abs(value - move) <= 0.005 + 1e-9,
          `"${line}" against a measured move of ${move.toFixed(4)}`);
        measured++;
      }
      assert.ok(!/unchanged/.test(line), `"${line}" claims the rating is unchanged`);
      if (state.targetsLeft(save) > 0 && state.bagPrompt(save)) state.push(save, { now });
    }
    assert.ok(measured >= 2, `only ${measured} lines carried a rating figure — the rule measured nothing`);
  });

  test('a BLANK slot says what is true of the SLOT, and never that the rating is unchanged', async () => {
    /* ROUND 1 VERIFICATION (player-feel, BLOCKER): "rating unchanged · no measurement" is false on
       every full window — `windowPush` keeps 50 slots and `ratingDetail` divides by 50, so a blank
       slot scores 0 AND evicts an informative call. Ten of them walked a real window 7.6880 →
       7.1504, across a rank boundary, printing "unchanged" every time. */
    /* ROUND 2 VERIFICATION (player-feel, MAJOR) — and the conjunction was the new defect. The
       repair above implemented BOTH halves of its finding at once, so the shipped line read
       `+213 loose · chain 5 · rating −0.22 · this call was not a measurement`: a signed rating move
       beside a sentence saying the call measured nothing, on 6 of the 10 targets of the board the
       game recommends. Both halves are true and neither explains the other, so the line now prints
       the CAUSE between them — and prints no number at all when there is no eviction to attribute
       it to, because a blank slot scores 0 against a FIXED divisor and can move the rating by no
       other route. */
    const call = await import('../site/js/job/call.js');
    let calls = Array.from({ length: 50 }, (_, i) => call.callEntry({ call: 70, ok: (i % 10) < 7, qHat: 0.7, skill: 'FAC2', at: i }));
    const blank = call.callEntry({ call: 70, ok: true, qHat: 0.99, skill: 'FAC2', at: 1e6 });
    /* the fixture is blank BY THE SHIPPED GATE, not by a field: `callEntry` writes a non-informative
       call as `p: null, q: null` and stores no `w` at all (call.js round-4), so the only sound test
       of "this is a blank slot" is that the shipped scorer counts no measurement in it. */
    assert.equal(call.ratingDetail([blank], 50).n, 0, 'the fixture really is a blank slot');
    assert.equal(call.ratingDetail(calls, 50).n, 50, 'and the window it is pushed onto is all measurements');
    const before = call.ratingDetail(calls, 50);
    calls = call.windowPush(calls, blank, { N: 50 });
    const after = call.ratingDetail(calls, 50);
    const move = after.value - before.value;
    assert.ok(Math.abs(move) > 0.1, `the control: a blank slot on a full window moves the rating (${move.toFixed(4)})`);
    const line = screen.payoutLineOf({ ok: true, delta: 25, chain: 1, credit: 6.4, w: 0 }, null, move);
    assert.ok(!/unchanged/.test(line), `the line still claims the rating is unchanged: "${line}"`);
    assert.ok(!/×0\b/.test(line), 'and no ×0 is rendered (round 3 keeps its half of the repair)');
    assert.equal(line,
      `+25 loose · chain 1 · not a measurement — its slot pushed an older call out · rating −${Math.abs(Math.round(move * 100) / 100)}`);
    /* THE CONJUNCTION ITSELF, as a rule rather than as one string: a signed rating move and the bare
       claim may never stand side by side with nothing joining them. */
    assert.ok(!/rating [+−][\d.]+ · this call was not a measurement/.test(line),
      `"${line}" prints a rating move beside a flat "not a measurement"`);
    // with nothing measured, nothing is claimed about the rating at all (a reload onto the beat)
    assert.equal(screen.payoutLineOf({ ok: true, delta: 25, chain: 1, credit: 6.4, w: 0 }, null, null),
      '+25 loose · chain 1 · this call was not a measurement');
    /* …and a blank slot on a window that is NOT yet full moves the rating by exactly 0 — the
       divisor is the fixed 50 — so the line says the one true thing and prints no number. */
    const short = Array.from({ length: 9 }, (_, i) => call.callEntry({ call: 70, ok: (i % 10) < 7, qHat: 0.7, skill: 'FAC2', at: i }));
    const v0 = call.ratingDetail(short, 50).value;
    const v1 = call.ratingDetail(call.windowPush(short, blank, { N: 50 }), 50).value;
    assert.equal(v1 - v0, 0, 'the control: no eviction, no move');
    assert.equal(screen.payoutLineOf({ ok: true, delta: 25, chain: 1, credit: 6.4, w: 0 }, null, v1 - v0),
      '+25 loose · chain 1 · this call was not a measurement');
    assert.equal(screen.payoutLineOf({ ok: true, delta: 25, chain: 1, credit: 6.4, w: 0.9 }, null, null),
      '+25 loose · chain 1 · weight 0.9', 'an informative slot with no measured move prints no rating');
  });

  test('a miss into an EMPTY pile names the make and the tell and stops — never “−0 loose”', () => {
    /* ROUND 1 VERIFICATION (player-feel, MAJOR): `COPY.miss` hardcodes the minus, and `econ.settle`
       caps the loss at the pile — so a miss after the pile is empty printed `−0 loose`, six of ten
       payout lines on one full shipped job. G6's own voice rule for this line is "a miss names the
       make, the tell and the number and stops"; with no number it stops one field earlier. */
    const miss0 = screen.payoutLineOf({ ok: false, delta: 0, chain: 0, target: { make: 'FAC2', tell: { tag: 'dropped-gcf' } } }, null, -0.2);
    assert.equal(miss0, 'FAC2 · tell: dropped-gcf · chain 0');
    assert.ok(!/0 loose/.test(miss0), 'no zero-valued loss is printed');
    // the ordinary miss is untouched, and still the copy table's own sentence
    assert.equal(screen.payoutLineOf({ ok: false, delta: -19, chain: 0, target: { make: 'FAC2', tell: { tag: 'dropped-gcf' } } }, null, -0.2),
      COPY.miss({ make: 'FAC2', tell: 'dropped-gcf', loose: 19, chain: 0 }));
  });

  test('the beat suppresses a bag that banks nothing AND breaks nothing, and the q* of 0 with it', () => {
    /* The three zero-valued surfaces of one shipped job — `bag 0 (fee 0 · chain 0 → 0)` seven times
       of nine, `breaks even at q 0.00` seven times — are gated in `renderPayout` / `thresholdRow`,
       which are inner functions of the mount; these are their gates, pinned in the source, and
       `tests/_job-reach.mjs` plus notes/repair-screen.md carry the driven measurements. */
    assert.match(CODE, /const bagPays = num\(prompt\?\.amount, 0\) > 0 \|\| int\(prompt\?\.chainBefore, 0\) > 0/,
      'a 0-value bag on a LIVE chain still ends the chain, so only the doubly-empty case is suppressed');
    // these two carry string literals, which `strip` blanks — so they are read off the raw source
    assert.match(JOB_JS, /nextBeat === 'bagpush' && bagPays/, 'the BAG button is gated on it');
    assert.match(JOB_JS, /qStar > 0 \? ` · breaks even at q/, 'and so is the threshold clause');
    assert.ok(/job-nobag/.test(JOB_JS), 'the beat says which number is zero instead of printing three of them');
    const nobag = JOB_JS.slice(JOB_JS.indexOf('job-nobag'), JOB_JS.indexOf('job-nobag') + 220);
    assert.ok(!/PUSH|BAG/.test(nobag), 'and names neither verb — that would be the recommendation law 6 bans');
  });

  /* ------------------------------------------------------------------------------------------
     R1-VERIFY · THE PRIMARY BUTTON DESCRIBES THE DRAFT ON SCREEN, not the recommendation
     ------------------------------------------------------------------------------------------ */

  test('quoteFor prices EVERY legal draft as itself, and reproduces board.primary for the recommendation', async () => {
    /* ROUND 1 VERIFICATION (split-honesty, MAJOR): `postBoard` composes `primary` and `projection`
       ONCE, from `board.recommend`, and the sheet then lets the student toggle any 3 of 5 — so on
       450 of 450 non-recommended drafts of a 50-save corpus the button printed the wrong letters,
       the posted value was out by up to 58, the wall clock by more than 3 minutes on 15 of 360
       played-out drafts and the split by 5.8 points. The button is re-derived per render now.

       Two claims, and the second is what keeps the two composition sites from drifting: for the
       RECOMMENDED picks this function must reproduce `board.primary` and `board.projection`
       byte-for-byte, so a change to board.js's own segment list fails here. */
    const boardMod = await import('../site/js/job/board.js');
    const { freshen } = await import('../qa/fixtures/audit-build.mjs');
    const raw = repoPath('qa/fixtures/audit/midweek.json');
    if (!existsSync(raw)) { assert.fail('qa/fixtures/audit/midweek.json is missing — it is a tracked fixture'); }
    const save = freshen(JSON.parse(read('qa/fixtures/audit/midweek.json')));
    const evening = new Date(); evening.setHours(19, 30, 0, 0);

    let boards = 0; let priced = 0; let identical = 0;
    for (let jobIndex = 0; jobIndex < 20; jobIndex++) {
      // one save, twenty pinned seeds: twenty different boards, drafts and recommendations
      const board = boardMod.postBoard(save, undefined, { now: evening.getTime(), jobIndex });
      if (!board?.recommend || (board.drafts ?? []).length < 2) continue;
      boards++;
      const rec = screen.quoteFor(save, board, board.recommend.picks);
      assert.ok(rec, `jobIndex ${jobIndex}: the screen could not price the board's own recommendation`);
      assert.equal(rec.primary, board.primary, `jobIndex ${jobIndex}: the screen's button is not board.js's own`);
      assert.equal(rec.projection, board.projection, `jobIndex ${jobIndex}: the projection line drifted`);
      for (const d of board.drafts) {
        const q = screen.quoteFor(save, board, d.picks);
        const truth = boardMod.draftFrom(board.bundles, d.picks, { x2: board.x2.marks });
        assert.equal(q.label, truth.label, `the letters on the button are not the ones drafted (${d.picks.join('')})`);
        assert.equal(q.line, truth.line, `the posted value is not the drafted one (${d.picks.join('')})`);
        assert.equal(q.targets, truth.queue.length);
        assert.ok(q.primary.includes(` ${truth.label} `) && q.primary.includes(truth.line),
          `the button does not carry the draft's own letters and payout: "${q.primary}"`);
        priced++;
        if (q.primary === board.primary) identical++;
      }
      // …and an empty draft quotes the recommendation, because that is what `buildJob` will start
      assert.equal(screen.quoteFor(save, board, []).primary, board.primary);
    }
    assert.ok(boards >= 20, `only ${boards} boards had a draft to price`);
    assert.ok(priced >= 100, `only ${priced} drafts priced`);
    assert.ok(identical < priced,
      'every draft printed the SAME button — then this test cannot tell a re-priced button from a frozen one');
    assert.equal(screen.quoteFor(null, null, ['A']), null, 'no board, no quote — never a made-up one');
  });

  test('chainTicksOf is CHAIN’s own ladder (amber at 5, violet at 8, cap x2.6)', () => {
    assert.deepEqual(screen.chainTicksOf(0), { n: 0, of: CHAIN.ticks, tone: 'flat', mult: 1 });
    assert.equal(screen.chainTicksOf(CHAIN.tickAmber).tone, 'amber');
    assert.equal(screen.chainTicksOf(CHAIN.tickViolet).tone, 'violet');
    assert.equal(screen.chainTicksOf(20).mult, CHAIN.multCap);
    assert.equal(screen.chainTicksOf(20).n, CHAIN.ticks);
  });

  test('the last target has no bag/push beat (G1: nine beats for ten targets)', () => {
    const save = (left, stakes = true) => ({ inProgress: { queue: new Array(10).fill({}), idx: 10 - left, game: { stakes } } });
    assert.equal(screen.beatAfter(save(3)), 'bagpush');
    assert.equal(screen.beatAfter(save(0)), 'finish');
    assert.equal(screen.beatAfter(save(3, false)), 'next', 'a no-stakes target has no bag/push');
  });

  test('the token press cannot exceed GUARD.tokens, and the guard bars come from guard.js', () => {
    assert.ok(CODE.includes('GUARD.tokens'), 'the cap is read, not re-typed');
    assert.ok(/total > GUARD\.tokens/.test(CODE), 'a fourth token is refused by the screen too');
    assert.ok(CODE.includes('guardMod.guardBars('), 'the published odds are guard.js’s own bars');
    assert.equal(GUARD.tokens, 3);
  });
});

/* ================================================================================================
   5b. The three numbers the screen was printing wrong (round 1)
   ================================================================================================ */

describe('J6 — q*, the crew order and the idle clock are the student’s own numbers', () => {
  test('the BAG/PUSH threshold is computed at THIS target’s ρ̄, never at the ρ̄ = 1 bound', async () => {
    // G3.2 quotes its table "at ρ̄ = 1 (the optimistic bound; the app computes ρ̄ per target from
    // your own rung distribution and prints the true threshold)". `econ.breakevenQ` falls back to
    // ρ̄ = 1 when it is handed no `rungs`, and this screen handed it none — so the printed q* was
    // the brochure's bound on every target, always.
    assert.equal((CODE.match(/econ\.breakevenQ\(/g) ?? []).length, 1, 'one place computes q*');
    const call = CODE.slice(CODE.indexOf('econ.breakevenQ('), CODE.indexOf('function breakevenLabel'));
    assert.match(call, /rungs:\s*state\.crew\.bandFor\(state\.crew\.mShownOf\(/,
      'the rung distribution is the make’s own band (G2 reads it from save.cards[*].history)');
    assert.match(call, /crew:[\s\S]*?crewInfo\?\.forgives/,
      'and the crew rank is the one the payout will honour — BARE on a target that is its own review');
  });

  test('…and that argument actually moves the number (the fix is not decorative)', async () => {
    const econ = await import('../site/js/job/econ.js');
    const crew = await import('../site/js/job/crew.js');
    const at = (extra) => econ.breakevenQ({ loose: 400, chain: 4, call: 85, tier: 4, ...extra });
    const bound = at({});                                   // ρ̄ = 1, what the screen used to print
    const own = at({ rungs: crew.bandFor(60) });            // an m60 make's own distribution
    assert.ok(Math.abs(own - bound) > 0.005,
      `ρ̄ has to change the threshold: bound ${bound.toFixed(3)} vs own ${own.toFixed(3)}`);
    assert.ok(own > bound, 'a real ρ̄ is below 1, so the true threshold is HARDER than the bound');
    // and the crew rank is part of it, or the idle rule would be invisible in the printed number
    assert.notEqual(at({ rungs: crew.bandFor(40), crew: 1 }), at({ rungs: crew.bandFor(40), crew: 0 }));
  });

  /**
   * THE WHOLE PRICED TARGET, not four fields of it (notes/econ-fix.md "Requests to other owners" 1,
   * notes/tests-fix.md "Requests" 5 — filed by two lanes in round 2, neither of which owned this
   * file). `state.pricedTarget` carries `scopeFlags`, `bucket`, `overdueDays`, `tell`, `tokens`,
   * `guarded`, `rank` and `x2`, and round 2 made `econ.gainLFor` / `lossLFor` read every one of
   * them. While the call site picked fields off the target, the printed q* was the BARE-target
   * threshold on a cold tagged review on the guarded wing: 52.5 % of realistic states flip a
   * verdict somewhere on q ∈ [0.3, 0.9], worst gap 0.750.
   */
  test('q* is computed from the PRICED TARGET, not from four fields of it', async () => {
    const call = CODE.slice(CODE.indexOf('econ.breakevenQ('), CODE.indexOf('function breakevenLabel'));
    assert.match(call, /\.\.\.t\s*,/, 'the priced target is spread into econ.breakevenQ');
    // the spread must come FIRST, or it clobbers the two explicit arguments round 1 added
    assert.ok(call.indexOf('...t') < call.indexOf('rungs:'),
      'the spread goes before `rungs`/`crew`, so the explicit arguments still win');
    // and it is not decorative: the fields that only arrive with the spread move the number
    const econ = await import('../site/js/job/econ.js');
    const base = { loose: 400, chain: 4, call: 85, tier: 4 };
    const bare = econ.breakevenQ(base);
    const priced = econ.breakevenQ({ ...base, scopeFlags: { cold: true }, bucket: 1, overdueDays: 6, tell: { live: true }, guarded: true, x2: true });
    assert.notEqual(bare, priced,
      `the scope/tell/guard fields have to reach the threshold: bare ${bare} vs priced ${priced}`);
  });

  /**
   * THE GRADE BAND. `page.js` composes `gradeLabel` (`grade N` or `grade N–M`) over the bundle's own
   * tiers and `tests/job-board.test.mjs` asserts the board's printed row carries it; the screen
   * hand-built the row from `b.grade`, which is `Math.min(...tiers)`, so on a real board every row
   * read "grade 1" while holding grade-2/3/4 locks — 3 answer-minutes against 0.5, on the one column
   * that makes a 3-of-5 draft a real choice. notes/board-fix.md "Requests" 1, filed in BOTH rounds.
   */
  test('the contract row prints the grade BAND the board composed, not the floor tier', () => {
    const row = JOB_JS.slice(JOB_JS.indexOf('function contractRow'), JOB_JS.indexOf('function toggleDraft'));
    assert.ok(row.includes('b.gradeLabel'), 'the row renders the board’s own gradeLabel');
    assert.ok(!/grade \$\{b\.grade \?\? 1\} ·/.test(row),
      'the bare floor-tier form is gone from the rendered row');
  });

  test('the q* line prints at the beat it is a threshold for (Settings: "before every bag-or-push")', () => {
    assert.ok(/thresholdRow\(/.test(CODE), 'the payout beat carries the threshold');
    // `strip()` blanks string literals, so the class name is checked against the raw source
    assert.ok(/job-qstar/.test(JOB_JS) && /job-qstar/.test(JOB_CSS), 'and it has a class the harness can measure');
    // it is evidence, not a recommendation: no verb, and Global law 6 is still structural above
    const row = CODE.slice(CODE.indexOf('function thresholdRow'), CODE.indexOf('function relabelContinue'));
    for (const banned of ['bag now', 'should', 'recommend', 'best']) {
      assert.ok(!row.toLowerCase().includes(banned), `the threshold row must not advise (${banned})`);
    }
  });

  test('the brief’s crew block is ordered by crew.crewOrder — the only allocable surface there is', () => {
    // crew.js documents `crewOrder` as "the crew grid's recommended order" and nothing outside
    // crew.js called it; the brief listed makes in QUEUE order, so G3.8 step 5 was unfollowable
    // without doing `w · (1 − m/100)` by hand.
    /* VERIFY-2 (crew lane, finding 2 — one line in this file, recorded in notes/repair-crew.md).
       The grid now calls `crew.reallocatable`, which IS `crewOrder` over the board's makes UNION
       the makes the save already has a point on (`crew.js`: "same order, more rows", pinned in
       `tests/job-align.test.mjs` §10). Without it a point spent on a make tonight's board does not
       serve could not be handed back tonight either, because `save.game.crew` persists across jobs
       and this grid is the only control — and the median make is offered on 15.7 % of drafted
       boards. The property this arm is about is unchanged: the rows are in the STUDY ORDER, not in
       queue order. */
    assert.ok(/state\.crew\.(crewOrder|reallocatable)\(/.test(CODE),
      'the brief orders by crewValue (crewOrder, or reallocatable which is crewOrder over more makes)');
    assert.ok(/state\.crew\.crewValueDetail\(/.test(CODE), 'and prints the sort key that ordering IS');
    const block = CODE.slice(CODE.indexOf('function crewBlock'), CODE.indexOf('function setCrewRank'));
    assert.match(block, /state\.crew\.reallocatable\(s,\s*\{\s*shape,\s*of:\s*onBoard\s*\}\)/,
      'and the grid offers the makes a point can be handed back on, not the board\'s alone');
    assert.ok(block.indexOf('reallocatable') < block.indexOf('for (const make of makes)'),
      'the order is decided before the rows are built');
  });

  test('the debrief is handed the BEFORE snapshot, which is what carries the independent clock', async () => {
    // `state.debriefOf` derives `wall = tGame + tAnswer`, so an idle computed from the debrief alone
    // is x − x (round 1, split-honesty). run.js owns the fix — `captureJobBefore` stamps
    // `startedAt` on the snapshot and `jobWallMs(before)` measures it — and the ONE thing this
    // screen has to do for it is keep handing `before` through, which is easy to lose because the
    // snapshot is held across `endJob` purely for the skill bars.
    assert.match(CODE, /jobSummaryContext\(getState\(\),\s*d,\s*\{[^}]*before:\s*jobBefore/,
      'the debrief passes the held snapshot, not a rebuilt one');
    assert.ok(/captureJobBefore\(/.test(CODE), 'and the snapshot is taken by run.js’s own capture');
    // and it must still be run.js that owns the split line (J8): the screen computes none
    assert.ok(!/sessionSplit\(/.test(CODE), 'the screen must not compute a second split line');
    const run = await import('../site/js/screens/run.js');
    const base = { tGame: 120000, tAnswer: 300000 };
    assert.equal(run.sessionSplit(base, null, { wall: 423500 }).idle, 3500, 'a real gap reads the gap');
    assert.equal(run.sessionSplit(base, null, {}).idle, 0, 'and an unmeasured job prints no gap');
  });
});

/* ================================================================================================
   5c. Round 2 — the sentences the screen printed that were not true, and the two beats it skipped
   ================================================================================================ */

describe('J6 — the payout ladder line only claims a forgiveness that was applied', () => {
  const rec = (rung, forgives, rho) => ({
    ok: true, free: false, rung, rho, delta: 29,
    target: { make: 'FAC2', crewInfo: { make: 'FAC2', rank: forgives, effective: forgives, forgives, name: ['', 'STEADY', 'HELD'][forgives] } },
  });

  test('a BARE make says why ρ moved and stops — no crew clause at all', () => {
    // shipped: `attempt 2 · crew VOC forgives one · ρ 0.45 · +10 loose` on a save with no crew,
    // naming the MAKE where G6's table names the RANK, beside a ρ that disproves the claim.
    const line = screen.ladderLineOf(rec(2, 0, 0.45));
    assert.equal(line, 'attempt 2 · ρ 0.45 · +29 loose');
    assert.ok(!/crew|forgiv/.test(line), `a bare make claimed a crew: ${line}`);
    assert.equal(screen.ladderLineOf(rec(1, 0, 0.7)), 'hint · ρ 0.70 · +29 loose', 'rung 1 is a HINT, not "attempt 1"');
  });

  test('STEADY prints G6’s published sentence, with the RANK in the crew slot', () => {
    const line = screen.ladderLineOf(rec(2, 1, 0.7));
    assert.equal(line, COPY.ladder({ attempt: 2, crew: 'STEADY', rho: '0.70', loose: 29 }));
    assert.match(line, /crew STEADY forgives one/);
    assert.ok(!line.includes('FAC2'), 'the make is not the rank');
  });

  test('HELD’s two rungs are named, never rounded down to "one"', () => {
    const line = screen.ladderLineOf(rec(3, 2, 0.7));
    assert.match(line, /crew HELD forgave 2 rungs/);
    assert.ok(!/forgives one/.test(line));
  });

  test('a clean clear and a miss still print no ladder line at all', () => {
    assert.equal(screen.ladderLineOf(rec(0, 1, 1)), '');
    assert.equal(screen.ladderLineOf({ ...rec(2, 1, 0.7), ok: false }), '');
    assert.equal(screen.ladderLineOf({ free: true }), '');
  });
});

describe('J6 — finalWordOf is state.advance()’s word, term for term', () => {
  const save = (queueLen, g) => ({ inProgress: { queue: new Array(queueLen).fill({}), idx: queueLen, game: { stakes: true, ...g } } });

  test('a vault CRACKED and MISSED is KNOCKED, not cracked (G1 "Knocked")', () => {
    // shipped: `records.cracked`, the debrief, `game.log` and the "1 per vault cracked" Backcheck
    // all counted the failure as a success, and OUTCOMES.KNOCKED was unreachable in the app.
    assert.equal(screen.finalWordOf(save(7, { last: { ok: false } })), state.OUTCOMES.KNOCKED);
    assert.equal(screen.finalWordOf(save(7, { last: { ok: true } })), state.OUTCOMES.CRACKED);
    assert.equal(screen.finalWordOf(save(1, { last: { ok: true } })), state.OUTCOMES.COMPLETED,
      'a one-target job has no getaway beat');
  });

  test('the 22:00 close is QUIET22, and CALL IT is still CALLED', () => {
    assert.equal(screen.finalWordOf(save(7, { stakes: false, quiet: true })), state.OUTCOMES.QUIET22);
    assert.equal(screen.finalWordOf(save(7, { stakes: false })), state.OUTCOMES.CALLED);
  });

  test('and it agrees with state.advance() on a real job driven to its last target', () => {
    // the two are one decision with two heads; this pins them to the same table rather than to
    // each other's source
    for (const [len, g, want] of [
      [7, { last: { ok: false } }, 'knocked'], [7, { last: { ok: true } }, 'cracked'],
      [1, { last: { ok: true } }, 'completed'], [7, { stakes: false, quiet: true }, 'quiet22'],
    ]) assert.equal(screen.finalWordOf(save(len, g)), want);
  });
});

/**
 * A save with a LIVE job, composed by the shipped machine — the board a student is actually looking
 * at when the brief's crew grid renders. Built here (round 3) because the crew grid's claim is about
 * a BOARD, and a test of that claim that never composes one is a test of a string.
 */
const { fresh } = await import('../site/js/store.js');
const { applyOutcome: applySchedule, DAY_MS } = await import('../site/js/schedule.js');
const { rngFrom } = await import('../site/js/rng.js');
const { todayISO, addDays } = await import('../site/js/days.js');
const { cards: ALL_CARDS } = await import('../site/data/cards.js');
const { isBonus } = await import('../site/data/source-manifest.js');

const JOB_NOW = new Date(2026, 8, 16, 18, 0).getTime();
const JOB_TODAY = todayISO(new Date(JOB_NOW));
const JOB_BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

function jobSaveFor(i) {
  const rng = rngFrom('j6-crew-board', i);
  const sv = fresh(JOB_NOW - (4 + rng.int(0, 20)) * DAY_MS);
  sv.profileId = `j6-crew-${i}`;
  sv.settings.testDate = addDays(JOB_TODAY, 4 + rng.int(0, 12));
  for (let k = 0; k < 30 + rng.int(0, 20); k++) {
    const c = JOB_BANK[rng.int(0, JOB_BANK.length - 1)];
    let rec = null;
    for (let r = 0; r < 3; r++) rec = applySchedule(sv, c.id, rng.chance(0.75) ? 'clean' : 'wrong', { now: JOB_NOW - (30 - r * 4) * DAY_MS });
    if (!rec) continue;
    rec.cleared = true;
    rec.rarity = 'gold';
    rec.due = JOB_NOW + (rng.chance(0.7) ? -rng.float(0, 9) : rng.float(0.2, 12)) * DAY_MS;
    rec.history = Array.from({ length: 8 }, (_, h) => ({ at: JOB_NOW - (20 - h) * DAY_MS, ok: rng.chance(0.75), attempt: 1, hints: 0, ms: 9000 }));
  }
  for (const k of ['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG', 'PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q',
    'SEG-ALG', 'CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX']) {
    if (!rng.chance(0.8)) continue;
    sv.skills[k] = { m: rng.int(10, 95), n: rng.int(1, 9), lastAt: JOB_NOW - rng.int(1, 20) * DAY_MS, lastDueCorrectAt: null };
  }
  try { state.startJob(sv, { today: JOB_TODAY, now: JOB_NOW }); } catch { return null; }
  return state.queueOf(sv).length ? sv : null;
}

describe('J6 — the brief ships all five of G1’s options, and the crew grid prices tonight', () => {
  test('the swap is rendered from state.swapOptions and taken through state.brief({swap})', () => {
    // `grep -rn 'swapOptions|canSwap' site/js/` found ZERO call sites: the window shipped four of
    // its five published options while the debrief printed DECISIONS.briefOptionsMax = 5's "35".
    assert.ok(/state\.swapOptions\(/.test(CODE), 'the brief reads the bench');
    /* ROUND 4: the row STAGES the swap and `submitBrief` sends it, so the action literal moved from
       the row's own `onclick` into the one `takeBrief` call that carries the whole window. Both
       halves are pinned, because a row that stages nothing and a submit that drops the staging are
       two different ways to lose the option. */
    assert.ok(/stageBrief\(\{\s*swap:\s*on\s*\?\s*null\s*:\s*\{\s*id/.test(CODE),
      'the row stages the swap (and a second tap takes it back off the table)');
    assert.ok(/\.\.\.\(st\.swap\s*\?\s*\{\s*swap:\s*\{\s*id:\s*st\.swap\.id\s*\}\s*\}\s*:\s*null\)/.test(CODE),
      'and the submit passes it to state.brief as its own `swap` action');
    const brief = CODE.slice(CODE.indexOf('function renderBrief'), CODE.indexOf('function crewBlock'));
    assert.ok(brief.includes('swapRows('), 'the option list carries the swap row');
    assert.ok(/DECLINE_PRICE/.test(CODE), 'the declined price is data/job.js’s constant, not a typed 15');
  });

  /* ------------------------------------------------------------------------------------------
     R4-VERIFY · A BRIEF WINDOW TAKES ANY SUBSET, IN ONE `state.brief` CALL
     ------------------------------------------------------------------------------------------ */

  test('every control STAGES, and one submit sends the window — "any subset" is reachable', async () => {
    /* ROUND 4 VERIFICATION (exploit-hunt, MAJOR). Every control in `renderBrief` called
       `takeBrief(<one action>)`, and `state.brief`'s last act is `setPhase(g, …)` — so the FIRST
       option taken closed the window and the other four were refused (`not-at-brief: envelope`).
       Driven: `takeBrief({swap})` → `took = ["swap"]`, window shut, second option refused. G1
       publishes "Any subset, Enter to skip" over five options and `DECISIONS.briefOptionsMax` feeds
       the debrief's "35 if you use every optional window"; the ceiling the screen could reach on its
       own basis was `mandatory + 1·briefs + COMMIT` = 27 on a JOB-10. */
    const { DECISIONS } = await import('../site/data/job.js');
    const brief = CODE.slice(CODE.indexOf('function renderBrief'), CODE.indexOf('function swapRows'));

    // (1) nothing but `submitBrief` may close the window, and the submit builds ONE action object
    assert.equal((CODE.match(/takeBrief\(/g) ?? []).length, 2,
      'exactly two mentions of takeBrief: its own declaration and the ONE call inside submitBrief');
    assert.match(brief, /const took = takeBrief\(actions\)/, 'and that call carries the whole window');
    for (const [what, re] of [
      ['re-press', /\.\.\.\(m\.atomic \? \{ repress: m\.tokens \} : null\)/],
      ['swap', /\{ swap: \{ id: st\.swap\.id \} \}/],
      ['crew', /\{ crew: \{ make: st\.crew\.make, rank: st\.crew\.rank \} \}/],
      ['commit', /\{ commit: st\.commit \}/],
      ['tell', /\{ tell: true \}[\s\S]{0,120}\{ tell: false \}/],
    ]) {
      assert.match(brief, re, `the submitted action object carries the ${what} option`);
    }

    // (2) the machine really does take all five together — otherwise (1) proves nothing
    const at = (() => { for (let i = 0; i < 16; i++) { const w = toBriefWindow(i); if (w) return w; } return null; })();
    assert.ok(at, 'no brief window could be composed');
    const sv = at.save;
    const before = state.stateOf(sv);
    const windowsBefore = before.briefs.length;     // `before` is the LIVE record — read the count now
    const tokens = { ...before.tokens };
    const wings = Object.keys(tokens);
    const down = wings.find((w) => Number(tokens[w] ?? 0) > 0);
    const up = wings.find((w) => w !== down);
    const swap = (state.swapOptions(sv)[0] ?? null);
    const queue = state.queueOf(sv).slice(state.idxOf(sv));
    const make = [...new Set(queue.map((it) => state.crew.makeOf(it)).filter(Boolean))]
      .find((mk) => state.crew.canAllocate(sv, mk, 1).ok) ?? null;
    const actions = {
      ...(down && up ? { repress: { ...tokens, [down]: tokens[down] - 1, [up]: Number(tokens[up] ?? 0) + 1 } } : null),
      ...(swap ? { swap: { id: swap.id } } : null),
      ...(make ? { crew: { make, rank: 1 } } : null),
      commit: { kind: 'walk', byMin: 12 },
      tell: true,
    };
    const r = state.brief(sv, actions, { now: Date.now() });
    assert.ok(r.took.length >= 3, `one window took only ${JSON.stringify(r.took)}`);
    assert.ok(r.took.includes('commit') && r.took.includes('tell'),
      `COMMIT and the tell must land in the same window as the rest: ${JSON.stringify(r.took)}`);
    assert.equal(state.stateOf(sv).briefs.length, windowsBefore + 1,
      'and the whole subset is ONE window, not one window per option');
    assert.ok(r.took.length <= DECISIONS.briefOptionsMax,
      `a window cannot record more than DECISIONS.briefOptionsMax = ${DECISIONS.briefOptionsMax} options`);
  });

  test('every option G1 publishes has a control, and the count the debrief prints is reachable', async () => {
    const { DECISIONS } = await import('../site/data/job.js');
    const brief = JOB_JS.slice(JOB_JS.indexOf('function renderBrief'), JOB_JS.indexOf('function swapRows'));
    const opts = [/repress:/, /swap:\s*\{\s*id/, /tell: true/, /tell: false/, /commitOpen = true/];
    // the swap is rendered by swapRows(), called from the option list
    const found = opts.filter((re) => re.test(brief) || (re.source.includes('swap') && brief.includes('swapRows(')));
    assert.equal(found.length, DECISIONS.briefOptionsMax,
      `the brief renders ${found.length} of DECISIONS.briefOptionsMax = ${DECISIONS.briefOptionsMax} options`);
  });

  test('the crew grid prints what a point buys TONIGHT, and the alignment theorem’s own threshold', async () => {
    /* ROUND 3 (crew-alignment). This arm used to be four regexes over the file's own text, and the
       load-bearing one was `/state\.crew\.alignmentFor\(/` — which matches the supply-BLIND call
       `alignmentFor(s, {shape, of})` exactly as well as the correct `alignmentFor(s, {shape, of,
       queue})`. That is how the round-2 blocker (a grid claiming "the study ordering leads it ON
       THIS BOARD" having never looked at the board) shipped under a green suite.

       Three things replace it, in order of strength:
         1. the RENDERED sentence, read out of a live brief and compared with
            `crew.supplyGapFor(save, queue)` on the same board — `qa/job-screen.mjs` rule 11, run by
            the measured test at the bottom of this file, which also asserts the rule measured
            something. That is the only check that can see what the screen actually printed.
         2. the model itself, HERE: the two calls must produce different answers, or no check of any
            kind could distinguish them.
         3. a source pin that CAN tell them apart — the argument list, not the function name. */
    const crew = await import('../site/js/job/crew.js');
    const block = CODE.slice(CODE.indexOf('function crewBlock'), CODE.indexOf('function setCrewRank'));
    assert.match(block, /alignmentFor\(s,\s*\{\s*shape,\s*of:\s*onBoard,\s*queue\s*\}\)/,
      'the grid must pass the QUEUE: without it crew.js sets `supply: null` and `domain.all` drops the '
      + 'one condition that fails most (and a regex on the function name alone cannot see that)');
    assert.ok(/ownDueReviewKey|isDueReview/.test(block), 'and each row counts the targets a point could forgive');
    assert.ok(/job-crew-board/.test(JOB_JS) && /job-crew-align/.test(JOB_JS), 'both have classes a harness can measure');
    assert.ok(/job-crew-board/.test(JOB_CSS) && /job-crew-align/.test(JOB_CSS), 'and both are styled');

    /* (2) — the model. Over composed boards, the queue-aware gap and the supply-blind one must
       actually disagree; if they never did, every form of this test would be vacuous. */
    let boards = 0; let differ = 0; let zeroPay = 0;
    for (let i = 0; i < 12; i++) {
      const sv = jobSaveFor(i);
      if (!sv) continue;
      const queue = state.queueOf(sv).slice(state.idxOf(sv));
      const onBoard = [...new Set(queue.map((it) => crew.makeOf(it)).filter(Boolean))];
      if (!onBoard.length) continue;
      const shape = sv.inProgress.game?.shape ?? crew.DEFAULT_SHAPE;
      const gap = crew.supplyGapFor(sv, queue, { shape, of: onBoard });
      const blind = crew.supplyGapFor(sv, [], { shape, of: onBoard });
      boards++;
      if (gap.studySupply !== blind.studySupply || gap.studyPays !== blind.studyPays) differ++;
      if (gap.zeroPay) zeroPay++;
      /* The grid reads its sentence off `alignmentFor(...).gap`, so that must BE this gap — at the
         parameters the ROWS beside it are priced at. VERIFY-3 (player-feel): this used to pin
         `align.gap` to `supplyGapFor(save, queue, {shape})`, the PUBLISHED `CREW_MATRIX` row, while
         every row of the grid was priced at `measuredParamsOn`, and the brief printed the same make
         at 1.92 in the sentence and 1.42 in the row, 35 % apart, both labelled "pays". `crew.js`
         now passes `params` through, so the pin is the same call at the same parameters — and the
         two assertions below are strictly MORE than the old one: the gap is exactly the shipped
         call, AND re-pricing it moves only the magnitudes, never the argmaxes or the counts the
         supply condition is read off. */
      const align = crew.alignmentFor(sv, { shape, of: onBoard, queue });
      assert.deepEqual(align.gap, crew.supplyGapFor(sv, queue, { shape: align.params, of: onBoard }),
        `board ${i}: alignmentFor({queue}).gap is not supplyGapFor(save, queue) at the rows' own parameters`);
      for (const key of ['shape', 'studyTop', 'studySupply', 'gameTop', 'agrees', 'zeroPay']) {
        assert.deepEqual(align.gap[key], gap[key],
          `board ${i}: re-pricing the gap moved \`${key}\` — the parameters are a positive scale, not a model change`);
      }
      // …and the price the sentence prints IS the price the make's own row prints (one regime, one word)
      const rowOf = new Map();
      for (const o of align.options) if (o.rank === crew.STEADY && !rowOf.has(o.make)) rowOf.set(o.make, o.value);
      if (align.gap.studyTop) {
        assert.equal(align.gap.studyPays, rowOf.get(align.gap.studyTop),
          `board ${i}: the supply line prices ${align.gap.studyTop} at ${align.gap.studyPays} and its row at ${rowOf.get(align.gap.studyTop)}`);
      }
      if (align.gap.gameTop) {
        assert.equal(align.gap.gameValue, rowOf.get(align.gap.gameTop),
          `board ${i}: the supply line prices ${align.gap.gameTop} at ${align.gap.gameValue} and its row at ${rowOf.get(align.gap.gameTop)}`);
      }
      assert.ok(gap.studySupply <= queue.length, `board ${i}: supply ${gap.studySupply} on a ${queue.length}-target board`);
      // …and the blind call really does lose the supply condition
      const blindAlign = crew.alignmentFor(sv, { shape, of: onBoard });
      assert.notEqual(blindAlign.domain?.supply, true,
        `board ${i}: the supply-blind call reported a supply condition it cannot have measured`);
    }
    assert.ok(boards >= 8, `only ${boards} boards composed`);
    assert.ok(differ >= 1,
      `the queue-aware gap never differed from the supply-blind one over ${boards} boards — this test cannot fail`);
    assert.ok(zeroPay >= 1,
      `no board had the study top paying 0 on it over ${boards} boards — the case the grid exists to print never occurred`);
  });

  test('the align line prints BOTH prices and names the scale they are on — never the grid’s own column', async () => {
    /* ROUND 2 VERIFICATION (crew-alignment, MAJOR). The sentence read `a HELD point prices at 0.00
       on this list's own scale`, and this list's own scale is the column it sits above:
       `crewValueDetail(...).score` = `w · (1 − m/100)`. `align.threshold` is a BOARD price
       (`held.value / shapeConstant(measuredParamsOn(board))`), and over 200 drafted boards the same
       transform of the best STEADY point sat more than 25 % from the column's own top entry on 75
       of the 101 that printed it — `column top 5.40 · "prices at 0.00" · steady on that transform
       1.00`. `crew.js:1534` had already written down the fix ("a surface that prints `threshold`
       beside the grid's own score column should print `steadyThreshold` with it") and no screen did.

       Asserted over the shipped function on real `alignmentFor` output, not over the source: both
       numbers, the scale named for what it is, and — the part that makes the sentence readable —
       the verb agreeing with the two numbers printed beside it. */
    const crew = await import('../site/js/job/crew.js');
    /* the claim is gone from the composer itself — the paragraph above it still quotes the old
       sentence, which is why this reads the function body and not the file */
    const fn = JOB_JS.slice(JOB_JS.indexOf('export function crewAlignLineOf'));
    assert.ok(!fn.slice(0, fn.indexOf('\n}')).includes("on this list's own scale"),
      'the false scale claim is gone from the line the screen prints');
    const n2 = (x) => Number(x ?? 0).toFixed(2);
    let spoke = 0; let held = 0;
    for (let i = 0; i < 16; i++) {
      const sv = jobSaveFor(i);
      if (!sv) continue;
      const queue = state.queueOf(sv).slice(state.idxOf(sv));
      const onBoard = [...new Set(queue.map((it) => crew.makeOf(it)).filter(Boolean))];
      if (!onBoard.length) continue;
      const shape = sv.inProgress.game?.shape ?? crew.DEFAULT_SHAPE;
      /* HALF the boards get a MASTERED make on them, so the branch the finding is about actually
         runs: `canHold` is `isMastered` (m ≥ 85, n ≥ 3, a due-review clear on the record), and
         `jobSaveFor`'s random skills reach it on none of the sixteen. The other half is the control
         — with nothing buyable the line must say so and print no price at all. */
      if (i % 2 === 0) {
        sv.skills[onBoard[0]] = {
          m: 92, n: 8, lastAt: JOB_NOW - 2 * DAY_MS, lastDueCorrectAt: JOB_NOW - 2 * DAY_MS,
        };
      }
      const align = crew.alignmentFor(sv, { shape, of: onBoard, queue });
      const line = screen.crewAlignLineOf(align);
      spoke++;
      assert.ok(!/this list'?s own scale/.test(line), `board ${i}: "${line}"`);
      if (!align.held) { assert.match(line, /^no HELD point is buyable tonight/, `board ${i}: "${line}"`); continue; }
      held++;
      assert.ok(line.includes(n2(align.threshold)), `board ${i}: the HELD price is not printed: "${line}"`);
      assert.ok(line.includes(n2(align.steadyThreshold)),
        `board ${i}: the number that makes it comparable (steadyThreshold ${n2(align.steadyThreshold)}) is not printed: "${line}"`);
      assert.ok(line.includes(align.pricedOn === 'board' ? "the board's own prices" : 'model prices'),
        `board ${i}: the line does not say which prices these are: "${line}"`);
      // the verb IS the comparison of the two printed numbers, which is what `holds` is defined as
      const leads = /leads it/.test(line);
      assert.equal(leads, align.holds, `board ${i}: the verb disagrees with \`holds\`: "${line}"`);
      assert.equal(align.holds, align.steadyThreshold >= align.threshold - 1e-9,
        `board ${i}: \`holds\` is not the comparison of the two numbers the line prints`);
    }
    assert.ok(spoke >= 8, `only ${spoke} boards reached the align line`);
    assert.ok(held >= 1, `no board had a buyable HELD point over ${spoke} boards — the sentence never printed`);
    // the sentence is composed once, by the exported function the screen calls
    const block = CODE.slice(CODE.indexOf('function crewBlock'), CODE.indexOf('function setCrewRank'));
    assert.match(block, /crewAlignLineOf\(align\)/, 'the grid prints the exported line, not a copy of it');
  });
});

describe('J6 — a half-answered Today’s Page is a door, and it is shut BEFORE the board ritual', () => {
  /* ROUND 2 VERIFICATION (ledger-invariance, MAJOR). `screens/run.js:1418` puts `Another board` on
     every debrief beside a `Today's Page` button whose own condition is `left > 0` — so the two are
     offered together exactly when a page is live, and `state.js:1980` leaves it live after a walk or
     a quit. `startJob` refuses over that page (COMPOSED global rule 5), so the student tapped the
     button the debrief offered, drafted contracts, pressed tokens, pressed START — and got
     `The board could not be posted · page-in-progress: 7 left on Today's Page`.
     The refusal is right; the place it landed was not. */
  test('the refusal `startJob` throws and the predicate the screen redirects on are the same state', async () => {
    const { startPage, markItem, resumePage } = await import('../site/js/page.js');
    const { freshen } = await import('../qa/fixtures/audit-build.mjs');
    const cards = await import('../site/data/cards.js');
    const save = freshen(JSON.parse(read('qa/fixtures/audit/midweek.json')));
    delete save.inProgress;
    startPage(save, { now: Date.now() });
    for (let k = 0; k < 3; k++) markItem(save, { cleared: true }, {});
    const live = state.pageInProgress(save);
    assert.ok(live && live.left > 0, 'the fixture really has a half-answered page');
    assert.equal(resumePage(save).idx, 3, 'and the pointer really moved');
    assert.throws(() => state.startJob(save, { now: Date.now(), cards: cards.byId }),
      (e) => e.code === 'page-in-progress', 'startJob refuses exactly here');
    // …and when the page is finished, both go quiet together
    const left = state.pageInProgress(save).left;
    for (let k = 0; k < left; k++) markItem(save, { cleared: true }, {});
    assert.equal(state.pageInProgress(save), null, 'the predicate clears with the page');
  });

  test('mountJob consults it BEFORE it mounts, and redirects to the study route', () => {
    /* JOB_JS, not CODE: `stripCommentsAndStrings` removes the route literal this rule is about. */
    const mountFn = JOB_JS.slice(JOB_JS.indexOf('export function mountJob'), JOB_JS.indexOf('function mount(host'));
    assert.match(mountFn, /state\.pageInProgress\(getState\(\)\)/,
      'the screen must ask the same predicate the refusal uses, not guess at it');
    assert.match(mountFn, /navigate\('\/run\/page'\)/, 'and send the student to the page they left');
    // order matters: the check has to precede the mount, or the ritual happens first
    assert.ok(mountFn.indexOf('pageInProgress') < mountFn.indexOf('return mount(host'),
      'the page door is consulted after the mount — the board would post first');
    // and the gate is still the one authority for every OTHER refusal
    assert.match(mountFn, /jobEntryGate\(getState\(\)\)/, 'the week’s own gate is untouched');
    // the caught-throw panel stays as the backstop, but it is no longer the student’s first news
    assert.ok(/renderBroken\(e\)/.test(CODE), 'startOrGo still catches a refusal that gets past the door');
  });
});

describe('J6 — the three sentences, the hint’s price, and the two beats the screen never measured', () => {
  test('one sentence per verb, at the surface the verb first appears on', () => {
    // round 2, player-feel: "nothing teaches the game; the rulebook is Settings, written in Greek"
    for (const cls of ['job-board-teach', 'job-token-teach', 'job-call-teach']) {
      assert.ok(JOB_JS.includes(cls), `the ${cls} sentence is gone`);
      assert.ok(JOB_CSS.includes(cls), `${cls} is unstyled`);
    }
    // the sentence is a template literal, so `strip()` has blanked it — read the raw source
    assert.ok(/GUARD\.tokenBonus \* 100/.test(JOB_JS), 'the +25 % is data/job.js’s constant, not a typed number');
    assert.ok(/env\.n <= 1/.test(CODE), 'the call sentence is printed on the FIRST envelope, not on all ten');
  });

  test('a hint’s price is this target’s own, computed at rung 0 against rung 1', () => {
    // Global law 6: every price is printed before the choice it affects. card.js's rail says
    // "cost XP quality, never an attempt" — true of Ledger A, silent about the stake.
    assert.ok(/function sayHintPrice/.test(CODE), 'the screen prices the hint');
    const fn = CODE.slice(CODE.indexOf('function sayHintPrice'), CODE.indexOf('function sayHintPrice') + 1200);
    assert.ok(/econ\.settle\(/.test(fn), 'priced by the machine, never by the published 30 %');
    assert.ok(/at\(0\)/.test(fn) && /at\(1\)/.test(fn), 'the price IS rung 0 minus rung 1');
    assert.ok(/stakes === false/.test(fn), 'and a no-stakes target has no price to print');
  });

  test('…and the published 30 % is what that arithmetic produces on a bare make', async () => {
    const econ = await import('../site/js/job/econ.js');
    const t = { posted: 42, call: 85, tier: 2, crew: 0, idle: false, bucket: 1, overdueDays: 4 };
    const clean = econ.settle({ ...t, rung: 0 }, 3, 100).delta;
    const hint = econ.settle({ ...t, rung: 1 }, 3, 100).delta;
    assert.ok(clean > hint, 'a hint costs something');
    assert.ok(Math.abs((clean - hint) / clean - 0.30) < 0.02, `G3 says 30 %; the ladder pays ${((clean - hint) / clean * 100).toFixed(1)} %`);
  });

  test('the screen enters the "guard" phase, so phaseMeans.guard is a measurement', () => {
    // split-honesty: board → envelope was the only path any screen took, `g.ph.guard` was never
    // written, `foldMean` returns early on a zero observation, and the board added a permanent 12 s
    // constant on top of a `means.board` that had already absorbed the press.
    assert.ok(/state\.tick\(s, 'guard'/.test(JOB_JS), 'the start path ticks into the phase it publishes a mean for');
    assert.ok(/function touchPress/.test(CODE), 'and the boundary is the student’s own first touch of the press');
  });

  test('every phase PHASE_MEANS_DEFAULT claims to measure is reachable from the screen’s own calls', async () => {
    const { PHASE_MEANS_DEFAULT } = await import('../site/data/job.js');
    const reach = {
      board: /state\.startJob\(/, guard: /state\.tick\(s, 'guard'/, brief: /state\.brief\(/,
      getaway: /state\.getawayOf\(|state\.crack\(/, debrief: /state\.closeDebrief\(/,
    };
    for (const ph of Object.keys(PHASE_MEANS_DEFAULT)) {
      assert.ok(reach[ph], `PHASE_MEANS_DEFAULT declares "${ph}" and this test does not know how the screen reaches it`);
      assert.ok(reach[ph].test(JOB_JS), `no shipped call in screens/job.js can enter "${ph}" — its mean is a constant`);
    }
  });

  test('the debrief READ is banked on unmount, not left to the next job’s backstop', () => {
    // state.js:1588 states the contract and the screen half did not exist, so the only observation
    // ever folded was `now(next startJob) − debriefAt`, clamped at 4 × 65 s: identical sessions
    // advertised ~17 min on night 1 and ~20 min on night 8.
    const teardown = CODE.slice(CODE.lastIndexOf('return () => {'));
    assert.ok(/state\.closeDebrief\(/.test(teardown), 'the unmount banks the debrief read');
    assert.ok(teardown.indexOf('closeDebrief') < teardown.indexOf('flush()'),
      'and it is banked BEFORE the save is flushed, or the fold never reaches the disk');
  });

  test('the beat does not focus a control and then scroll it off screen', () => {
    // layout-safari: focusFirst(panel, '.job-call') with preventScroll, then window.scrollTo(0, 0)
    // two lines later — the focus ring sat 142 px below the fold on a 375x667 phone.
    const after = CODE.slice(CODE.indexOf('function afterBeat'), CODE.indexOf('function doBackcheck'));
    assert.ok(after.indexOf('scrollTo(0, 0)') < after.indexOf('render()'),
      'the page is put back to the top BEFORE the new beat paints and focuses');
    assert.ok(/function ensureInView/.test(CODE), 'and a focused control outside the viewport is scrolled to');
  });

  test('css/job.css caps the board sheet at LAYOUT.boardSheetPx and collapses it when there is no height for it', () => {
    const css = JOB_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(new RegExp(`--job-board-sheet:\\s*${LAYOUT.boardSheetPx}px`).test(css), 'the sheet number is published');
    assert.ok(/max-block-size:\s*min\(var\(--job-board-sheet\)/.test(css), 'and consumed as a cap on the open sheet');
    assert.ok(/@media \(max-height:\s*\d+px\)/.test(css),
      'a landscape phone has no room for a sheet AND a decision — the one query a container cannot make');
    assert.equal((css.match(/@media\s*\([^)]*min-width/g) ?? []).length, 0, 'still no width query decides a column');
  });

  test('the narrow contract row is two tracks, so the floors cannot sum past the board', () => {
    const css = JOB_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const row = /\.job-contract\s*\{([\s\S]*?)\n\}/.exec(css);
    assert.ok(row, 'the contract row is readable');
    const cols = /grid-template-columns:\s*([^;]+);/.exec(row[1])[1].replace(/\s+/g, ' ').trim();
    assert.equal(cols, '2.5ch minmax(min(100%, 12ch), 1fr)',
      'the price shares the name track’s row instead of adding a third nowrap track (320px at 125% text)');
    assert.match(row[1], /grid-template-areas:\s*"key name"\s*"key meta"\s*"key posted"/,
      'and the posted price gets its own row in the narrow form');
    // …and the price comes back beside the name as soon as the ROW has the width for it. `ch`
    // covers text zoom for free: 31.5ch at 375px/100 %, 25.4ch at 375px/125 %, 21ch at 320/125 %.
    const back = /@container job \(min-width: 30ch\)\s*\{([\s\S]*?)\n\}/.exec(css);
    assert.ok(back, 'no rule restores the compact row — the phone keeps the 320px-at-125 % form');
    assert.match(back[1], /grid-template-areas:\s*"key name posted"\s*"key meta meta"/);
  });
});


/* ================================================================================================
   5d. S5 — THE BRIEF PRESS IS ONE ATOMIC SUBMIT
   ================================================================================================ */

/**
 * Play the REAL machine from one of the composed boards above until the first brief window is open,
 * with the whole press down (the re-press exists only on a full one). Returns the save, or `null`
 * when this board never reaches a window.
 */
/**
 * The same walk as `toBriefWindow`, carried past every brief window to the GETAWAY — the beat whose
 * whole decision is CRACK vs WALK. Returns `{ save, now }` at that phase, or `null` for a board
 * that never reached one (a one-target shape has no getaway beat at all; `state.advance`).
 */
function toGetaway(i) {
  const sv = jobSaveFor(i);
  if (!sv) return null;
  let t = JOB_NOW;
  const step = (n) => (t += n);
  const g = state.stateOf(sv);
  if (!g) return null;
  const wings = Object.keys(g.guard?.dist ?? {});
  if (!wings.length) return null;
  const full = {};
  for (let k = 0; k < GUARD.tokens; k++) full[wings[k % wings.length]] = (full[wings[k % wings.length]] ?? 0) + 1;
  try { state.press(sv, full, { now: step(1000) }); } catch { return null; }
  try { state.beginTargets(sv, { now: step(5000) }); } catch { return null; }
  for (let n = 0; n < 400; n++) {
    const gv = state.stateOf(sv);
    if (!gv || gv.outcome != null) return null;
    if (gv.phase === 'getaway') return { save: sv, now: t };
    try {
      if (gv.phase === 'brief') { state.brief(sv, {}, { now: step(1000) }); continue; }
      if (gv.phase === 'envelope') {
        const env = state.envelopeFor(sv);
        state.lockCall(sv, env.calls[1] ?? env.calls[0], { now: step(4000) });
        continue;
      }
      if (gv.phase === 'call' || gv.phase === 'answer') {
        const it = state.currentItem(sv);
        // a mixed walk, so the pile and the chain at the getaway are not always the same state
        state.applyTarget(sv, { id: it?.id, cleared: n % 4 !== 0, firstTry: true, attempt: 1, hints: 0 }, { now: step(9000) });
        continue;
      }
      if (gv.phase === 'payout' || gv.phase === 'bagpush') { state.push(sv, { now: step(2000) }); continue; }
    } catch { return null; }
    return null;
  }
  return null;
}

function toBriefWindow(i) {
  const sv = jobSaveFor(i);
  if (!sv) return null;
  let t = JOB_NOW;
  const step = (n) => (t += n);
  const g = state.stateOf(sv);
  if (!g) return null;
  /* the full press, at the board, where it is free and blind */
  const wings = Object.keys(g.guard?.dist ?? {});
  if (!wings.length) return null;
  const full = {};
  for (let k = 0; k < GUARD.tokens; k++) full[wings[k % wings.length]] = (full[wings[k % wings.length]] ?? 0) + 1;
  try { state.press(sv, full, { now: step(1000) }); } catch { return null; }
  try { state.beginTargets(sv, { now: step(5000) }); } catch { return null; }
  for (let n = 0; n < 400; n++) {
    const gv = state.stateOf(sv);
    if (!gv || gv.outcome != null) return null;
    if (gv.phase === 'brief') return { save: sv, now: t };
    if (gv.phase === 'envelope') {
      const env = state.envelopeFor(sv);
      state.lockCall(sv, env.calls[1] ?? env.calls[0], { now: step(4000) });
      continue;
    }
    if (gv.phase === 'call' || gv.phase === 'answer') {
      const it = state.currentItem(sv);
      state.applyTarget(sv, { id: it?.id, cleared: true, firstTry: true, clean: true, attempt: 1, hints: 0 }, { now: step(9000) });
      continue;
    }
    if (gv.phase === 'payout' || gv.phase === 'bagpush') { state.push(sv, { now: step(2000) }); continue; }
    return null;                                     // the getaway or the debrief: no window on this board
  }
  return null;
}

describe('J6 — S5: the brief window’s ± stage a move, and the machine’s refusals are the screen’s gate', () => {
  test('the four refusal codes are the published contract, driven through the real machine', () => {
    /* These are the rules `screens/job.js` greys its ± out with (`state.canPress`, one call per
       candidate), so they are pinned as the contract the screen consumes — and pinned by DRIVING
       `state.press` to its throw, never by calling the predicate that decides it. */
    let seen = 0;
    const codes = {};
    for (let i = 0; i < 12 && seen < 3; i++) {
      const at = toBriefWindow(i);
      if (!at) continue;
      seen++;
      const { save: sv, now } = at;
      const g = state.stateOf(sv);
      const tokens = { ...g.tokens };
      const wings = Object.keys(g.guard.dist ?? {});
      const down = wings.find((w) => (tokens[w] ?? 0) > 0);
      const up = wings.find((w) => w !== down);
      /* every probe runs on a COPY, so one refusal cannot change the state the next one is about */
      const throws = (t) => {
        try { state.press(structuredClone(sv), t, { now }); return null; } catch (e) { return String(e?.code ?? e?.message ?? e); }
      };
      /* the whole press moved at once — more than one token in a window that gets one */
      const all = {};
      for (const w of wings) all[w] = w === up ? GUARD.tokens : 0;
      codes.step = codes.step ?? throws(all);
      /* …and the atomic one-for-one move is ACCEPTED, or the gate has nothing to allow */
      const swap = { ...tokens, [down]: (tokens[down] ?? 0) - 1, [up]: (tokens[up] ?? 0) + 1 };
      assert.equal(state.canPress(sv, swap), true,
        `the atomic move −1 ${down} / +1 ${up} must be legal: ${JSON.stringify(tokens)} → ${JSON.stringify(swap)}`);
      /* a SECOND lift, once this window's press is spent */
      state.press(sv, swap, { now });
      assert.equal(state.canPress(sv, { ...swap, [up]: (swap[up] ?? 0) - 1 }), false,
        'a second lift in the same window must be refused (repress-spent)');
      let spent = null;
      try { state.press(sv, { ...swap, [up]: (swap[up] ?? 0) - 1 }, { now }); } catch (e) { spent = String(e?.code ?? e?.message ?? e); }
      codes.spent = codes.spent ?? spent;
    }
    assert.ok(seen >= 1, `no composed board reached a brief window (${seen})`);
    assert.equal(codes.step, 'repress-step', `moving the whole press at once must be refused: got ${codes.step}`);
    assert.equal(codes.spent, 'repress-spent', `a second lift must be refused: got ${codes.spent}`);
  });

  test('a window that never had a full press has no re-press at all — both halves refuse', () => {
    /* `pressRefusal`: *"the option itself only exists on a full press: with fewer than GUARD.tokens
       down, 're-press one token' has no meaning that is not 'press a token you never spent'"*. Both
       codes live here because both are only reachable from a partial press: a PLACE is
       `repress-lift-first` and a LIFT is `repress-unavailable`. This is the state the harness's rule
       12 asserts the screen renders with every ± and the submit dead. */
    let seen = 0;
    for (let i = 0; i < 12 && seen < 1; i++) {
      const at = toBriefWindow(i);
      if (!at) continue;
      const { save: sv, now } = at;
      const g = state.stateOf(sv);
      const wings = Object.keys(g.guard.dist ?? {});
      const off = wings.find((w) => (g.tokens[w] ?? 0) > 0);
      /* take one token back off the board press, so the window opens on a partial one */
      g.tokens = { ...g.tokens, [off]: (g.tokens[off] ?? 0) - 1 };
      const down = wings.find((w) => (g.tokens[w] ?? 0) > 0);      // …one that still has a token
      const up = wings.find((w) => w !== down);
      assert.ok(down && up, `a partial press needs a liftable and a placeable wing: ${JSON.stringify(g.tokens)}`);
      seen++;
      const code = (t) => {
        try { state.press(structuredClone(sv), t, { now }); return null; } catch (e) { return String(e?.code ?? e?.message ?? e); }
      };
      const place = { ...g.tokens, [up]: (g.tokens[up] ?? 0) + 1 };
      const lift = { ...g.tokens, [down]: Math.max(0, (g.tokens[down] ?? 0) - 1) };
      assert.equal(code(place), 'repress-lift-first', 'a place on a partial press must be refused');
      assert.equal(code(lift), 'repress-unavailable', 'and so must a lift');
      assert.equal(state.canPress(sv, place), false, 'so the + is dead on the brief');
      assert.equal(state.canPress(sv, lift), false, 'and so is the −');
    }
    assert.ok(seen >= 1, 'no composed board reached a brief window');
  });

  test('the screen STAGES the brief press: no state.press is reachable from bump()’s brief branch', () => {
    /* The behavioural half of this rule is `qa/job-screen.mjs` rule 12, run by the measured test at
       the bottom of this file: it stages a lift and a place with real clicks and asserts the save's
       tokens and `guard.drawnAt` do not move until the submit. Reverted to the round-3 handler that
       rule prints eight failures, the first three being "the lift wrote the allocation to the save
       before the submit", "the lift moved guard.drawnAt" and "the lift redrew the guarded wing
       ALGEBRA → FIGURES before the move was committed".
       What is checked HERE is the shape that made it possible: `state.press` must not be reachable
       from the brief branch at all, so no future edit can put the redraw back on the ± tap. */
    /* `strip()` blanks string literals, so `phase === 'brief'` is unfindable in CODE — the branch is
       read out of the raw source with its comments removed instead. */
    const bump = JOB_JS.slice(JOB_JS.indexOf('function bump('), JOB_JS.indexOf('function pendingOf('))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(bump.length > 100, 'bump() is readable');
    const briefBranch = bump.slice(bump.indexOf("=== 'brief'"), bump.indexOf('const cur = gv ?'));
    assert.ok(briefBranch.length > 40, 'the brief branch is readable');
    assert.ok(!/state\.press\(/.test(briefBranch),
      'the brief branch commits through state.press — which REDRAWS THE GUARD, so the lift publishes '
      + 'the new wing and the placement that follows is informed (S5)');
    assert.ok(/state\.canPress\(/.test(briefBranch),
      'and what may be staged must be the machine’s own rule, not a second copy of it');
    // the only presses left in the file are the board's (free, blind, sealed) and the start path's
    assert.equal((CODE.match(/state\.press\(/g) ?? []).length, 2,
      'state.press may be called from the board branch of bump() and from startOrGo(), nowhere else');
    // and the submit carries the STAGED allocation, gated on the move being one-for-one
    const brief = CODE.slice(CODE.indexOf('function renderBrief'), CODE.indexOf('function swapRows'));
    assert.match(brief, /disabled:\s*!move\.atomic/,
      'the submit must be dead unless the staged move is a one-for-one swap: a bare redraw is weakly '
      + 'dominant (G11) and a lift alone leaves the freed token to be placed against a known wing');
    assert.match(brief, /pressMove\(g\(\)\)/, 'the submit re-reads the staged move from the LIVE record at the tap');
    /* ROUND 4: the press rides the window's ONE `state.brief` call (`submitBrief`) instead of a
       `takeBrief` of its own, so taking the re-press no longer costs the student the other four
       options. The claim that moved with it is still the same claim — the submitted `repress` is
       the STAGED allocation, and it is submitted only when the move is atomic. */
    assert.match(brief, /\.\.\.\(m\.atomic \? \{ repress: m\.tokens \} : null\)/,
      'and it submits that staged allocation, and only when the move is one-for-one');
    assert.ok(!/repress:\s*\{\s*\.\.\.gv\.tokens\s*\}/.test(brief),
      'the old button submitted the LIVE allocation — a redraw with no token moved');
    assert.ok(!/repress:\s*\{\s*\.\.\.g\(\)\.tokens\s*\}/.test(brief), 'in either spelling');
  });

  test('…and "redraw and move nothing" is not offered, while the machine still allows it', () => {
    /* The bare press must stay legal in `state.press`: `tests/job-state-r3.test.mjs`'s priced-button
       test, `tests/job-split.test.mjs:194` and the fixture in `tests/_helpers.mjs` all exercise it.
       So this is a claim about the SCREEN, and the machine is checked to still permit what the
       screen declines to offer — which is why the law has to live in the screen (S5.2). */
    let seen = 0;
    for (let i = 0; i < 12 && seen < 1; i++) {
      const at = toBriefWindow(i);
      if (!at) continue;
      seen++;
      const { save: sv } = at;
      assert.equal(state.canPress(sv, { ...state.stateOf(sv).tokens }), true,
        'state.press must still accept the bare redraw — three shipped tests drive it');
    }
    assert.ok(seen >= 1, 'no composed board reached a brief window');
  });
});

/* ================================================================================================
   5g. R4-VERIFY — the three numbers the screen printed for a quantity it was not about
   ================================================================================================ */

describe('J6 — the swap row is priced on what it DELIVERS, not on the contract it came from', () => {
  /* ROUND 4 VERIFICATION (exploit-hunt, BLOCKER). The row printed `· posted ${o.decline}` — the
     declined price of the WHOLE contract — on the same line as the `+N target(s)` it really adds.
     `swapIn` splices only the bench items the queue does not already hold, and criticals are
     replicated across bundles, so most of a declined contract is usually already drafted. Measured
     over 60 corpus saves: 119 of 119 rows overstated, 2.45x min, 10.50x median, 58.67x max, and not
     one row where the two agreed. Global law 6 makes this line the evidence the swap is decided on.

     The test is the same comparison, driven: what `swapDeliveryOf` prints against what `state.brief
     ({swap})` actually adds to `g.posted` on a private clone of the same save. */
  test('what the row prints is exactly what swapIn adds to the job’s posted', async () => {
    let rows = 0; let agree = 0; let worst = 0;
    for (let i = 0; i < 16 && rows < 6; i++) {
      const at = toBriefWindow(i);
      if (!at) continue;
      const sv = at.save;
      for (const o of state.swapOptions(sv)) {
        const got = screen.swapDeliveryOf(sv, o.id);
        if (got.targets < 1) continue;
        const clone = JSON.parse(JSON.stringify(sv));
        const before = state.stateOf(clone).posted;
        let r = null;
        try { r = state.brief(clone, { swap: { id: o.id } }, { now: at.now }); } catch { continue; }
        const added = state.econ.round(state.stateOf(clone).posted - before);
        rows++;
        if (added === got.posted && r.swap.targets === got.targets) agree++;
        worst = Math.max(worst, o.decline / Math.max(1, added));
      }
    }
    assert.ok(rows >= 3, `only ${rows} swap rows were composed — this test cannot fail`);
    assert.equal(agree, rows, `${rows - agree} of ${rows} rows print a posted swapIn does not add`);
    /* …and the control: the number the row USED to print really is a different quantity, or the
       repair is decorative. */
    assert.ok(worst > 1.5,
      `the contract's own declined price was never more than ${worst.toFixed(2)}x what the swap `
      + 'delivers, so the old row and the new one cannot be told apart on this corpus');
  });

  test('a contract whose bench delivers nothing renders no row at all', () => {
    /* `brief()` always advances the phase, so a row that splices nothing would close the window in
       exchange for nothing. `swapOptions` counts every bench item of the contract; `swapDeliveryOf`
       counts the ones `swapIn`'s own `!have.has(it.id)` would keep. */
    /* the row's text is a template literal, which `strip()` blanks — so this reads the RAW source */
    const brief = JOB_JS.slice(JOB_JS.indexOf('function swapRows'), JOB_JS.indexOf('function crewBlock'));
    assert.match(brief, /if \(got\.targets < 1\) continue;/, 'the empty row is skipped');
    assert.match(brief, /\+\$\{got\.targets\} target/, 'the target count is the DELIVERED one');
    assert.match(brief, /posted \+\$\{got\.posted\}/, 'and so is the posted');
    assert.ok(!/\+\$\{o\.targets\} target/.test(brief), 'never swapOptions’ bench count');
    assert.ok(!/· posted \$\{o\.decline\} \(/.test(brief), 'and never the whole contract’s price, inline');
    // the contract's own figure survives, LABELLED as the contract's and on a line of its own
    assert.match(brief, /job-swap-whole/, 'the contract’s declined price is a second, labelled line');
    assert.match(brief, /contract \$\{o\.id\} is posted \$\{o\.decline\} declined/, 'and it names what it is about');
  });
});

describe('J6 — the getaway prices CRACK against WALK, at a rung it names', () => {
  /* ROUND 4 VERIFICATION (exploit-hunt, MAJOR). The getaway printed `breakevenLabel()`, whose root
     is `econ.breakevenQExact` — the PUSH-vs-BAG threshold, carrying the 0.10 MID-JOB bag fee, no
     completion term, and quoted at `callOf(gv)`, which at the getaway is the rung used on the
     PREVIOUS target. Measured over 60 getaway states it said WALK at the student's own q-hat on 6
     of them while cracking at the free rung banked more in every one. */
  test('the printed q* is the exact root of CRACK − WALK, from the machine’s own exit rule', async () => {
    const econ = await import('../site/js/job/econ.js');
    let seen = 0;
    for (let i = 0; i < 24 && seen < 6; i++) {
      const at = toGetaway(i);
      if (!at) continue;
      const { save: sv } = at;
      const gv = state.stateOf(sv);
      const t = state.pricedTarget(sv, {});
      const th = screen.getawayThresholdOf({
        bagged: gv.bagged, loose: gv.loose, chain: gv.chain, stakes: gv.stakes !== false,
        target: t,
        rungs: state.crew.bandFor(state.crew.mShownOf(sv, t.make)),
        crew: Math.max(0, Math.trunc(t.crewInfo?.forgives ?? t.crew ?? 0)),
        calls: state.callsAvailable(sv),
      });
      assert.ok(th, `no threshold at getaway ${i}`);
      seen++;
      /* the two banks, rebuilt from `endJob`'s own parts: `bankOnExit` routes BOTH exits through
         `getawayBank` (fee 0), and `exitBonusRate` is the ONE rule for what each is then paid. */
      const V = econ.getawayBank(gv.loose) + gv.bagged;
      const walk = (1 + econ.exitBonusRate({ complete: false, stakes: true, getawayWalk: true })) * V;
      const crackAt = (q) => (1 + econ.exitBonusRate({ complete: true, stakes: true }))
        * (V + q * th.gain - (1 - q) * th.loss);
      const eps = 1e-6;
      if (th.q > eps) {
        assert.ok(crackAt(th.q - eps) <= walk + 1e-6,
          `getaway ${i}: just under q* ${th.q.toFixed(4)} cracking still pays more than walking`);
      }
      assert.ok(crackAt(Math.min(1, th.q + eps)) >= walk - 1e-6,
        `getaway ${i}: just over q* ${th.q.toFixed(4)} walking still pays more than cracking`);
      assert.ok(Math.abs(crackAt(th.q) - walk) <= 1e-6 || th.q === 0 || th.q === 1,
        `getaway ${i}: q* ${th.q} is not a root (crack ${crackAt(th.q)} vs walk ${walk})`);
      // the rung is one the student may actually pick, and it is named to them
      assert.ok(state.callsAvailable(sv).includes(th.call),
        `the threshold is quoted at ${th.call}, which the vault's call row does not offer`);
      assert.equal(screen.vaultLineOf({ make: 'X', grade: 3, qHat: null, breakeven: '0.43', at: th.call }),
        `X grade 3 · no history yet · crack at ${th.call} breaks even at 0.43`);
    }
    assert.ok(seen >= 3, `only ${seen} getaways were composed — this test cannot fail`);
  });

  test('…and it is NOT econ.breakevenQ, which is a different economy', async () => {
    const econ = await import('../site/js/job/econ.js');
    /* The two roots must actually disagree, or no test could tell the repair from the defect.
       `breakevenQExact` carries FEE and no completion term; the getaway's root carries neither. */
    const target = { tier: 4, loot: 18, mult: 1 };
    const bag = econ.breakevenQ({ ...target, loose: 300, chain: 4, call: 85 });
    const away = screen.getawayThresholdOf({
      bagged: 200, loose: 300, chain: 4, target, calls: [85],
    });
    assert.ok(away, 'the getaway threshold priced nothing');
    assert.ok(Math.abs(away.q - bag) > 0.02,
      `the getaway root ${away.q.toFixed(3)} and the bag/push root ${bag.toFixed(3)} agree — `
      + 'this test cannot distinguish the two economies');
    // the free rung: nothing staked, so no q makes walking pay more, and the screen SAYS so
    const free = screen.getawayThresholdOf({ bagged: 200, loose: 300, chain: 4, target, calls: [50] });
    assert.equal(free.q, 0, 'at the rung whose P is 0 there is no threshold to clear');
    assert.equal(free.free, true, 'and the caller is told to print the two banks instead of a bare 0.00');
    assert.ok(free.missBank >= free.walkBank,
      `a miss at the free rung banks ${free.missBank} against a walk's ${free.walkBank}`);
    assert.match(JOB_JS, /job-getaway-floor/, 'the getaway renders that line');
    assert.ok(!/breakeven: breakevenLabel\(\)/.test(JOB_JS.slice(JOB_JS.indexOf('function renderGetaway'))),
      'and the getaway no longer quotes the BAG/PUSH label');
  });
});

describe('J6 — a CLEARED target that moves the rating DOWN says why', () => {
  /* ROUND 3 VERIFICATION (player-feel, MAJOR). `payoutLineOf`'s blank-slot branch explains the
     eviction ("its slot pushed an older call out"); the informative branch printed `rating −0.09`
     with no cause at all. Once `player.rating.calls` reaches 50 the window stays full for the rest
     of the student's life, so this is the steady state: the student answers correctly, calls it at
     the strongest legal rung, is paid 50 loose, and is told their rating fell. */
  test('the implication the clause rests on: on a CLEAR, a fall can only be an eviction', async () => {
    const call = await import('../site/js/job/call.js');
    /* `ratingDetail` divides by the FIXED N, and on a clear `c = 10 − 40(p − 1)²` is >= 0 at every
       rung the game offers — so a push onto a window that is not yet full cannot lower the value.
       Driven over every rung and every window size below 50. */
    for (const rung of [50, 70, 85, 95]) {
      for (const slots of [0, 1, 9, 25, 49]) {
        const base = Array.from({ length: slots }, (_, i) => call.callEntry({ call: 85, ok: true, qHat: 0.8, skill: 'FAC2', at: i }));
        const before = call.ratingDetail(base, 50).value;
        const entry = call.callEntry({ call: rung, ok: true, qHat: 0.8, skill: 'FAC2', at: 9999 });
        const after = call.ratingDetail(call.windowPush(base, entry, { N: 50 }), 50).value;
        assert.ok(after >= before - 1e-9,
          `a clear at ${rung} onto a ${slots}-slot window LOWERED the rating (${before} → ${after}) — `
          + 'the screen\'s "a fall is an eviction" clause would then be false');
      }
    }
  });

  test('…and the line names it, exactly as the blank-slot branch does', async () => {
    const call = await import('../site/js/job/call.js');
    /* A FULL window whose evicted slot is worth more than the arriving one: a strong measured call
       leaves, a weaker (but still informative) one arrives. */
    let calls = Array.from({ length: 50 }, (_, i) => call.callEntry({ call: 70, ok: (i % 10) < 7, qHat: 0.7, skill: 'FAC2', at: i }));
    /* the arriving call is a CLEAR, and an informative one — `q̂ 0.7` is inside
       `RATING.informativeQHatBand` — but it is called at the rung whose own credit is exactly 0
       (`c = 10 − 40(0.5 − 1)²`), so the slot it takes is worth less than the one it evicts. */
    const weak = call.callEntry({ call: 50, ok: true, qHat: 0.7, skill: 'FAC2', at: 1e6 });
    assert.equal(call.ratingDetail([weak], 50).n, 1, 'the arriving slot really is a measurement');
    const before = call.ratingDetail(calls, 50);
    calls = call.windowPush(calls, weak, { N: 50 });
    const after = call.ratingDetail(calls, 50);
    const move = after.value - before.value;
    assert.ok(move < 0, `the control: this push has to LOWER the rating (moved ${move.toFixed(4)})`);
    assert.ok(after.n === 50 && before.n === 50, 'and both windows are all measurements');
    /* `p.w` is `applyTarget`'s, not the entry's (`callEntry` stores no `w` since the call lane's
       round-2 change): 4·0.7·0.3 = 0.84, comfortably above `INFORMATIVE_MIN`. */
    const line = screen.payoutLineOf({ ok: true, delta: 50, chain: 2, credit: 9.9, w: 0.84 }, null, move);
    assert.match(line, /rating −/, 'the fall is printed');
    assert.match(line, /its slot pushed a stronger call out/,
      `a cleared target printed a fall with no cause: "${line}"`);
    // a RISE is not given a cause it does not have
    const up = screen.payoutLineOf({ ok: true, delta: 50, chain: 2, credit: 9.9, w: 0.89 }, null, 0.23);
    assert.ok(!/pushed a stronger call out/.test(up), `a rising rating was given an eviction: "${up}"`);
    /* …and the `×` is gone from the copy entry: `credit` is the MEASURED move, which already
       contains `w`, so `rating 0.23 ×0.89` invited a product that is no quantity in the system. */
    assert.ok(!/rating [+−][\d.]+ ×/.test(up), `the rating move is still multiplied by the weight: "${up}"`);
    assert.match(up, /rating \+0\.23 · weight 0\.89/, 'the two facts stand side by side instead');
  });
});

describe('J6 — the board phase is measured against its own decision', () => {
  /* ROUND 3 VERIFICATION (layout-safari, MAJOR). `syncBoardFit` skipped the board phase because its
     decision row "is sticky and rides the fold". A sticky box cannot be shifted above its
     containing block, and `.job-panel.job-start` puts ~600 px of content above that footer, so the
     shift clamps to 0: TAKE THE POSTED JOB was 35 px below the fold at rest at 320x568 with the
     browser text size at 20 px, and 8 px at 844x390, in both engines. `tests/_job-reach.mjs` rule 6
     is the driven half; these are the shapes that produce it. */
  test('MARKS_SELECTOR carries the board’s primary, and css/job.css lets the fit reach it', () => {
    assert.match(screen.MARKS_SELECTOR, /\.job-start > \.run-actions \.btn-primary/,
      'the board phase has no measured term at all without it');
    // the mark is the BUTTON, not the row: the row is the box whose sticky offset made the claim
    assert.ok(!/\.job-start > \.run-actions(?!\s*\.btn-primary)/.test(screen.MARKS_SELECTOR),
      'the sticky ROW is not the mark — its offset is exactly what hid the defect');
    /* the draft's own `max-block-size` override dropped BOTH the dvh term and the measured one; the
       dvh term stays dropped (round 2's repair), the measured one is back */
    const draft = JOB_CSS.slice(JOB_CSS.indexOf('@container jobscreen (max-width: 599.98px)'));
    const rule = draft.slice(0, draft.indexOf('}', draft.indexOf('.job-screen[data-phase="board"] .job-board')) + 1);
    assert.match(rule, /--job-board-fit/, 'the draft ignores the measured cap, so nothing it measures can apply');
    assert.ok(!/38dvh/.test(rule), 'and the dvh term stays dropped at the draft (round 2)');
  });

  test('…and the draft never escalates to the strip, because its sheet IS the decision', () => {
    /* `strip` sets `.job-board-body { display: none }`. At every other beat the sheet is chrome
       beside a decision; at the draft the five contracts are the decision, so the ladder stops at
       `open` and the floor is one whole contract row. Measured (tests/_job-reach.mjs rule 6, 20 px
       text): `320x568 state=open board=250 primary b=560 fold=568` and `844x390 state=open
       board=132 primary b=382 fold=390` — both in view, both with the list still on screen. */
    const fit = CODE.slice(CODE.indexOf('function syncBoardFit'), CODE.indexOf('function boardFitState'));
    assert.match(fit, /const atBoard = root\.dataset\.phase === /, 'the draft is recognised');
    assert.match(fit, /const state = atBoard \? /, 'and it does not take the strip or the off state');
    assert.match(fit, /Math\.max\(LAYOUT\.boardCollapsedPx, boardNeed\)/,
      'its floor is one whole contract row, not the 36 px collapsed line');
    // `boardFitState` is still called at every phase, because it is what measures `boardNeed`
    assert.match(fit, /const measured = boardFitState\(board, budget, was\)/,
      'the row height has to keep being measured, or the floor above is stale for ever');
    assert.match(JOB_CSS, /\.job-screen\[data-boardfit="strip"\] \.job-board-body \{ display: none; \}/,
      'the control: the strip really does take the contract list away');
  });
});

/* ================================================================================================
   6. MEASURED — the full walk, in both engines
   ================================================================================================ */

const REPO = repoPath('.');
const DRIVER = path.join(REPO, 'qa', 'job-screen.mjs');

function browsersAvailable() {
  if (!existsSync(path.join(REPO, 'qa', 'node_modules', 'playwright'))) return false;
  const probe = spawnSync(process.execPath, ['-e', `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(path.join(REPO, 'qa', 'shot.mjs'))});
    const { chromium } = req('playwright');
    chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
  `], { cwd: REPO, timeout: 90_000, encoding: 'utf8' });
  return probe.status === 0;
}

test('J6 measured: a full job at 375x667 with the keyboard open, board <= 36px on every target', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed (run: cd qa && npx playwright install chromium webkit)'); return; }
  const run = spawnSync(process.execPath, [DRIVER, '--engines', 'chromium', '--themes', 'light'],
    { cwd: REPO, timeout: 900_000, encoding: 'utf8' });
  assert.equal(run.status, 0, `qa/job-screen.mjs failed\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  // the table has to actually contain measured targets — a walk that answered nothing "passes" too
  assert.ok(/target 1\s+36/.test(run.stdout), `no measured target rows:\n${run.stdout}`);
  assert.match(run.stdout, /debrief/, 'the walk has to reach the debrief');
  /* ROUND 3 (layout-safari). "With the keyboard open" is only worth something if the keyboard was
     real: the LAYOUT viewport must NOT move (no keyboard resizes it — only the visual viewport
     shrinks, `site/js/widgets/base.js:234`), and the app's own `--kb` must be published, because
     that is what lifts every sticky dock. The harness used to shrink the Playwright viewport to
     375x331, which moves the fold and the dock together and can therefore never find anything
     underneath. These two lines fail if that model ever comes back. */
  assert.match(run.stdout, /keyboard open \(chromium\/light\): layout viewport 667px · visible band 0\.\.331/,
    `the keyboard-open pass did not run against a real keyboard:\n${run.stdout}`);
  assert.match(run.stdout, /--kb \d{3}px · data-kb open/,
    `the app published no keyboard inset, so nothing was lifted above the keys:\n${run.stdout}`);
  /* ROUND 3 (crew-alignment). The crew grid's sentence is measured against
     `crew.supplyGapFor(save, queue)` on the same board (rule 11) — this asserts the rule actually
     reached a brief, since a rule that measures nothing reports no failures either. */
  const crew = /crew grid: measured on (\d+) brief\(s\) · the queue-aware gap differs from the supply-blind one on (\d+)/.exec(run.stdout);
  assert.ok(crew, `the crew-grid rule printed no measurement line:\n${run.stdout}`);
  assert.ok(Number(crew[1]) >= 1, `the crew grid was measured on ${crew[1]} briefs`);
  /* ROUND 4 (S5). Rule 12 stages a lift and a place in a real brief window with real clicks and
     asserts that neither reaches the save — that `guard.drawnAt` does not move and the guarded wing
     does not change until the move is submitted whole. A rule that never reached a window reports
     no failures either, so the count is asserted here and the staged move is printed beside it.
     Against the round-3 handler (± committing through `state.press`) this rule prints eight
     failures, three of them naming the leak: "the lift wrote the allocation to the save before the
     submit", "the lift moved guard.drawnAt", "the lift redrew the guarded wing ALGEBRA → FIGURES
     before the move was committed". */
  const press = /brief press: driven on (\d+) window\(s\)(?: · (.+))?/.exec(run.stdout);
  assert.ok(press, `the brief-press rule printed no measurement line:\n${run.stdout}`);
  assert.ok(Number(press[1]) >= 1, `the atomic brief press was driven on ${press[1]} windows`);
  assert.match(String(press[2] ?? ''), /one redraw · took \["repress"\]/,
    `the submitted move did not record one redraw and one repress decision: ${press[2]}`);
});

/* ================================================================================================
   7. MEASURED — the board phase's two reachability rules, and the sheet's third term at the getaway
   ================================================================================================ */

test('J6 measured: the board’s primary is on screen at rest, and the getaway’s marks selector matches', (t) => {
  /* THE THREE ROUND-1-VERIFICATION FINDINGS THAT SHARED ONE SENTENCE — *nothing measures it*:
       · `.job-primary` 344 px below the fold at 375x667 (455 at 320x568), at rest, both engines;
       · `syncBoardFit`'s marks selector named `.job-getaway .run-actions`, which nothing renders,
         so the measured cap was switched off at the one beat css/job.css:143 cites for it
         (`marks=0 · fit=(unset)` at every viewport, against `fit=80–232px` at the envelope);
       · the draft list clipped to half its height with no affordance.
     `tests/_job-reach.mjs` opens `qa/audit-states.mjs`'s own prepared states and measures
     rectangles at rest. It is NOT a second walk: two states, no typing, ~15 s. The Request in
     notes/repair-screen.md asks the tests lane to fold these rules into `qa/job-screen.mjs`'s
     PROBE_REACH pass, where the rest of this family lives; until then they live here. */
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const driver = path.join(REPO, 'tests', '_job-reach.mjs');
  const run = spawnSync(process.execPath, [driver, '--engines', 'chromium'],
    { cwd: REPO, timeout: 600_000, encoding: 'utf8' });
  assert.equal(run.status, 0, `tests/_job-reach.mjs failed\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  // a driver that measured nothing "passes" too: the phases have to have actually been reached
  assert.match(run.stdout, /375x667 job-board\s+phase=board/, `the board phase was never measured:\n${run.stdout}`);
  assert.match(run.stdout, /320x568 job-board\s+phase=board/, `the 320px phone was never measured:\n${run.stdout}`);
  assert.match(run.stdout, /job-getaway\s+phase=getaway marks=[1-9]/, `the getaway's marks were never measured:\n${run.stdout}`);
});
