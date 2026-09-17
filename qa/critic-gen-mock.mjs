// qa/critic-gen-mock.mjs — critic: start the Mock and shoot the first T-notation item with a figure (dev only).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const [out, statePath] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(REPO, 'site', p);
  try { if (!(await stat(f)).isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block' });
const page = await ctx.newPage(); const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(base + 'version.js'); await page.evaluate((j) => localStorage.setItem('u1a.save', j), await readFile(statePath, 'utf8'));
await page.goto(base + '#/mock', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
await page.$eval('.mock-start', (e) => e.click()); await page.waitForTimeout(1200);
let found = null;
for (let i = 0; i < 6; i++) {
  const info = await page.evaluate(() => ({ mid: document.querySelector('.mock-nav-mid')?.textContent, stem: document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 260), svg: !!document.querySelector('main svg.fig, main .fig svg, main svg[aria-label^="Figure"]'), aria: document.querySelector('main svg[aria-label]')?.getAttribute('aria-label') }));
  console.log(i, JSON.stringify(info));
  if (/labelled in the figure/.test(info.stem || '')) { found = i; break; }
  const nx = await page.$('.mock-nav-btn.is-next'); if (!nx) break; await nx.click(); await page.waitForTimeout(500);
}
console.log('found', found, 'overflow', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
await page.screenshot({ path: out });
console.log('errors', errors); await browser.close(); server.close();
