// tests/job-coldopen.test.mjs — J13, the cold open and the two-pass board.
//
// COMPOSED S9 #1 is "cold open to first answer ≤ 20 s". THE JOB puts a board between the visit and
// the first stem, so G1 pins the exact path the 20 s is measured on — `board 6 → primary button →
// guard accept 4 → call 5` — and `data/job.js COLD_OPEN` is that path as data. G10 #21 then rules
// that `tests/home-r2.test.mjs`'s no-static-import assertion WINS, so the board cannot be painted in
// one pass; J13 asserts the behaviour that replaces it: two passes, no spinner, zero layout shift.
//
// Three halves, because three different things rot differently:
//
//   1. **THE PATH, as data** — the four steps, their seconds, and the fact that they sum inside the
//      budget. No browser, no DOM, microseconds. If someone re-times a step, this file says so.
//   2. **THE MACHINERY, in the source** — every step of that path has to exist in the code that
//      serves it: Home paints a board and a primary that points at the job; the job screen accepts
//      the pre-pressed mix on `Enter` and focuses a call rung; the board's numerals are width-
//      reserved placeholders in pass 1 and take ink in pass 2 by `textContent` alone; no spinner;
//      and neither Home nor the shell drags `page.js`, `plan.js` or `data/job.js` onto the cold path.
//   3. **THE MEASUREMENT** — `node qa/job-walk.mjs gate`, which does the walk in a real browser with
//      `page.js` / `plan.js` deliberately lagged, parks the published human seconds exactly, and
//      reads the total off `performance.now()` inside the page. It SKIPS (never fails) when no
//      Playwright browser is installed, exactly as `tests/job-screen.test.mjs` does.
//
// Two of J13's acceptance criteria did not hold as shipped. Both lived in `site/js/screens/home.js`,
// which J13 does not own, and both were written up in `notes/J13.md` with the exact fix; integration
// made both changes, so §5's assertions are no longer `todo`s and the walk's known-open register is
// empty. Nothing was softened and nothing was deleted.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { read, repoPath, stripCommentsAndStrings as strip } from './_helpers.mjs';

const HOME_JS = read('site/js/screens/home.js');
const JOB_JS = read('site/js/screens/job.js');
const APP_JS = read('site/js/app.js');
const JOB_CSS = read('site/css/job.css');
/* `stripCommentsAndStrings` BLANKS every string literal, so it is used only where the assertion is
   about an identifier (and a mention in a comment would be a false positive). Every assertion about
   a rendered class name, an href or a copy key reads the raw source. */
const JOB = strip(JOB_JS);

const { COLD_OPEN, FIXED_PHASES, LAYOUT, KEYS, BOARD } = await import('../site/data/job.js');

/* ================================================================================================
   1. THE PATH — G1's four steps, as data, inside COMPOSED S9's budget
   ================================================================================================ */

describe('J13 — the pinned cold-open path', () => {
  test('the budget is COMPOSED S9 #1\'s own 20 s', () => {
    assert.equal(COLD_OPEN.budgetS, 20);
    assert.ok(Object.isFrozen(COLD_OPEN) && Object.isFrozen(COLD_OPEN.path));
  });

  test('the path is `board 6 → primary → guard accept 4 → call 5`, in that order', () => {
    assert.deepEqual(COLD_OPEN.path.map((p) => p.step), ['board', 'primary', 'guard-accept', 'call']);
    assert.deepEqual(COLD_OPEN.path.map((p) => p.s), [6, 0, 4, 5]);
  });

  test('the four steps sum to 15 s and leave 5 s of machine headroom', () => {
    const total = COLD_OPEN.path.reduce((t, p) => t + p.s, 0);
    assert.equal(total, 15, 'G1\'s trace: first answer at ~0:15–0:18');
    assert.ok(total <= COLD_OPEN.budgetS, `${total} s of human time must fit inside ${COLD_OPEN.budgetS} s`);
    assert.equal(COLD_OPEN.budgetS - total, 5, 'the machine gets 5 s — the number the browser walk is scored against');
  });

  test('the 4 s guard accept and the 12 s guard mean are BOTH published, and are different numbers', () => {
    // G1: "The 12 s guard figure in the fixed-phase table is the observed mean when the student
    // re-presses, not the cold-open path; both numbers are true and the table says which is which."
    const accept = COLD_OPEN.path.find((p) => p.step === 'guard-accept').s;
    assert.equal(accept, 4);
    assert.equal(FIXED_PHASES.JOB.default.phases.guard, 12);
    assert.ok(accept < FIXED_PHASES.JOB.default.phases.guard,
      'accepting the pre-pressed mix is faster than re-pressing it, or the cold open is not a cold open');
  });

  test('the primary button costs 0 s — it is a tap, not a phase', () => {
    assert.equal(COLD_OPEN.path.find((p) => p.step === 'primary').s, 0);
  });

  test('the board read is the single most expensive step, and it is still under the 18 s the phase table spends on board + draft', () => {
    const board = COLD_OPEN.path.find((p) => p.step === 'board').s;
    assert.equal(board, 6);
    assert.ok(board < FIXED_PHASES.JOB.default.phases.board,
      'the pinned path does NOT draft; the 18 s board phase is the one that does');
  });
});

/* ================================================================================================
   2. THE MACHINERY — every step of the path exists in the code that serves it
   ================================================================================================ */

describe('J13 — step 1: Home paints a board and a primary that points at the job', () => {
  test('Home renders the board panel and its rows', () => {
    assert.match(HOME_JS, /section\.card\.home-board/, 'the panel');
    assert.match(HOME_JS, /ol\.board-rows/, 'the contract rows');
    assert.match(HOME_JS, /li\.board-row/);
    assert.match(HOME_JS, /btn\.btn-primary\.home-primary/, 'the primary button');
  });

  test('the primary is an anchor with an href once the CTA resolves (a tap, not a handler)', () => {
    assert.match(HOME_JS, /h\('a\.btn\.btn-primary\.home-primary', \{ href: primaryHref/);
  });

  test('the board panel names the shape, the minutes, the end time and the split', () => {
    for (const cls of ['b-shape', 'b-min', 'b-ends', 'b-split']) {
      assert.ok(HOME_JS.includes(cls), `the board's meta line is missing .${cls}`);
    }
  });
});

describe('J13 — step 2+3: the job screen accepts the pre-pressed mix and seals the envelope', () => {
  test('Enter is bound to the primary when nothing else is interactive (G1: "Enter to accept")', () => {
    assert.equal(KEYS.push, 'Enter');
    assert.match(JOB_JS, /if \(k === KEYS\.push && !interactive\) \{ ev\.preventDefault\(\); root\.querySelector\('\.job-primary'\)\?\.click\(\); \}/);
  });

  test('the tokens the primary accepts are the board\'s own pre-pressed mix, not an empty press', () => {
    assert.match(JOB, /board\?\.press\?\.tokens/, 'the press panel starts from board.press.tokens');
    assert.match(JOB_JS, /onclick: \(\) => startOrGo\(tokens\)/);
  });

  test('the first envelope default-focuses a call rung, so the call is one key', () => {
    assert.match(JOB_JS, /focusFirst\(panel, '\.job-call'\)/);
    assert.deepEqual([...KEYS.call], ['1', '2', '3', '4']);
  });

  test('the stem is unreachable before the call: the envelope renders `envelopeFor()` and nothing else', () => {
    const fn = /function renderEnvelope\(\)[\s\S]*?\n  \}/.exec(JOB)?.[0] ?? '';
    assert.ok(fn.length > 200, 'renderEnvelope not found — this assertion has gone stale');
    for (const banned of ['cardById[', 'createCardView', 'T.generate', 'stemRefFor']) {
      assert.ok(!fn.includes(banned), `renderEnvelope reaches the stem through ${banned}`);
    }
  });
});

describe('J13 — the cold path stays cold: nothing heavy is imported statically', () => {
  test('home.js imports page.js and plan.js dynamically (G10 #21 — the test wins, so the board pays in passes)', () => {
    assert.ok(!/from '\.\.\/page\.js'/.test(HOME_JS), 'a static page.js import would put 233 KB of cards on the cold path');
    assert.ok(!/from '\.\.\/plan\.js'/.test(HOME_JS), 'a static plan.js import would put 311 KB of generators on the cold path');
    assert.match(HOME_JS, /import\('\.\.\/page\.js'\), import\('\.\.\/plan\.js'\)/, 'they are fetched, just not statically');
  });

  test('home.js does not statically import the game modules the board needs in pass 2 either', () => {
    for (const mod of ['job/board.js', 'job/crew.js', 'job/econ.js', 'job/state.js']) {
      assert.ok(!new RegExp(`^import[^\\n]*from '\\.\\./${mod.replace('/', '\\/')}'`, 'm').test(HOME_JS),
        `${mod} is imported statically by Home — pass 1 must need nothing but the save`);
    }
  });

  test('the app shell does not pull data/job.js\'s tables onto the cold path (J6 kept the header ids literal)', () => {
    assert.ok(!/from '\.\.?\/data\/job\.js'/.test(APP_JS) && !/from '\.\/data\/job\.js'/.test(APP_JS),
      'app.js must not statically import data/job.js');
  });
});

/* ================================================================================================
   3. TWO PASSES — no spinner, reserved geometry, ink-only writes
   ================================================================================================ */

describe('J13 — the board paints in two passes', () => {
  test('pass 1 stamps data-pass="1" and pass 2 stamps data-pass="2"', () => {
    assert.match(HOME_JS, /dataset: \{ kind: model\.gate\.kind, pass: '1'/);
    assert.match(HOME_JS, /panel\.dataset\.pass = '2';/);
  });

  test('every pass-2 numeral occupies its FINAL width in pass 1 (G7: "--muted placeholders")', () => {
    const fn = /function numeral\([\s\S]*?\n\}/.exec(HOME_JS)?.[0] ?? '';
    assert.ok(fn.includes('minWidth'), 'numeral() must reserve its width in ch');
    assert.match(fn, /minWidth: `\$\{chars\}ch`/);
    assert.ok(fn.includes("dataset.pending = '1'"), 'a placeholder has to be findable');
    assert.ok(fn.includes("classList.add('muted')"), 'G7 says the placeholder is --muted');
  });

  test('pass 2 writes ink and nothing else: textContent, never replaceChildren or innerHTML', () => {
    const fn = /export function fillBoard\([\s\S]*?\n\}/.exec(HOME_JS)?.[0] ?? '';
    assert.ok(fn.length > 400, 'fillBoard not found — this assertion has gone stale');
    assert.ok(!fn.includes('replaceChildren'), 'fillBoard must not rebuild a row');
    assert.ok(!fn.includes('innerHTML'), 'fillBoard must not rewrite markup');
    assert.ok(!fn.includes('.append('), 'fillBoard must not add a node that changes the panel height');
    const setter = /function setNumeral\([\s\S]*?\n\}/.exec(HOME_JS)?.[0] ?? '';
    assert.match(setter, /node\.textContent = String\(text\);/);
  });

  test('the row list reserves its full height before pass 2 knows how many contracts there are', () => {
    assert.match(HOME_JS, /minHeight: `\$\{model\.reserve \* BOARD_ROW_PX\}px`/);
    assert.ok(BOARD.postedMax >= 3, 'the reserve comes from data/job.js BOARD.postedMax');
  });

  test('there is no spinner: pass 1 is a readable board, not a loading state', () => {
    const fn = /function boardPanel\(model\)[\s\S]*?\n\}/.exec(HOME_JS)?.[0] ?? '';
    assert.ok(fn.length > 400, 'boardPanel not found — this assertion has gone stale');
    for (const banned of ['aria-busy', 'spinner', 'skeleton', 'shimmer', 'progressbar', "'Loading"]) {
      assert.ok(!fn.includes(banned), `the board panel contains ${banned}`);
    }
  });

  test('the 36 px collapsed board the cold-open path lands on is data/job.js\'s number', () => {
    assert.equal(LAYOUT.boardCollapsedPx, 36);
    const v = /--job-board-collapsed:\s*(\d+)px/.exec(JOB_CSS);
    assert.ok(v, 'css/job.css does not define --job-board-collapsed');
    assert.equal(Number(v[1]), LAYOUT.boardCollapsedPx, 'the CSS custom property and data/job.js disagree');
  });
});

/* ================================================================================================
   4. MEASURED — the walk, in a real browser
   ================================================================================================ */

const REPO = repoPath('.');
const DRIVER = path.join(REPO, 'qa', 'job-walk.mjs');
const REPORT = path.join(REPO, 'qa', 'screenshots', 'job-walk', 'report-gate.json');

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

/** The gate walk, run at most once per suite however many tests ask for it. */
let GATE;
function gate() {
  if (GATE !== undefined) return GATE;
  GATE = spawnSync(process.execPath, [DRIVER, 'gate', '--engines', 'chromium'],
    { cwd: REPO, timeout: 600_000, encoding: 'utf8' });
  try { GATE.report = JSON.parse(readFileSync(REPORT, 'utf8')); } catch { GATE.report = null; }
  return GATE;
}

test('J13 measured: a COLD visit reaches the first answer inside 20 s on the pinned path', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed (run: cd qa && npx playwright install chromium webkit)'); return; }
  const run = gate();
  assert.equal(run.status, 0, `qa/job-walk.mjs gate failed\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /ALL PASS/);
  const m = /FIRST ANSWER at\s+(\d+) ms/.exec(run.stdout);
  assert.ok(m, `no FIRST ANSWER measurement in the walk's output:\n${run.stdout}`);
  const ms = Number(m[1]);
  assert.ok(ms <= COLD_OPEN.budgetS * 1000, `first answer at ${ms} ms, over the ${COLD_OPEN.budgetS * 1000} ms budget`);
  // and it has to be a real walk: the 15 s of published human time must actually have been spent
  assert.ok(ms >= 15_000, `the walk finished in ${ms} ms — it did not park G1's 15 s of human time`);
});

test('J13 measured: the board is on screen BEFORE page.js and plan.js arrive (that is what two passes means)', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const run = gate();
  const paint = /board pass 1 \/ pass 2\s+(\d+) ms \((\d+) pending numerals\) → (\d+) ms/.exec(run.stdout);
  const heavy = /page\.js \/ plan\.js \(lag \d+ ms\)\s+(\d+) ms \/ (\d+) ms/.exec(run.stdout);
  assert.ok(paint && heavy, `the walk did not print the two-pass timings:\n${run.stdout}`);
  const [, pass1, pending, pass2] = paint.map(Number);
  const [, pageJs, planJs] = heavy.map(Number);
  assert.ok(pending > 0, 'the first board frame had no pending numerals — there was only one pass');
  assert.ok(pass1 < pageJs, `the board painted at ${pass1} ms, page.js arrived at ${pageJs} ms`);
  assert.ok(pass1 < planJs, `the board painted at ${pass1} ms, plan.js arrived at ${planJs} ms`);
  assert.ok(pass2 >= pageJs, `pass 2 at ${pass2} ms cannot precede the module it needs (${pageJs} ms)`);
});

test('J13 measured: every probability printed on every frame of the walk matches guard.js / call.js', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const run = gate();
  const m = /printed probabilities checked: (\d+), mismatched: (\d+)/.exec(run.stdout);
  assert.ok(m, `the walk did not print its probability audit:\n${run.stdout}`);
  assert.ok(Number(m[1]) > 0, 'the walk checked no probabilities at all');
  assert.equal(Number(m[2]), 0, `${m[2]} printed probabilities disagree with the modules that compute them`);
});

test('J13 measured: no frame of the cold open scrolls horizontally', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const run = gate();
  assert.ok(!/horizontal scroll/.test(run.stdout), `the walk found horizontal overflow:\n${run.stdout}`);
});

/* ================================================================================================
   5. THE TWO CRITERIA THAT DID NOT HOLD AS SHIPPED — both now do
   J13 wrote these as `todo`s because their fixes lived in `site/js/screens/home.js`, which J13 does
   not own. Integration made both changes (notes/J13.md Requests 1 and 2), so they are ordinary
   assertions now and the counterexamples below are the measurements they are defended against:
     · the cold-crew strip took 47.69 px out of the panel between the passes (515.13 → 467.44);
     · Home posted A 173 · B 171 · C 216 · D 216 and the job screen re-priced them to 189/202/247/231.
   `qa/job-walk.mjs`'s known-open register is now EMPTY, so either defect returning fails the walk
   outright instead of merely printing — which is what the last test here holds it to.
   ================================================================================================ */

test('J13 — ZERO layout shift between the board\'s two passes', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const known = gate().report?.known ?? [];
  const crew = known.find((k) => k.id === 'home-board-crew-strip');
  assert.equal(crew, undefined, crew ? crew.measured : 'ok');
  assert.match(gate().stdout, /shift INSIDE the board 1→2\s+ZERO/,
    'the walk did not report a zero inner shift — the two passes moved a box inside the panel');
});

test('J13 — the posted value Home prints is the posted value the job screen charges (G1 law 4)', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const known = gate().report?.known ?? [];
  const tell = known.find((k) => k.id === 'home-board-no-tell');
  assert.equal(tell, undefined, tell ? tell.measured : 'ok');
  assert.match(gate().stdout, /posted, Home → job screen\s+identical/,
    'Home and the job screen printed different posted values for the same board');
});

test('the known-open register is EMPTY — nothing may hide in it', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed'); return; }
  const known = (gate().report?.known ?? []).map((k) => k.id).sort();
  assert.deepEqual(known, [],
    'a defect was swallowed by the known-open list instead of failing the walk — see qa/job-walk.mjs KNOWN');
});
