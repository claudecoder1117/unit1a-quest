// qa/cut-run-r3.mjs — THE CUT, lane "run", round 3: THE DEADLOCK.
//
// Round 3's study-untouched critic found that with the game switch OFF and a live `inProgress.game`
// on the save, Today's Page was permanently unreachable:
//
//   #/today -> #/run/page -> #/run/job -> #/today -> #/run/page -> ... forever
//
// `handoffFor` (screens/run.js) handed `#/run/page` to `/run/job` on the RECORD alone, `mountJob`
// (screens/job.js) refused to mount on `!gameOn` and navigated to `/today` clearing nothing, and
// `plan.nextActionFor` returns Home's study `resume` action unrewritten with the switch off — so
// Home's own primary button pointed straight back into the loop and nothing healed the save.
//
// This file drives that state in the SHIPPED app, clicking Home's own primary button four times, and
// then checks the two things the fix must give back: Today's Page renders, and the dormant record is
// still there to be resumed if the switch comes back on.
//
// Negative control: `git diff`-free — restore `handoffFor` to `hasLiveJob(save) ? '/run/job' : null`
// and rows 2-6 fail, the hash trail printing the full cycle.
//
// Harness copied from qa/cut-run-r2.mjs. Usage: node qa/cut-run-r3.mjs
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
const { pageOpts } = await import(path.join(SITE, 'js', 'plan.js'));
const JOB = await import(path.join(SITE, 'js', 'job', 'state.js'));

/** A student mid-session — pile and streak written by the ENGINE — whose game switch then says off. */
function deadlocked() {
  const now = Date.now();
  const s = fresh(now);
  s.profileId = 'cutrunr3';
  s.settings.testDate = addDays(todayISO(), 7);
  s.placement = { done: true, at: now };
  s.xp = 1840;
  JOB.startJob(s, { ...pageOpts(s), now });
  JOB.call(s, 'not sure', { now: now + 3000 });
  JOB.answer(s, { cleared: true }, { now: now + 23000 });
  s.settings.game = false;              // …and the switch says off over a live record
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

const rows = [];
const fails = [];
const ok = (label, cond, detail) => { rows.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail == null ? '' : ` — ${detail}`}`); if (!cond) fails.push(label); };

const readSave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('u1a.save') || 'null'));
const view = (page) => page.evaluate(() => ({
  hash: location.hash,
  flat: !!document.querySelector('section.run-screen[data-kind="page"]'),
  job: !!document.querySelector('section.job-screen'),
  text: (document.querySelector('#view')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
}));

const seed = deadlocked();
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
const page = await ctx.newPage();
await page.addInitScript((json) => {
  if (!window.localStorage.getItem('u1a.save')) window.localStorage.setItem('u1a.save', json);
}, JSON.stringify(seed));

const trail = [];
page.on('framenavigated', () => {});
await page.goto(base + '#/today');
await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 });
await page.waitForTimeout(600);
trail.push(await page.evaluate(() => location.hash));

const before = await readSave(page);
ok('the save is the deadlock state: switch off, record live',
  before?.settings?.game === false && !!before?.inProgress?.game,
  `game=${before?.settings?.game} pile=${before?.inProgress?.game?.pile} idx=${before?.inProgress?.idx}`);

/* ---- the critic's own path: Home's primary button, four times ---- */
let landed = null;
for (let i = 0; i < 4; i++) {
  await page.goto(base + '#/today');
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 });
  await page.waitForTimeout(500);
  const cta = await page.evaluate(() => {
    const b = document.querySelector('.home-primary');
    return b ? { label: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 40), href: b.getAttribute('href'), kind: b.dataset.kind } : null;
  });
  await page.click('.home-primary');
  await page.waitForTimeout(900);
  landed = await view(page);
  trail.push(`${cta?.href ?? '?'} -> ${landed.hash}${landed.flat ? ' [page]' : ''}${landed.job ? ' [job]' : ''}`);
  ok(`round ${i}: the primary button does not bounce back to #/today`,
    landed.hash !== '#/today', `CTA ${JSON.stringify(cta)} landed ${landed.hash}`);
}

ok('Today\'s Page is reachable and rendered', landed?.flat === true && landed?.hash === '#/run/page',
  `hash=${landed?.hash} flat=${landed?.flat} job=${landed?.job}`);
ok('…and the game screen is not on it (the switch is off)', landed?.job === false, `job=${landed?.job}`);

/* ---- the record is DORMANT, not destroyed: it comes back with the switch ---- */
const after = await readSave(page);
ok('the record survived the visit untouched',
  !!after?.inProgress?.game
  && after.inProgress.game.pile === before.inProgress.game.pile
  && after.inProgress.game.streak === before.inProgress.game.streak,
  `pile ${before?.inProgress?.game?.pile} -> ${after?.inProgress?.game?.pile}, streak ${before?.inProgress?.game?.streak} -> ${after?.inProgress?.game?.streak}`);
ok('nothing was banked behind the student\'s back',
  (after?.game?.today ?? 0) === (before?.game?.today ?? 0) && (after?.player?.best ?? 0) === (before?.player?.best ?? 0),
  `today ${before?.game?.today} -> ${after?.game?.today}, best ${before?.player?.best} -> ${after?.player?.best}`);

await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('u1a.save'));
  s.settings.game = true;
  localStorage.setItem('u1a.save', JSON.stringify(s));
});
await page.goto(base + 'version.js');          // leave the app so the store re-reads the save
await page.goto(base + '#/run/page');
await page.waitForTimeout(1500);
const back = await view(page);
ok('with the switch back on the same session resumes', back.hash === '#/run/job' && back.job === true,
  `hash=${back.hash} job=${back.job} flat=${back.flat}`);
const resumed = await readSave(page);
ok('…at the same pile and streak',
  resumed?.inProgress?.game?.pile === before.inProgress.game.pile
  && resumed?.inProgress?.game?.streak === before.inProgress.game.streak,
  `pile=${resumed?.inProgress?.game?.pile} streak=${resumed?.inProgress?.game?.streak}`);

console.log('nav trail:\n  ' + trail.join('\n  ') + '\n');
console.log(rows.join('\n'));
console.log(fails.length ? `\nFAIL (${fails.length})` : '\nALL PASS');
await ctx.close();
await browser.close();
server.close();
process.exit(fails.length ? 1 : 0);
