// tests/_run-again.mjs — THE MEASURED HALF of "a link to the route you are already on must act".
// Driven by `tests/run-lane-v3.test.mjs` §3 (which skips when no Playwright browser is installed,
// exactly as `tests/job-screen.test.mjs` does); run it by hand with
//
//     node tests/_run-again.mjs                    # chromium
//     node tests/_run-again.mjs --engines chromium,webkit
//
// WHY IT EXISTS (verify round 3, player-feel — BLOCKER). `site/js/app.js`'s whole router was
//
//     window.addEventListener('hashchange', route);
//
// and the debrief's repeat control is `h('a.btn', { href: '#/run/job' }, 'Another board')` rendered
// BY the screen at `#/run/job`. An anchor whose href resolves to the current URL fires no
// `hashchange`, so `route()` never ran and the one button that says you can play again did
// nothing — while a manual reload of the very same URL posted a board, so the route was never
// broken, only the link. The same shape is every "again" control in the app: `Another page`
// (`#/run/page`, rendered at `#/run/page`) and `againLabel(kind)` (`#/run/:kind/:id`, rendered at
// `#/run/:kind/:id`). `screens/onboard.js:624` already carried the workaround in a comment —
// *"`&intro=1` only makes the hash differ … so the ← anchor fires a hashchange"* — which is the
// tell that the hazard was known and unhandled.
//
// It measures the CONTROL, not the route: every press below is a real click on the rendered anchor,
// found by its own label, with no scripted navigation and no reload anywhere in the file. A driver
// that reached nothing reports no failures either, so the states it reached are printed and
// asserted by the test that spawns it.
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

/* THE CLOCK — `plan.js` closes the board after 22:00, so a suite run at 02:00 would measure the
   "Board closed" panel and pass every rule vacuously. Same idiom as `qa/job-screen.mjs`'s
   CLOCK_INIT and `tests/_job-reach.mjs`: a constant offset onto tonight at 19:30, installed before
   any app code runs. */
const real = new Date(); const want = new Date(real); want.setHours(19, 30, 0, 0);
const OFFSET = want.getTime() - real.getTime();
const CLOCK = `(()=>{const R=Date,O=${OFFSET};const at=()=>R.now()+O;`
  + `window.Date=new Proxy(R,{construct(t,a){return a.length?new t(...a):new t(at());},`
  + `get(t,k){return k==='now'?at:Reflect.get(t,k);}});})();`;

/** Everything a press can be judged by, read in one evaluate. */
const PROBE = () => {
  const screen = document.querySelector('.job-screen');
  const actions = document.querySelector('.run-actions');
  return {
    hash: location.hash,
    reloads: window.__routeReloads ?? 0,
    phase: screen?.dataset.phase ?? null,
    jobScreen: !!screen,
    summary: !!document.querySelector('.run-summary, .sum-job-take'),
    contracts: document.querySelectorAll('.job-contracts').length,
    contractRows: document.querySelectorAll('.job-contract').length,
    primary: document.querySelector('.job-primary')?.textContent?.trim() ?? null,
    actionLinks: actions ? [...actions.querySelectorAll('a[href]')].map((a) => `${a.textContent.trim()} -> ${a.getAttribute('href')}`) : [],
  };
};

/* A press is only a press if the page never navigated: this counts full document loads, so a fix
   that "works" by reloading the app (losing every in-memory screen) cannot pass this driver. */
const COUNT_LOADS = () => { window.__routeReloads = (Number(sessionStorage.getItem('__rl') || 0) + 1); sessionStorage.setItem('__rl', String(window.__routeReloads)); };

const fails = [];
const rows = [];
const fail = (where, what) => fails.push(`${where}: ${what}`);

for (const engine of ENGINES) {
  const browser = await playwright[engine].launch();

  /* ---- 1. THE BLOCKER ITSELF: the debrief's `Another board` posts a board, in place ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.addInitScript(CLOCK);
    await ctx.addInitScript(COUNT_LOADS);
    const page = await ctx.newPage();
    const where = `${engine} job-debrief`;
    try {
      await byId.get('job-debrief').prepare(page);
      await page.waitForTimeout(400);
      const before = await page.evaluate(PROBE);
      rows.push(`${where.padEnd(26)} BEFORE hash=${before.hash} phase=${before.phase} summary=${before.summary} `
        + `loads=${before.reloads} actions=${JSON.stringify(before.actionLinks)}`);
      if (!before.summary) { fail(where, `the debrief never rendered (phase "${before.phase}") — nothing to press`); }
      else {
        const btn = page.locator('.run-actions a', { hasText: /^Another board$/ });
        if (await btn.count() !== 1) {
          fail(where, `the debrief renders ${await btn.count()} controls labelled "Another board" — COMPOSED-GAME.md publishes exactly one`);
        } else {
          const href = await btn.getAttribute('href');
          await btn.click();
          await page.waitForTimeout(900);
          const after = await page.evaluate(PROBE);
          rows.push(`${where.padEnd(26)} AFTER  hash=${after.hash} phase=${after.phase} summary=${after.summary} `
            + `loads=${after.reloads} contracts=${after.contracts} rows=${after.contractRows} primary=${JSON.stringify(after.primary)}`);
          if (after.reloads !== before.reloads) fail(where, `the press reloaded the document (${before.reloads} → ${after.reloads}) — an in-app control must not`);
          if (after.phase !== 'board') fail(where, `pressed "Another board" (href ${href}) and the screen is at phase "${after.phase}" — no board was posted`);
          if (after.contracts < 1) fail(where, 'no .job-contracts list after the press');
          if (after.contractRows < 1) fail(where, 'the posted board has no contract rows');
          if (!after.primary) fail(where, 'no .job-primary after the press — the board cannot be started');
          if (after.summary) fail(where, 'the debrief is still on screen after the press');
        }
      }
    } catch (e) { fail(where, `could not prepare: ${String(e?.message ?? e).slice(0, 160)}`); }
    await ctx.close();
  }

  /* ---- 2. THE CLASS: the FLAT path's own repeat control, on a screen the layer never touches --
     `screens/run.js` renders the Page Summary's primary as `#/run/page` while the summary itself is
     mounted at `#/run/page`, so it was inert for exactly the same reason. This rule is here so a
     future router change cannot fix the game layer and leave the study layer's button dead. */
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await ctx.addInitScript(CLOCK);
    await ctx.addInitScript(COUNT_LOADS);
    const page = await ctx.newPage();
    const where = `${engine} run-page-summary`;
    try {
      await byId.get('run-page-summary').prepare(page);
      await page.waitForTimeout(400);
      const before = await page.evaluate(PROBE);
      rows.push(`${where.padEnd(26)} BEFORE hash=${before.hash} summary=${before.summary} loads=${before.reloads} `
        + `actions=${JSON.stringify(before.actionLinks)}`);
      const btn = page.locator('.run-actions a.btn-primary').first();
      const href = await btn.getAttribute('href');
      const label = (await btn.textContent())?.trim();
      const same = new URL(href, `${BASE}index.html${before.hash}`).hash === before.hash;
      if (!before.summary) fail(where, 'the Page Summary never rendered — nothing to press');
      else if (!same) rows.push(`${where.padEnd(26)} SKIP   primary "${label}" -> ${href} is not the route it is rendered at`);
      else {
        await btn.click();
        await page.waitForTimeout(900);
        const after = await page.evaluate(PROBE);
        rows.push(`${where.padEnd(26)} AFTER  hash=${after.hash} summary=${after.summary} loads=${after.reloads} primary=${JSON.stringify(label)}`);
        if (after.reloads !== before.reloads) fail(where, `the press reloaded the document (${before.reloads} → ${after.reloads})`);
        if (after.summary) fail(where, `pressed "${label}" (href ${href}, the route it is rendered at) and the summary is still on screen`);
      }
    } catch (e) { fail(where, `could not prepare: ${String(e?.message ?? e).slice(0, 160)}`); }
    await ctx.close();
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
