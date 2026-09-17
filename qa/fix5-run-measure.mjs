// qa/fix5-run-measure.mjs — fix5 lane "run" (dev only, not part of the artifact).
// Bug 3 check: on a fresh Today's Page (from qa/screenshots/s9/after-ace.json) measure, for items 1–6 and for
// #/card/ang-10, #/card/wp-01, #/card/not-04, the first answer control's rect vs the sticky dock's top, the
// sticky app bar's bottom and the stem's first line — at the viewport given (default 375×667, light).
// Items are reached by setting save.inProgress.idx and reloading (no answers forced).
// Usage: node qa/fix5-run-measure.mjs [--w 375] [--h 667] [--dark] [--out dir] [--tag before] [--items 6] [--noshots]
//        node qa/fix5-run-measure.mjs --kb     (375×380 keyboard-open case on the first numeric item: wp-01)
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const SITE = path.join(REPO, 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const W = +opt('w', 375), H = +opt('h', 667), DARK = flag('dark');
const OUT = path.resolve(REPO, opt('out', 'qa/screenshots/fix5-run'));
const TAG = opt('tag', 'after');
const ITEMS = +opt('items', 6);
await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try { const st = await stat(file); if (!st.isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const state0 = await readFile(path.join(REPO, 'qa/fixtures/fix5-run-after-ace.json'), 'utf8');

const MEASURE = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 && !e.closest('[hidden]'); };
  const parts = document.querySelector('.card-parts');
  const SEL = 'input:not([disabled]):not([type=hidden]), textarea, select, button:not([disabled]), [role=button]:not(output), [tabindex="0"]:not(output)';
  const ctl = parts ? [...parts.querySelectorAll(SEL)].find(vis) : null;
  const reqPart = parts ? [...parts.querySelectorAll('.card-part:not([data-optional="true"])')].find(vis) : null;
  const req = reqPart ? [...reqPart.querySelectorAll(SEL)].find(vis) : null;
  const stem = document.querySelector('.card-stem');
  const lh = stem ? parseFloat(getComputedStyle(stem).lineHeight) || 24 : 0;
  const hdr = document.querySelector('.hdr');
  const dock = document.querySelector('#dock');
  const c = r(ctl), q = r(req), d = r(dock), hd = r(hdr), s = r(stem);
  return {
    scrollY: Math.round(scrollY), hdrBottom: hd?.bottom, dockTop: d?.top,
    runHead: r(document.querySelector('.run-head')), cardHead: r(document.querySelector('.card-head')),
    stemTop: s?.top, stemLine1Bottom: s ? Math.round(s.top + lh) : null,
    control: c, controlDesc: ctl ? (ctl.tagName.toLowerCase() + '.' + String(ctl.className?.baseVal ?? ctl.className).split(' ')[0] + ' "' + (ctl.getAttribute('aria-label') || ctl.textContent || '').trim().slice(0, 24) + '"') : null,
    controlVisible: !!(c && d && hd && c.top >= hd.bottom && c.top < d.top),
    required: q, requiredVisible: !!(q && d && hd && q.top >= hd.bottom && q.top < d.top),
    stemVisible: !!(s && hd && d && s.top >= hd.bottom && s.top + lh <= d.top),
    overflow: document.documentElement.scrollWidth > innerWidth,
    stemText: stem?.innerText.replace(/\\s+/g, ' ').slice(0, 60),
  };
})()`;

async function newPage(w = W, h = H) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: DARK ? 'dark' : 'light', reducedMotion: opt('motion', 'reduce'), serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.text().startsWith('REVEAL')) console.log(m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.goto(base + 'version.js');
  return { ctx, page, errors };
}
const ready = (page) => page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w', { timeout: 20000 }).then(() => page.waitForTimeout(500));
const results = [];
const vp = `${W}x${H}${DARK ? '-dark' : ''}`;

if (flag('kb')) {
  const { ctx, page, errors } = await newPage(375, 667);
  await page.evaluate(j => localStorage.setItem('u1a.save', j), state0);
  const kbItem = opt('kbitem', null);   // --kbitem 11 → Today's Page item 11 (the systems Variant, two number boxes)
  if (kbItem) {
    await page.goto(base + '#/run/page', { waitUntil: 'networkidle' }); await ready(page);
    await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem('u1a.save')); s.inProgress.idx = k; localStorage.setItem('u1a.save', JSON.stringify(s)); }, +kbItem - 1);
    await page.goto(base + 'version.js'); await page.goto(base + '#/run/page', { waitUntil: 'networkidle' }); await ready(page);
  } else { await page.goto(base + '#/card/wp-01', { waitUntil: 'networkidle' }); await ready(page); }
  const inp = await page.$('.card-parts .card-part:not([data-optional="true"]) input:not([disabled])') || await page.$('.card-parts input:not([disabled])');
  await inp.focus();
  await page.setViewportSize({ width: 375, height: 380 }); await page.waitForTimeout(500);
  const kb = await page.evaluate(() => { const v = (e) => { if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), inView: b.top >= 0 && b.bottom <= innerHeight }; }; return { input: v(document.activeElement), keys: v(document.querySelector('#dock .w-keys:not([hidden])')), submit: v(document.querySelector('.card-submit')), kb: document.documentElement.dataset.kb }; });
  if (!(kb.input?.inView && kb.submit?.inView && (kb.keys === null || kb.keys.inView))) process.exitCode = 1;   // r2: S9 #9 as an exit code
  console.log(`keyboard-open 375×380 ${kbItem ? 'page item ' + kbItem : 'wp-01'}`, JSON.stringify(kb), errors.length ? errors : '');
  await page.screenshot({ path: path.join(OUT, `${TAG}-kb-${kbItem ? 'page-item' + kbItem : 'wp01'}-375x380.png`) });
  await ctx.close();
} else {
  // Today's Page items 1..N
  const { ctx, page, errors } = await newPage();
  await page.evaluate(j => localStorage.setItem('u1a.save', j), state0);
  if (flag('nav')) {   // arrive the way a student does: Home, then the hash change (the view-enter slide runs)
    await page.goto(base + '#/today', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    await page.evaluate(() => { location.hash = '#/run/page'; }); await ready(page);
  } else { await page.goto(base + '#/run/page', { waitUntil: 'networkidle' }); await ready(page); }
  for (let k = 0; k < ITEMS; k++) {
    if (k > 0) {
      await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem('u1a.save')); s.inProgress.idx = k; localStorage.setItem('u1a.save', JSON.stringify(s)); }, k);
      await page.goto(base + 'version.js'); await page.goto(base + '#/run/page', { waitUntil: 'networkidle' }); await ready(page);
    }
    const m = await page.evaluate(MEASURE);
    results.push({ where: `page item ${k + 1}`, ...m });
    if (!flag('noshots')) await page.screenshot({ path: path.join(OUT, `${TAG}-page-item${k + 1}-${vp}.png`) });
  }
  if (errors.length) console.log('page errors', errors);
  await ctx.close();
  for (const id of ['ang-10', 'wp-01', 'not-04']) {
    const { ctx, page, errors } = await newPage();
    await page.evaluate(j => localStorage.setItem('u1a.save', j), state0);
    await page.goto(base + '#/card/' + id, { waitUntil: 'networkidle' }); await ready(page);
    results.push({ where: '#/card/' + id, ...(await page.evaluate(MEASURE)) });
    if (!flag('noshots')) await page.screenshot({ path: path.join(OUT, `${TAG}-card-${id}-${vp}.png`) });
    if (errors.length) console.log(id, 'errors', errors);
    await ctx.close();
  }
  console.log(`viewport ${vp}`);
  // r2: exit code 1 when any measured screen fails (control top above the dock AND the stem's first line visible)
  if (results.some((x) => !(x.controlVisible && x.stemVisible) || x.overflow)) process.exitCode = 1;
  for (const x of results) console.log(`${x.controlVisible && x.stemVisible ? 'PASS' : 'FAIL'} ${x.where.padEnd(16)} hdr↓${x.hdrBottom} runHead ${x.runHead ? x.runHead.top + '–' + x.runHead.bottom : '—'} cardHead ${x.cardHead?.top}–${x.cardHead?.bottom} stem ${x.stemTop}–${x.stemLine1Bottom} control ${x.control?.top}–${x.control?.bottom} ${x.controlDesc} required ${x.required?.top}–${x.required?.bottom}${x.requiredVisible ? '' : ' (below)'} dock↑${x.dockTop} scrollY ${x.scrollY}${x.overflow ? ' OVERFLOW' : ''} | ${x.stemText}`);
}
await browser.close();
server.close();
