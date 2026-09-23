// qa/cut-engine-r4.mjs — THE ENGINE LANE'S ROUND-4 EVIDENCE, in a real browser. Dev-only, never
// served, read-only about the repo: it seeds a save, serves `site/`, drives chromium at 375×812 and
// prints what the student sees.
//
//   node qa/cut-engine-r4.mjs
//
// A. THE CARD THAT ASKS NOTHING (finding 1). At an empty pile the table offers one call and bank is
//    dead, so the game no longer asks: the question is mounted straight away, the strip prints what
//    it pays, and the question costs ONE tap instead of two.
// B. THE REPEAT (finding 2). The copy a missed review puts back on the page is priced at nothing by
//    the engine, and the strip now says so by what it holds: the slot that carries `pays N` on every
//    paid question is EMPTY here, before the answer, with no word and no number added.
//
// The save for B is built by the SHIPPED engine in plain node — start a session, miss a review, play
// on until the requeued copy is the question on screen — so the browser mounts a state the app
// really reaches rather than one this file invented.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const require = createRequire(path.join(REPO, 'qa', 'package.json'));
const { chromium } = require('playwright');

const { fresh } = await import(`${SITE}/js/store.js`);
const { pageOpts } = await import(`${SITE}/js/plan.js`);
const JOB = await import(`${SITE}/js/job/state.js`);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE)) { res.writeHead(403); res.end('no'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const T0 = Date.parse('2026-09-22T16:00:00Z');
const CLEAR = { cleared: true, clean: true, firstTry: true, attempt: 1, hints: 0 };
const MISS = { cleared: false, attempt: 3, hints: 2 };

/** The audit fixture — a midweek save with reviews due, which is what a repeat needs. */
const { readFileSync, existsSync } = await import('node:fs');
const { freshen } = await import('./fixtures/audit-build.mjs');
const FIX = ['fixtures/audit/midweek.json', 'fixtures/midweek.json']
  .map((f) => path.join(REPO, 'qa', f)).find(existsSync);

/** A save with a session open, played with the shipped verbs until `stop` says so. */
function seed(stop) {
  const s = FIX ? freshen(JSON.parse(readFileSync(FIX, 'utf8'))) : fresh(T0 - 6 * 86_400_000);
  s.profileId = 'r4';
  s.settings.testDate = '2026-09-25';
  delete s.inProgress;
  JOB.startJob(s, { ...pageOpts(s), now: T0 });
  let t = T0;
  for (let i = 0; i < 40 && JOB.targetsLeft(s) > 0; i++) {
    const it = JOB.currentItem(s);
    if (stop(it, s)) return s;
    if (!JOB.stateOf(s).call) JOB.call(s, JOB.callsFor(s)[0], { now: (t += 4000), ms: 4000 });
    const review = !!(it.isReview || it.isRematch);
    JOB.answer(s, review && !it.requeued ? MISS : CLEAR, { now: (t += 12_000), ms: 12_000 });
  }
  return s;
}

const strip = (page) => page.evaluate(() => [...document.querySelectorAll('.job-slot')].map((el) => ({
  slot: el.dataset.slot,
  value: el.querySelector('.job-slot-v')?.textContent.trim() ?? '',
  marks: el.querySelectorAll('.job-mark').length,
})));

const shape = (page) => page.evaluate(() => ({
  phase: document.querySelector('.job-screen')?.dataset.phase ?? null,
  faceDown: !!document.querySelector('.job-face-down'),
  liveCalls: [...document.querySelectorAll('.job-call')].filter((b) => !b.disabled).map((b) => b.textContent.trim()),
  bank: document.querySelector('.job-bank') ? (document.querySelector('.job-bank').disabled ? 'greyed' : 'live') : 'absent',
  question: !!document.querySelector('.card-screen'),
  sealed: (() => { try { return JSON.parse(localStorage.getItem('u1a.save')).inProgress.game.call; } catch { return null; } })(),
}));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('   console error:', m.text()); });

async function open(save) {
  await page.goto(BASE + 'version.js', { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister().catch(() => {});
  }).catch(() => {});
  await page.evaluate((j) => localStorage.setItem('u1a.save', j), JSON.stringify(save));
  await page.goto(BASE + '#/run/job', { waitUntil: 'networkidle' });
  await page.waitForSelector('.job-screen', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(900);
}

/* ------------------------------------------------------- A. the first card of a fresh session */
const first = fresh(T0 - 6 * 86_400_000);
first.profileId = 'r4a';
first.settings.testDate = '2026-09-25';
await open(first);
console.log('A. THE FIRST CARD OF A SESSION — pile 0, one call, nothing to bank');
console.log('   strip :', JSON.stringify(await strip(page)));
console.log('   screen:', JSON.stringify(await shape(page)));

/* ------------------------------------------------------- B. the requeued review */
const repeat = seed((it) => (it?.requeued ?? 0) > 0);
const cur = JOB.currentItem(repeat);
if (!cur || !(cur.requeued > 0)) {
  console.log('\nB. no requeued review was reached on this fixture — nothing to show');
} else {
  await open(repeat);
  console.log('\nB. THE REQUEUED REVIEW — the game prices it at nothing, and the strip says so');
  console.log('   item  :', cur.id, 'requeued', cur.requeued);
  console.log('   strip :', JSON.stringify(await strip(page)));
  console.log('   screen:', JSON.stringify(await shape(page)));
  await page.waitForTimeout(1200);                       // …and once the card has finished turning
  console.log('   strip :', JSON.stringify(await strip(page)), '(question up)');
  console.log('   screen:', JSON.stringify(await shape(page)));
  console.log('   …against A above, which is a PAID question in the same phase: `pays 8` in that slot.');
}

await browser.close();
server.close();
