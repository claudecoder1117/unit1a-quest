// qa/cut-run-r2.mjs — THE CUT, lane "run", round 2: the two exploit-hunt findings, driven in the
// SHIPPED app, where a source scan cannot settle them. Prints a table and `ALL PASS` / `FAIL`.
// Harness copied from qa/cut-home.mjs: in-process static server on port 0, Chromium at 375x667, the
// save injected into localStorage before the first script runs (set ONCE — see below).
//
//   1. #/run/page served the LIVE session's own queue: the question could be read before the bid,
//      and any question answered there for nothing with the streak intact. Reached by the browser
//      BACK button, which is what this file drives — goBack() over a real history entry.
//   2. Finishing that page there ran `finishPage`, which cleared `inProgress` and threw the whole
//      unbanked pile away without a word.
//
// Negative control: delete the `handoffFor` guard from `screens/run.js mountRun` and rows 3, 4, 5
// and 9 fail, row 5 printing the question itself ("In the figure, F is b...").
//
// Usage: node qa/cut-run-r2.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const SITE = path.join(REPO, 'site');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const { fresh } = await import(path.join(SITE, 'js', 'store.js'));
const { todayISO, addDays } = await import(path.join(SITE, 'js', 'days.js'));

function student() {
  const now = Date.now();
  const s = fresh(now);
  s.profileId = 'cutrunr2';
  s.settings.testDate = addDays(todayISO(), 7);
  s.placement = { done: true, at: now };
  s.xp = 1840;
  return s;
}

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

const rows = [];
const fails = [];
const ok = (label, cond, detail) => { rows.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail == null ? '' : ` — ${detail}`}`); if (!cond) fails.push(label); };

const readSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('u1a.save') || 'null'));
const shape = (s) => ({
  hasGame: !!s?.inProgress?.game,
  pile: s?.inProgress?.game?.pile ?? null,
  streak: s?.inProgress?.game?.streak ?? null,
  idx: s?.inProgress?.idx ?? null,
  today: s?.game?.today ?? null,
  best: s?.player?.best ?? null,
});

/** Flat runner on screen? Job screen on screen? What can the student read? */
const view = (page) => page.evaluate(() => ({
  hash: location.hash,
  flat: !!document.querySelector('section.run-screen[data-kind="page"]'),
  job: !!document.querySelector('section.job-screen'),
  progress: document.querySelector('.run-progress-n')?.textContent?.trim() ?? null,
  text: (document.querySelector('#view')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
}));

const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const page = await ctx.newPage();
// set ONCE: this script runs on every document, and re-seeding would wipe the live session mid-test
await page.addInitScript((json) => {
  if (!window.localStorage.getItem('u1a.save')) window.localStorage.setItem('u1a.save', json);
}, JSON.stringify(student()));

/* ---- the finding's own path: #/run/page is in the tab's history, then the session starts ---- */
await page.goto(base + '#/run/page');
await page.waitForSelector('section.run-screen[data-kind="page"]', { timeout: 20000 });
await page.waitForTimeout(400);
const A = await view(page);
ok('a plain Today\'s Page still runs when no session is live', A.flat && !A.job, `${A.hash} progress=${A.progress}`);

await page.goto(base + '#/run/job');
await page.waitForSelector('section.job-screen', { timeout: 20000 });
await page.waitForTimeout(500);
// the pile and streak of the finding's fixture, written through the record the engine owns
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('u1a.save'));
  s.inProgress.game.pile = 300; s.inProgress.game.streak = 4;
  localStorage.setItem('u1a.save', JSON.stringify(s));
});
await page.reload();
await page.waitForSelector('section.job-screen', { timeout: 20000 });
await page.waitForTimeout(500);
const before = shape(await readSave(page));
ok('a session is live at pile 300 x4', before.hasGame && before.pile === 300 && before.streak === 4, JSON.stringify(before));

/* ---- 1. the BACK button, the way the finding drove it ---- */
await page.goBack();
await page.waitForTimeout(700);
const B = await view(page);
ok('BACK over a live session does not serve the queue flat', B.flat === false, `hash=${B.hash} flat=${B.flat} job=${B.job}`);
ok('…it lands on the screen that owns the session', B.hash === '#/run/job' && B.job === true, `hash=${B.hash} job=${B.job}`);
ok('…and the question is still face-down', !/Write the symbol|In the figure/i.test(B.text), JSON.stringify(B.text.slice(0, 80)));

const afterBack = shape(await readSave(page));
ok('…the pile and the streak are exactly as they were', afterBack.pile === 300 && afterBack.streak === 4, JSON.stringify(afterBack));
ok('…and the page did not move under the student', afterBack.idx === before.idx, `idx ${before.idx} -> ${afterBack.idx}`);

/* ---- 2. BACK is not trapped: the replaced entry means BACK still goes back ---- */
await page.goBack();
await page.waitForTimeout(700);
const C = await view(page);
ok('BACK again leaves the run (no back-button trap)', C.hash !== '#/run/page', `hash=${C.hash}`);

/* ---- 3. the URL bar / Home's "Run a page" link, same session ---- */
await page.goto(base + '#/run/job');
await page.waitForSelector('section.job-screen', { timeout: 20000 });
await page.waitForTimeout(400);
await page.goto(base + '#/run/page');
await page.waitForTimeout(800);
const D = await view(page);
ok('typing #/run/page during a session serves nothing flat', D.flat === false && D.hash === '#/run/job', `hash=${D.hash} flat=${D.flat}`);
const afterUrl = shape(await readSave(page));
ok('…and nothing was banked, lost or finished', afterUrl.hasGame && afterUrl.pile === 300 && afterUrl.today === before.today && afterUrl.best === before.best, JSON.stringify(afterUrl));

console.log(rows.join('\n'));
console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL PASS');
await ctx.close();
await browser.close();
server.close();
process.exit(fails.length ? 1 : 0);
