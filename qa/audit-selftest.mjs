// qa/audit-selftest.mjs — proves qa/audit-states.mjs end to end: every prepare() is run at 1900×1200 and
// 375×667 and the state's own root selector must be on screen afterwards. Dev-only, not the auditor.
//
//   node qa/audit-selftest.mjs                     # chromium, both viewports, every state
//   node qa/audit-selftest.mjs --browser webkit    # the other engine
//   node qa/audit-selftest.mjs --only card         # only states whose id or tags contain "card"
//   node qa/audit-selftest.mjs --w 1900 --h 1200   # one viewport
//   node qa/audit-selftest.mjs --shots out/dir     # also write a PNG per state
//
// It prints one line per state per viewport: OK / MISS (root never appeared), plus the width of .card-stem
// when a card is on screen (0 px is the placement bug) and whether the document scrolls sideways.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { states } from './audit-states.mjs';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'shot.mjs'));
const pw = require('playwright');
const QA = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(QA, '..', 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

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

const h = {
  base,
  gotoRoute: (page, hash) => page.goto(base + hash, { waitUntil: 'networkidle' }),
  setSave: (page, json) => page.evaluate(j => localStorage.setItem('u1a.save', j), json),
  waitReady: (page) => page.waitForTimeout(450),
  readFixture: async (name) => readFile(path.join(QA, 'fixtures', name), 'utf8'),
};

const only = opt('only', null);
const all = states(h);
const list = only ? all.filter(s => s.id.includes(only) || s.tags.some(t => t.includes(only))) : all;
const shotDir = opt('shots', null);
if (shotDir) await mkdir(shotDir, { recursive: true });

const browserName = opt('browser', 'chromium');
const browser = await pw[browserName].launch();
const viewports = opt('w', null)
  ? [[+opt('w', 1900), +opt('h', 1200)]]
  : [[1900, 1200], [375, 667]];

let fails = 0, ran = 0;
console.log(`# ${browserName} · ${list.length} states · ${viewports.map(v => v.join('×')).join(' + ')}`);
for (const [w, hgt] of viewports) {
  // serviceWorkers: 'block' is NOT optional — see killServiceWorkers() in audit-states.mjs: a WebKit
  // navigation served by the app's own service worker never finishes and page.goto hangs for ever.
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  for (const st of list) {
    errors.length = 0;
    const t0 = Date.now();
    let thrown = null;
    try { await st.prepare(page); } catch (e) { thrown = String(e?.message || e).split('\n')[0].slice(0, 120); }
    const probe = await page.evaluate((root) => {
      const vis = (el) => !!el && !!el.getClientRects().length;
      const el = root ? document.querySelector(root) : null;
      const stem = document.querySelector('.card-stem');
      const paper = document.querySelector('.card-paper');
      return {
        root: vis(el),
        hash: location.hash,
        stemW: stem ? Math.round(stem.getBoundingClientRect().width) : null,
        paperCols: paper ? getComputedStyle(paper).gridTemplateColumns : null,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        text: (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      };
    }, st.root || null).catch((e) => ({ root: false, err: String(e.message).slice(0, 80) }));
    ran++;
    const ok = probe.root && !thrown;
    if (!ok) fails++;
    const bits = [
      `${ok ? 'OK  ' : 'MISS'} ${String(w).padStart(4)}px ${st.id.padEnd(26)}`,
      probe.hash ? probe.hash.padEnd(30) : ''.padEnd(30),
      probe.stemW != null ? `stem ${String(probe.stemW).padStart(4)}px` : '            ',
      probe.overflow ? 'H-OVERFLOW' : '          ',
      `${Date.now() - t0}ms`,
      thrown ? `THREW ${thrown}` : '',
      !probe.root ? `no ${st.root}` : '',
      probe.stemW === 0 ? `COLLAPSED STEM cols=${probe.paperCols}` : '',
      errors.length ? `errs ${errors.slice(0, 2).join(' | ').slice(0, 120)}` : '',
    ];
    console.log(bits.filter(Boolean).join(' '));
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${w}-${st.id}.png`) }).catch(() => {});
  }
  await ctx.close();
}
console.log(`# ${ran - fails}/${ran} reached their screen (${fails} miss${fails === 1 ? '' : 'es'})`);
await browser.close();
server.close();
process.exitCode = fails ? 1 : 0;
