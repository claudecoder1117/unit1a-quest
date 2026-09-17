// critic lane run r2: card routes + keyboard-open geometry. dev only.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const SITE = path.join(REPO, 'site'); const OUT = path.join(REPO, 'qa/screenshots/crit-run-r2'); await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, p); try { const s = await stat(f); if (!s.isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const state = await readFile(path.join(REPO, 'qa/screenshots/s9/after-ace.json'), 'utf8');
const MEAS = `(() => { const SEL='input:not([disabled]):not([type=hidden]), textarea, select, button:not([disabled]), [role="button"]:not(output), [tabindex="0"]:not(output)';
 const ctl=[...document.querySelector('.card-parts').querySelectorAll(SEL)].find(e=>e.getClientRects().length&&!e.closest('[hidden]'));
 const R=e=>e?[Math.round(e.getBoundingClientRect().top),Math.round(e.getBoundingClientRect().bottom)]:null;
 const stem=document.querySelector('.card-stem'); const rp=[...document.querySelectorAll('.card-parts .card-part:not([data-optional="true"])')].find(e=>e.getClientRects().length); const req=rp&&[...rp.querySelectorAll(SEL)].find(e=>e.getClientRects().length&&!e.closest('[hidden]')); return {scrollY, req:R(req), ctl:R(ctl), desc: ctl&&ctl.className, dock:R(document.querySelector('#dock')), hdr:R(document.querySelector('.hdr')), stem:R(stem), overflow: document.documentElement.scrollWidth>innerWidth}; })()`;
const mode = process.argv[2];
async function open(w, h, dark, route) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block', hasTouch: !process.env.NOTOUCH, reducedMotion: process.env.RM || 'no-preference' });
  const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + 'version.js'); await page.evaluate(j => localStorage.setItem('u1a.save', j), state);
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w', { timeout: 20000 }); await page.waitForTimeout(+(process.env.WAIT||1300));
  return { ctx, page, errs };
}
if (mode === 'cards') {
  for (const dark of [false, true]) for (const id of (process.env.IDS||'ang-10 wp-01 not-04 ang-05 wp-03 not-01').split(' ')) {
    const { ctx, page, errs } = await open(375, 667, dark, '#/card/' + id);
    const m = await page.evaluate(MEAS); const ok = m.ctl && m.ctl[0] < m.dock[0] && m.ctl[0] >= m.hdr[1] && m.stem[0] >= m.hdr[1] - 1;
    console.log(ok ? 'ok  ' : 'FAIL', id, dark ? 'dark' : 'light', JSON.stringify(m), errs.join('|'));
    if (['ang-10','wp-01','not-04'].includes(id)) await page.screenshot({ path: path.join(OUT, `card-${id}${dark ? '-dark' : ''}.png`) });
    await ctx.close();
  }
} else if (mode === 'kb') {
  for (const id of ['wp-01', process.argv[3] || 'wp-02']) {
    const { ctx, page } = await open(375, 667, false, '#/card/' + id);
    const inp = await page.$('.card-parts .card-part:not([data-optional="true"]) input:not([disabled])') || await page.$('.card-parts input:not([disabled])'); if (!inp) { console.log('no input', id); continue; }
    await inp.focus(); await page.setViewportSize({ width: 375, height: 380 }); await page.waitForTimeout(700);
    const g = await page.evaluate(() => { const v = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), r.top >= 0 && r.bottom <= innerHeight]; }; return { input: v('.card-parts input:focus'), dock: v('#dock'), keys: v('#dock .w-keys:not([hidden])'), submit: v('.card-submit'), kb: document.documentElement.dataset.kb, dockText: document.querySelector('#dock')?.innerText.replace(/\s+/g,' ').slice(0,80) }; });
    console.log('kb', id, JSON.stringify(g));
    await page.screenshot({ path: path.join(OUT, `kb-${id}.png`) }); await ctx.close();
  }
}
await browser.close(); server.close();
