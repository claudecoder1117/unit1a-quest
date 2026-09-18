import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { const f = path.join(SITE, p); await stat(f); res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(base + '#/onboard?step=3', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
// click any "start"/"begin" button if the placement has not started
const startBtn = await p.$('button:has-text("Start"), button:has-text("Begin"), button:has-text("start the placement")');
if (startBtn) { await startBtn.click(); await p.waitForTimeout(1200); }
const info = await p.evaluate(() => {
  const stem = document.querySelector('.card-stem');
  if (!stem) return { noStem: true, html: document.body.innerText.slice(0, 300) };
  const chain = []; let el = stem;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    chain.push({ sel: el.className ? '.' + String(el.className).split(' ').join('.') : el.tagName, w: Math.round(el.getBoundingClientRect().width), maxW: cs.maxWidth, display: cs.display, cols: cs.gridTemplateColumns, minW: cs.minWidth, flex: cs.flex, pos: cs.position });
    el = el.parentElement;
  }
  const rects = [...document.querySelectorAll('.run-head, .card-head, .card-side, .card-parts, .run-progress-track, .onb-head, header')].map(e => ({ sel: e.className, r: e.getBoundingClientRect().toJSON() }));
  return { stemWidth: Math.round(stem.getBoundingClientRect().width), stemText: stem.innerText.slice(0, 40), chain, rects };
});
console.log(JSON.stringify(info, null, 1).slice(0, 4000));
await p.screenshot({ path: 'qa/screenshots/diag-place-1900.png' });
await b.close(); server.close();
