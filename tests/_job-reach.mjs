// tests/_job-reach.mjs — THE MEASURED HALF of the board phase's two reachability rules, and of the
// board sheet's third term at the getaway. Driven by `tests/job-screen.test.mjs` (which skips when
// no Playwright browser is installed, exactly as the full-walk test does); run it by hand with
//
//     node tests/_job-reach.mjs                 # chromium
//     node tests/_job-reach.mjs --engines chromium,webkit
//
// WHY IT EXISTS. Three round-1-verification findings shared one sentence: *nothing measures it.*
//
//   · `.job-primary` — the control that starts every job — sat 344 px below the fold at 375x667 and
//     455 px at 320x568, at rest, in both engines. `qa/job-screen.mjs`'s reachability rules cover
//     the call row, the getaway, the payout beat and the brief; the BOARD phase has only the sheet
//     rule, and the cold-open walk presses `.job-primary` by script, so it never needed to be on
//     screen. `qa/layout-audit.mjs`'s offscreen detector only runs in its 'bottom' phase, where the
//     button has already been scrolled into view — job-board reported 0 findings at 17 viewports.
//   · `syncBoardFit`'s marks selector named `.job-getaway .run-actions`, which nothing renders, so
//     the measured cap was OFF at the one beat css/job.css:143 cites as its reason for existing.
//     A selector that matches nothing fails no test; a rendered phase that matches nothing does.
//   · the draft list is a 251 px window onto a 502 px list with no affordance at all.
//
// It is deliberately NOT a second walk: it opens two prepared states from `qa/audit-states.mjs` (the
// catalog `qa/layout-audit.mjs` is written against), measures rectangles at rest, and exits.
// The Request in notes/repair-screen.md asks the tests lane to fold these four rules into
// `qa/job-screen.mjs`'s own PROBE_REACH pass, where the rest of this family already lives.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const SITE = path.join(REPO, 'site');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const playwright = require('playwright');
const { states } = await import(path.join(REPO, 'qa/audit-states.mjs'));
/** the shipped selector itself, never a copy of it — that is the whole of rule 3 */
const { MARKS_SELECTOR } = await import(path.join(REPO, 'site/js/screens/job.js'));

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const ENGINES = argOf('engines', 'chromium').split(',').map((s) => s.trim()).filter(Boolean);

/* ------------------------------------------------------------------ the server (no dev server) */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE)) { res.writeHead(403).end(); return; }
  try {
    const st = await stat(f); if (!st.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const byId = new Map(states({ base: BASE }).map((s) => [s.id, s]));

/* THE CLOCK. `plan.js` closes the board after 22:00, so a suite run at 02:00 would measure the
   "Board closed" panel and pass every rule vacuously. Same idiom as `qa/job-screen.mjs`'s
   CLOCK_INIT: a constant offset onto tonight at 19:30, installed before any app code runs. */
const real = new Date(); const want = new Date(real); want.setHours(19, 30, 0, 0);
const OFFSET = want.getTime() - real.getTime();
const CLOCK = `(()=>{const R=Date,O=${OFFSET};const at=()=>R.now()+O;`
  + `window.Date=new Proxy(R,{construct(t,a){return a.length?new t(...a):new t(at());},`
  + `get(t,k){return k==='now'?at:Reflect.get(t,k);}});})();`;

/* ------------------------------------------------------------------ probes (run in the page) */

/** Every rectangle at rest, in the VISUAL viewport's band, with no scrolling of any kind. */
const PROBE = (marksSelector) => {
  const vv = window.visualViewport;
  const H = vv ? Math.round(vv.offsetTop + vv.height) : window.innerHeight;
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { y: Math.round(r.top), b: Math.round(r.bottom), inView: r.top >= -0.5 && r.bottom <= H + 0.5 };
  };
  const board = document.querySelector('.job-board');
  const screen = document.querySelector('.job-screen');
  const footer = document.querySelector('.job-start > .run-actions');
  return {
    H,
    phase: screen?.dataset.phase ?? null,
    scrollY: Math.round(window.scrollY),
    maxScroll: Math.round(document.documentElement.scrollHeight - document.documentElement.clientHeight),
    marks: document.querySelectorAll(marksSelector).length,
    fit: screen?.style.getPropertyValue('--job-board-fit') || '',
    footerPos: footer ? getComputedStyle(footer).position : null,
    contracts: document.querySelectorAll('.job-contract').length,
    teach: document.querySelector('.job-board-teach')?.textContent ?? '',
    boardfit: screen?.dataset.boardfit ?? 'open',
    fontSize: getComputedStyle(document.documentElement).fontSize,
    sheet: board
      ? {
        h: Math.round(board.getBoundingClientRect().height),
        scrollH: board.scrollHeight,
        clientH: board.clientHeight,
        overflowY: getComputedStyle(board).overflowY,
        gradients: (getComputedStyle(board).backgroundImage.match(/gradient\(/g) ?? []).length,
        bodyDisplay: board.querySelector('.job-board-body')
          ? getComputedStyle(board.querySelector('.job-board-body')).display : 'absent',
        /* the two numbers rule 5 is about: how many contract rows are WHOLLY inside the sheet's own
           window, and how many are below it — measured in the sheet's content coordinates, so a
           clipped row counts as clipped whatever the page has been scrolled to */
        whole: [...board.querySelectorAll('.job-contract')].filter((e) => {
          const q = e.getBoundingClientRect(); const c = board.getBoundingClientRect();
          return q.height > 0 && q.top >= c.top - 1 && q.bottom <= c.bottom + 1;
        }).length,
        below: [...board.querySelectorAll('.job-contract')].filter((e) => {
          const q = e.getBoundingClientRect();
          return q.height > 0 && q.bottom > board.getBoundingClientRect().bottom + 1;
        }).length,
      }
      : null,
    more: (() => {
      const m = board?.querySelector('.job-board-more');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { text: m.textContent, hidden: !!m.hidden, h: Math.round(r.height), inSheet: r.height > 0 };
    })(),
    rects: {
      '.job-primary': box('.job-primary'),
      '.job-crack': box('.job-crack'),
      '.job-walk': box('.job-walk'),
      '.job-calls': box('.job-calls'),
    },
  };
};

/* ------------------------------------------------------------------ the rules */

const fails = [];
const rows = [];
const fail = (where, what) => fails.push(`${where}: ${what}`);

/**
 * RULE 5 — **the clip declares its own remainder, and never shows a list it cannot show one row
 * of.** Round-2 verification measured `job-envelope 320×568: h=80 client=78 scrollH=677 rows=5
 * whole=0` — a 78 px window onto a 677 px list, one row sliced through its glyphs, with the round-1
 * affordances (`.job-board-teach`'s count, the scroll shadow) both scoped to `[data-phase="board"]`
 * and therefore absent. Two claims, at every phase and size this driver visits:
 *
 *   · if the sheet is showing the list at all and the list is clipped, at least ONE contract row is
 *     wholly inside it (otherwise the sheet must be in a measured `strip`/`off` state, which shows
 *     no rows and claims nothing about them);
 *   · `.job-board-more` says exactly how many rows are below the clip, and is hidden when none are.
 */
const moreRule = (where, m) => {
  if (!m.sheet || !m.more) { fail(where, 'no .job-board / .job-board-more to measure'); return; }
  /* A sheet in a measured `strip`/`off` state is not presenting the list — it is one ellipsised
     line, or `display: none`. Both claims below are about a sheet that IS presenting it, which is
     what `boardfit` answers and `bodyDisplay` alone cannot (in `off` the body's own computed
     display is untouched; it is the sheet above it that is gone). */
  const listed = m.boardfit === 'open' && m.sheet.bodyDisplay !== 'none' && m.contracts > 0;
  const clipped = m.sheet.scrollH > m.sheet.clientH + 1;
  if (!listed) {
    if (!m.more.hidden && m.more.text) {
      fail(where, `the sheet is in state "${m.boardfit}" and still says ${JSON.stringify(m.more.text)}`);
    }
    return;
  }
  if (listed && clipped && m.sheet.whole < 1) {
    fail(where, `the sheet shows ${m.contracts} contracts and not one of them whole `
      + `(h ${m.sheet.h}, client ${m.sheet.clientH}, content ${m.sheet.scrollH}, state "${m.boardfit}") — `
      + 'a sliced row is a list that looks finished; the strip says less and claims nothing false');
  }
  const want = m.sheet.below > 0 ? `${m.sheet.below} more ↓` : '';
  if (m.sheet.below > 0 && (m.more.hidden || m.more.text !== want)) {
    fail(where, `${m.sheet.below} contract rows are below the clip and the sheet says `
      + `${m.more.hidden ? '(hidden)' : JSON.stringify(m.more.text)} — the count has to be live`);
  }
  if (m.sheet.below === 0 && !m.more.hidden && m.more.text) {
    fail(where, `nothing is below the clip and the sheet still says ${JSON.stringify(m.more.text)}`);
  }
};

for (const engine of ENGINES) {
  const browser = await playwright[engine].launch();

  /* ---- 1 + 2. THE BOARD PHASE: the primary is reachable, and the clipped list says it is ---- */
  for (const [w, h] of [[375, 667], [320, 568]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.addInitScript(CLOCK);
    const page = await ctx.newPage();
    const where = `${engine} ${w}x${h} job-board`;
    try {
      await byId.get('job-board').prepare(page);
      await page.waitForTimeout(500);
      const m = await page.evaluate(PROBE, MARKS_SELECTOR);
      rows.push(`${where.padEnd(30)} phase=${m.phase} primary=${JSON.stringify(m.rects['.job-primary'])} `
        + `footer=${m.footerPos} sheet=${m.sheet?.clientH}/${m.sheet?.scrollH} grads=${m.sheet?.gradients} scrollY=${m.scrollY} fold=${m.H}`);
      if (m.phase !== 'board') { fail(where, `the screen is at phase "${m.phase}" — the board never posted`); }
      else {
        const p = m.rects['.job-primary'];
        if (!p) fail(where, '.job-primary has no box at the board phase');
        else if (!p.inView) fail(where, `.job-primary is ${p.b - m.H}px below the fold at rest (top ${p.y}, bottom ${p.b}, fold ${m.H}, scrollY ${m.scrollY})`);
        if (m.footerPos !== 'sticky') fail(where, `.job-start > .run-actions is position: ${m.footerPos} — it has to ride the fold`);
        if (!m.sheet) fail(where, 'no .job-board to measure');
        else if (m.sheet.scrollH > m.sheet.clientH + 1) {
          // the list IS clipped here, which is exactly when the affordance has to exist
          if (m.sheet.overflowY !== 'auto' && m.sheet.overflowY !== 'scroll') fail(where, `the clipped sheet is overflow-y: ${m.sheet.overflowY}`);
          if (m.sheet.gradients < 4) fail(where, `the clipped sheet paints ${m.sheet.gradients} gradient layers — the scroll shadow is the only affordance it has`);
        }
        if (m.contracts > 0 && !new RegExp(`\\b${m.contracts}\\b`).test(m.teach)) {
          fail(where, `the teach line does not name how many contracts there are (${m.contracts}): "${m.teach}"`);
        }
        moreRule(where, m);
      }
    } catch (e) { fail(where, `could not prepare: ${String(e?.message ?? e).slice(0, 120)}`); }
    await ctx.close();
  }

  /* ---- 3 + 4. THE GETAWAY: the marks selector matches, so the measured term actually runs ---- */
  for (const [id, sels] of [['job-getaway', ['.job-crack', '.job-walk']], ['job-envelope', ['.job-calls']]]) {
    for (const [w, h] of [[375, 667], [320, 568]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      await ctx.addInitScript(CLOCK);
      const page = await ctx.newPage();
      const where = `${engine} ${w}x${h} ${id}`;
      try {
        await byId.get(id).prepare(page);
        await page.waitForTimeout(600);
        const m = await page.evaluate(PROBE, MARKS_SELECTOR);
        rows.push(`${where.padEnd(30)} phase=${m.phase} marks=${m.marks} fit=${m.fit || '(unset)'} `
          + sels.map((s) => `${s}=${JSON.stringify(m.rects[s])}`).join(' '));
        if (m.marks < 1) {
          fail(where, `MARKS_SELECTOR ("${MARKS_SELECTOR}") matches nothing at this phase — `
            + 'syncBoardFit removes the cap and the board sheet is measured against nothing');
        }
        if (!m.fit) fail(where, 'the screen published no --job-board-fit, so the measured third term did not run');
        for (const s of sels) {
          const r = m.rects[s];
          if (!r) fail(where, `${s} has no box`);
          else if (!r.inView) fail(where, `${s} is ${r.b - m.H}px below the fold at rest (top ${r.y}, bottom ${r.b}, fold ${m.H}, scrollY ${m.scrollY})`);
        }
        moreRule(where, m);
      } catch (e) { fail(where, `could not prepare: ${String(e?.message ?? e).slice(0, 120)}`); }
      await ctx.close();
    }
  }

  /* ---- 6. THE SAME DECISIONS, AT THE STUDENT'S OWN TEXT SIZE ----------------------------------
     The configuration that exposed the round-2-verification BLOCKER, and the one no net in the repo
     ran: `html{font-size:20px}` installed BEFORE the state is prepared (a browser text-size
     setting, not a stylesheet dropped on a settled layout), at the narrowest supported phone.
     Measured before the repair, both engines, to the pixel:

       job-envelope 320x568 fs=20px board=36 fit=36px decision=457-584 fold=568  → 16px BELOW

     `board=36` was the measured term already at its floor — `LAYOUT.boardCollapsedPx` — with the
     decision still off screen, which is why the floor now has a state UNDER it (`data-boardfit
     = "off"`; see `syncBoardFit`). This rule is the net for that state: it fails if any of the
     staked beats puts its decision past the fold at rest at 20 px text.

     **AND `job-board` IS ONE OF THEM NOW** (round 3 verification, layout-safari, MAJOR). This list
     ran over the three staked beats and NOT over the board — the one decision every job starts
     with — because `syncBoardFit` excluded the board phase on the premise that its decision row
     "is sticky and rides the fold". It does not: a sticky box cannot be shifted above its
     containing block, and `.job-panel.job-start` puts ~600 px of content above that footer. So at
     20 px text, both engines, identical to the pixel:

       chromium/webkit zoom20 320x568  primary y=469 b=603 fold=568  → 35px BELOW
       chromium/webkit zoom20 844x390  primary y=322 b=398 fold=390  →  8px BELOW

     844x390 — the same phone turned sideways — joins the viewport list for the same reason: it is
     where the fold is tightest and it was measured by no rule in this file. (At plain 16 px the
     primary is in view everywhere, but the row's SECOND control was not: `320x568 today y=565
     b=609`, `844x390 today y=371 b=415` — rules 1+2 assert `.job-primary`, and that is the control
     the fit is budgeted for; `.job-start > .run-actions .btn-primary` is the mark `MARKS_SELECTOR`
     now carries.) */
  for (const [id, sels] of [['job-envelope', ['.job-calls']], ['job-getaway', ['.job-crack', '.job-walk']], ['job-vault', ['.job-calls']], ['job-board', ['.job-primary']]]) {
    const st = byId.get(id);
    if (!st) continue;
    for (const [w, h] of [[320, 568], [844, 390]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      await ctx.addInitScript(CLOCK);
      await ctx.addInitScript(() => {
        const apply = () => {
          const s = document.createElement('style');
          s.textContent = 'html{font-size:20px !important}';
          (document.head || document.documentElement).appendChild(s);
        };
        if (document.head) apply(); else document.addEventListener('DOMContentLoaded', apply, { once: true });
      });
      const page = await ctx.newPage();
      const where = `${engine} ${w}x${h} ${id} @20px`;
      try {
        await st.prepare(page);
        await page.waitForTimeout(700);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        const m = await page.evaluate(PROBE, MARKS_SELECTOR);
        rows.push(`${where.padEnd(30)} phase=${m.phase} fs=${m.fontSize} state=${m.boardfit} board=${m.sheet?.h} `
          + sels.map((s) => `${s}=${JSON.stringify(m.rects[s])}`).join(' '));
        for (const s of sels) {
          const r = m.rects[s];
          if (!r) fail(where, `${s} has no box`);
          else if (!r.inView) {
            fail(where, `${s} is ${r.b - m.H}px below the fold at rest with the text size at 20px `
              + `(top ${r.y}, bottom ${r.b}, fold ${m.H}, sheet ${m.sheet?.h}px, state "${m.boardfit}")`);
          }
        }
        moreRule(where, m);
      } catch (e) { fail(where, `could not prepare: ${String(e?.message ?? e).slice(0, 120)}`); }
      await ctx.close();
    }
  }

  await browser.close();
}

server.close();
for (const r of rows) console.log(r);
if (fails.length) {
  console.log(`\n${fails.length} FAIL`);
  for (const f of fails) console.log(`  ✖ ${f}`);
  process.exit(1);
}
console.log(`\nALL PASS · ${rows.length} measurements · engines ${ENGINES.join(', ')}`);
