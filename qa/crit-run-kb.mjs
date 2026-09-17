import { createServer } from 'node:http'; import { readFile, stat } from 'node:fs/promises'; import { createRequire } from 'node:module'; import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { chromium } = createRequire(path.join(REPO, 'qa', 'shot.mjs'))('playwright');
const SITE = path.join(REPO, 'site');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, p); try { if (!(await stat(f)).isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}/`;
const [route, idx, out, dark] = process.argv.slice(2);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block' });
const page = await ctx.newPage(); const errs = []; page.on('console', m => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', e => errs.push(e.message));
await page.goto(base + 'version.js'); const st = JSON.parse(await readFile(path.join(REPO, 'qa/screenshots/s9/after-ace.json'), 'utf8'));
await page.evaluate(j => localStorage.setItem('u1a.save', j), JSON.stringify(st));
await page.goto(base + route); await page.waitForSelector('.card-parts .w', { timeout: 20000 }); await page.waitForTimeout(800);
if (idx !== '-') { await page.evaluate(k => { const s = JSON.parse(localStorage.getItem('u1a.save')); s.inProgress.idx = +k; localStorage.setItem('u1a.save', JSON.stringify(s)); }, idx); await page.goto(base + 'version.js'); await page.goto(base + route); await page.waitForSelector('.card-parts .w', { timeout: 20000 }); await page.waitForTimeout(900); }
const inp = await page.$('.card-parts input:not([disabled])'); await inp.tap?.().catch(()=>{}); await inp.focus();
await page.setViewportSize({ width: 375, height: 380 }); await page.waitForTimeout(600);
console.log(JSON.stringify(await page.evaluate(() => { const v = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), r.top >= 0 && r.bottom <= innerHeight]; }; return { stem: document.querySelector('.card-stem')?.innerText.slice(0,40), active: document.activeElement.className, input: v(document.activeElement), keys: v([...document.querySelectorAll('#dock .w-keys, #dock [class*=keys]')].find(e => !e.hidden && e.getClientRects().length)), submit: v(document.querySelector('.card-submit:not([hidden])')), scrollY }; })), errs);
await page.screenshot({ path: out }); await b.close(); server.close();
