// qa/fix5-run-heads.mjs — fix5 lane "run" r2 (dev only). Geometry check of the run head on a phone: every run
// kind except the Page shows its subtitle (the run's rule — "hints off, first try only", "these pay full XP") as
// a visible, untruncated line; the Page hides its "11 new + 2 variants"; the title is never ellipsised; the
// Quit button is ≥ 44 px; no horizontal overflow; no console errors. Exit code 1 on any failure.
// Usage: node qa/fix5-run-heads.mjs [--w 375] [--h 667] [--dark] [--out dir]
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
const W = +opt('w', 375), H = +opt('h', 667), DARK = args.includes('--dark');
const OUT = opt('out', null) && path.resolve(REPO, opt('out'));
if (OUT) await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try { const st = await stat(file); if (!st.isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ace = await readFile(path.join(REPO, 'qa/fixtures/fix5-run-after-ace.json'), 'utf8');
const upgrade = await readFile(path.join(REPO, 'qa/fixtures/fix5-run-upgrade.json'), 'utf8');
const CASES = [
  { route: '#/run/page', state: ace, sub: false },
  { route: '#/run/upgrade', state: upgrade, sub: /hints off, first try only/ },
  { route: '#/run/drill/VOC', state: ace, sub: /pay full XP/ },
  { route: '#/run/daily', state: ace, sub: /\+\d+ XP for finishing/ },
  { route: '#/run/blitz/M1', state: ace, sub: /wrong = −3 s/ },
];
const bad = [];
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: DARK ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'version.js');
  await page.evaluate(j => localStorage.setItem('u1a.save', j), c.state);
  await page.goto(base + c.route, { waitUntil: 'networkidle' });
  await page.waitForSelector('.run-head', { timeout: 20000 }); await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const box = (e) => { if (!e) return null; const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return { shown: cs.display !== 'none' && b.width > 0 && b.height > 0, top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height), clipped: e.scrollWidth > e.clientWidth + 1, text: e.innerText.trim() }; };
    const head = document.querySelector('.run-head');
    return { kind: head?.dataset.kind, head: box(head), title: box(document.querySelector('.run-title')), sub: box(document.querySelector('.run-sub')), quit: box(document.querySelector('.run-quit')), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  const f = [];
  if (c.sub) {
    if (!m.sub?.shown) f.push('subtitle hidden');
    else { if (!c.sub.test(m.sub.text)) f.push(`subtitle text "${m.sub.text}"`); if (m.sub.clipped) f.push('subtitle truncated'); if (m.sub.top < 0 || m.sub.bottom > H || m.sub.right > W) f.push('subtitle off screen'); }
  } else if (W < 640 && m.sub?.shown) f.push('Page subtitle shown on a phone');   // ≥ 640 it shows inline (r1)
  if (m.title?.clipped) f.push(`title truncated "${m.title.text}"`);
  if (!m.quit || m.quit.w < 44 || m.quit.h < 44) f.push(`quit ${m.quit?.w}×${m.quit?.h}`);
  if (m.overflow) f.push('horizontal overflow');
  if (errors.length) f.push('console errors ' + errors.join(' | '));
  console.log(`${f.length ? 'FAIL' : 'PASS'} ${W}x${H}${DARK ? ' dark' : ''} ${c.route.padEnd(16)} kind=${m.kind} head ${m.head.top}–${m.head.bottom} title "${m.title.text}" sub ${m.sub?.shown ? `${m.sub.top}–${m.sub.bottom} "${m.sub.text}"` : 'hidden'} quit ${m.quit.w}×${m.quit.h}${f.length ? ' · ' + f.join(' · ') : ''}`);
  if (f.length) bad.push(c.route);
  if (OUT) await page.screenshot({ path: path.join(OUT, `heads-${c.route.replace(/[#/]+/g, '-').replace(/^-/, '')}-${W}x${H}${DARK ? '-dark' : ''}.png`) });
  await ctx.close();
}
await browser.close(); server.close();
process.exitCode = bad.length ? 1 : 0;
