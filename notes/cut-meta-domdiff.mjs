// notes/cut-meta-domdiff.mjs — §9's evidence, in a real browser.
//
// THE QUESTION: is `settings.game = false` byte-identical COMPOSED, as CUT-BRIEF ("The Law of Two
// Ledgers") and CUT-SPEC §8 both publish?
//
// `tests/cut-meta.test.mjs` §9 holds that claim at the SOURCE, which is where it can be held in
// plain node with no browser. This script holds it at the DOM, which is where the round-2 critic
// found it false — and it is the shape of proof the three tests that carry the claim cannot give,
// because all three compare game-ON against game-OFF inside the SHIPPED build and an ungated change
// is in both arms.
//
// It renders the same save on both trees and diffs `#view`. The pre-game tree is extracted, not
// checked out — nothing touches the index or HEAD:
//
//   mkdir -p /tmp/pregame && git archive 3a57ff5 | tar -x -C /tmp/pregame
//   node notes/cut-meta-domdiff.mjs site /tmp/pregame/site /tmp/pregame/qa/fixtures/audit
//
// `3a57ff5` is the last commit before any game code. `ca53259` is the PRE-REPAIR GAME commit and is
// the wrong baseline — it already carries the elaborate layer.
//
// Measured 2026-09-22 over 11 pre-game audit fixtures × 7 routes: 2 of 77 cells differ, both the
// plan-pill href (UNGATED `plan.js:self-href`). The same-route probe differs on every route with a
// self-href anchor in the header (UNGATED `app.js:same-route-click`). Neither is gated by the flag.
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'qa', 'x.cjs'));
const { chromium } = require('playwright');

const [SHIPPED, PREGAME, FIXDIR] = process.argv.slice(2);
if (!SHIPPED || !PREGAME || !FIXDIR) {
  console.error('usage: node notes/cut-meta-domdiff.mjs <shipped site/> <pre-game site/> <fixture dir>');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

async function serve(root) {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('dir');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found: ' + p); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

const A = await serve(SHIPPED), B = await serve(PREGAME);
const browser = await chromium.launch();

/** Every route a study-only student can reach without the game. */
const ROUTES = ['#/today', '#/binder', '#/stats', '#/mock', '#/sheet', '#/plan', '#/night'];

async function render(port, saveJson, route) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  // Warm up on a non-app URL so the app cannot boot and write a fresh save over the fixture.
  await page.goto(`http://127.0.0.1:${port}/version.js`, { waitUntil: 'load' });
  await page.evaluate(j => localStorage.setItem('u1a.save', j), saveJson);
  await page.goto(`http://127.0.0.1:${port}/${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const html = await page.evaluate(() => document.getElementById('view')?.innerHTML ?? '(no #view)');
  const links = await page.evaluate(() => {
    const strip = document.getElementById('plan-strip');
    return {
      pillAnchors: strip ? strip.querySelectorAll('a').length : -1,
      pillLinks: strip ? strip.querySelectorAll('a[href]').length : -1,
      viewLinks: document.querySelectorAll('#view a[href]').length,
    };
  });
  // The same-route probe: click an anchor whose href IS the current URL and see whether the study
  // app re-mounts the screen under the student. COMPOSED does nothing; the shipped build re-mounts.
  const sameRoute = await page.evaluate(async () => {
    const a = [...document.querySelectorAll('a[href^="#"]')].find(x => x.href === location.href);
    if (!a) return { found: false };
    const view = document.getElementById('view');
    const first = view?.firstElementChild;
    a.click();
    await new Promise(r => setTimeout(r, 300));
    return { found: true, cls: a.className || '(none)', remounted: first !== document.getElementById('view')?.firstElementChild };
  });
  await ctx.close();
  return { html, links, sameRoute, errors };
}

const files = (await readdir(FIXDIR)).filter(f => f.endsWith('.json')).sort();
const rows = [];
for (const f of files) {
  const save = JSON.parse(await readFile(path.join(FIXDIR, f), 'utf8'));
  save.settings = save.settings || {};
  save.settings.game = false;                                   // the claim is about this line
  const json = JSON.stringify(save);
  for (const route of ROUTES) {
    const ship = await render(A.port, json, route);
    const pre = await render(B.port, json, route);
    const same = ship.html === pre.html;
    rows.push({ f, route, same, ship, pre });
    if (!same) {
      const la = ship.html.split('><').join('>\n<').split('\n');
      const lb = pre.html.split('><').join('>\n<').split('\n');
      console.log(`\nDIFF ${f} ${route}`);
      for (let i = 0, shown = 0; i < Math.max(la.length, lb.length) && shown < 6; i++) {
        if (la[i] !== lb[i]) {
          console.log(`  PRE  ${(lb[i] ?? '(none)').slice(0, 180)}`);
          console.log(`  SHIP ${(la[i] ?? '(none)').slice(0, 180)}`);
          shown++;
        }
      }
    }
  }
}

console.log('\n=== SUMMARY (pre-game → shipped, settings.game = false) ===');
for (const r of rows) {
  console.log(`${r.same ? 'SAME' : 'DIFF'}  ${r.f.padEnd(16)} ${r.route.padEnd(9)}`
    + `  strip links ${r.pre.links.pillLinks}→${r.ship.links.pillLinks}`
    + `  #view links ${r.pre.links.viewLinks}→${r.ship.links.viewLinks}`
    + `  same-route remount ${r.pre.sameRoute.remounted}→${r.ship.sameRoute.remounted}`
    + `  errors ${r.pre.errors.length}/${r.ship.errors.length}`);
}
const bad = rows.filter(r => !r.same).length;
console.log(`\n${bad} of ${rows.length} route × fixture cells differ`);

await browser.close(); A.server.close(); B.server.close();
process.exit(bad ? 1 : 0);
