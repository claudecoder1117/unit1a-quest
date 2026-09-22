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
      + 'open keyboard does not move (qa/job-screen.mjs rule 6 measures this)');
    assert.ok(/--job-dock-h:\s*0px/.test(css), 'and the fallback is 0px when there is no dock');
    assert.ok(CODE.includes('syncDockOffset'), 'screens/job.js measures the dock into that property');
    assert.ok(/getElementById\('dock'\)/.test(JOB_JS), 'measured off the real element');
  });

  test('the board collapses at the BRIEF too, and the brief’s primary is pinned', () => {
    // The sheet sprang back to ~280 px between targets and the brief panel opened under it, which
    // put "Skip" ~680 px below an 812 px fold. `[data-phase]` is render()’s own attribute.
    assert.ok(css.includes('.job-screen[data-phase="brief"] .job-board-body { display: none; }'),
      'the brief collapses the sheet the same way call-lock does');
    assert.ok(/\.job-brief > \.run-actions\s*\{[^}]*position:\s*sticky/.test(css),
      'the brief’s primary has to stay on screen through a 900 px panel');
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
    for (const key of ['envelope', 'clear', 'miss', 'bagPrompt', 'bag', 'guard', 'vault', 'walk', 'callIt', 'collapsedBoard']) {
      assert.ok(CODE.includes(`COPY.${key}(`), `COPY.${key} is never printed`);
    }
    /* `COPY.evidence` is the ONE exception, and it is struck from the list on purpose (round 3,
       call-propriety): it prints the bare fraction, which composes with Settings' `evMaxBands()`
       into the argmax Global law 6 bans. Its replacement is `evidenceWordsOf`, below. */
    assert.ok(!CODE.includes('COPY.evidence('),
      'COPY.evidence prints the raw hits/of — the pre-call surface that composes into the EV-max rung');
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
    // every distinct sentence must cover at least two rungs on BOTH ladders, over its whole band
    for (const [line, qs] of seen) {
      const i = call.evidenceBandOf([...qs][0]);
      const b = call.evidenceBands()[i];
      const evMax = new Set(); const honest = new Set();
      for (let k = 0; k <= 200; k++) {
        const q = b.from + ((b.to - b.from) * k) / 200;
        evMax.add(call.argmaxCall(q)); honest.add(call.honestCall(q));
      }
      assert.ok(evMax.size >= 2 && honest.size >= 2,
        `"${line}" decodes to the single rung ${[...evMax]} / ${[...honest]}`);
      // …and the sentence is a pure function of the BAND, so it carries no more than the band does
      for (const q of qs) assert.equal(call.evidenceBandOf(q), i, `"${line}" spans two bands`);
    }
    assert.equal(seen.size, call.evidenceBands().length + 0,
      'one sentence per band and no more — a sentence per (band, window size) would compose back');
    assert.equal(screen.envelopeLinesOf(env, { qHat: null, hits: 0, of: 0 }).evidence, 'no history on FAC2 yet');
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
    const clear = screen.payoutLineOf({ ok: true, delta: 24, chain: 1, credit: 9.9, w: 0.36 }, null);
    assert.equal(clear, COPY.clear({ loose: 24, chain: 1, credit: 9.9, w: 0.36 }));
    const miss = screen.payoutLineOf({ ok: false, delta: -12, chain: 0, target: { make: 'FAC2', tell: { tag: 'dropped-gcf' } } }, null);
    assert.equal(miss, COPY.miss({ make: 'FAC2', tell: 'dropped-gcf', loose: 12, chain: 0 }));
    assert.equal(screen.payoutLineOf({ free: true }, null), '');
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
    assert.ok(/state\.crew\.crewOrder\(/.test(CODE), 'the brief orders by crewValue');
    assert.ok(/state\.crew\.crewValueDetail\(/.test(CODE), 'and prints the sort key that ordering IS');
    const block = CODE.slice(CODE.indexOf('function crewBlock'), CODE.indexOf('function setCrewRank'));
    assert.ok(block.indexOf('crewOrder') < block.indexOf('for (const make of makes)'),
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
    assert.ok(/takeBrief\(\{\s*swap:\s*\{\s*id/.test(CODE), 'and takes it through the machine’s own action');
    const brief = CODE.slice(CODE.indexOf('function renderBrief'), CODE.indexOf('function crewBlock'));
    assert.ok(brief.includes('swapRows('), 'the option list carries the swap row');
    assert.ok(/DECLINE_PRICE/.test(CODE), 'the declined price is data/job.js’s constant, not a typed 15');
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
      // the grid reads its sentence off `alignmentFor(...).gap`, so that must BE this gap
      const align = crew.alignmentFor(sv, { shape, of: onBoard, queue });
      assert.deepEqual(align.gap, gap, `board ${i}: alignmentFor({queue}).gap is not supplyGapFor(save, queue)`);
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
});
