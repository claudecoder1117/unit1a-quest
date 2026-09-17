// qa/shot.mjs — self-contained screenshot tool for the static site.
// Usage: node qa/shot.mjs "#/today" out.png [--w 375] [--h 812] [--dark] [--state path.json] [--full] [--wait 800] [--click "css"] [--type "css=text"]
//        node qa/shot.mjs "/qa/figures.html" out.png --root [--eval "window.__figReport"]
// Serves ../site on a random local port (--root serves the REPO ROOT instead, for dev pages under qa/
// that import ../site/… — those pages are never part of the deployed artifact), opens the route,
// screenshots, exits. Prints console errors and, with --eval, the JSON value of an expression.
// A first argument starting with '#' is a hash route on index.html; one starting with '/' is a path.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const route = args[0] || '#/today';
const out = args[1] || 'shot.png';
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const SITE = path.resolve(__dirname, '..', flag('root') ? '.' : 'site');
const W = +opt('w', 375), H = +opt('h', 812);
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
const port = server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: flag('dark') ? 'dark' : 'light', reducedMotion: flag('motion') ? 'no-preference' : 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', r => errors.push('[requestfailed] ' + r.url()));
const statePath = opt('state', null);
if (!flag('root') || statePath) {
  // Warm-up load on the site root so localStorage is writable for this origin before the real route.
  await page.goto(`http://127.0.0.1:${port}/${flag('root') ? 'site/' : ''}version.js`, { waitUntil: 'load' });   // T10: warm up on a non-app URL so the app cannot boot and write a fresh save over --state before the real load
  if (statePath) {
    const json = await readFile(statePath, 'utf8');
    await page.evaluate(j => localStorage.setItem('u1a.save', j), json);
  }
}
const target = route.startsWith('/') ? route.slice(1) : (route.startsWith('#') ? route : '#' + route);
await page.goto(`http://127.0.0.1:${port}/${target}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(+opt('wait', 600));
const click = opt('click', null); if (click) { await page.click(click); await page.waitForTimeout(400); }
const type = opt('type', null); if (type) { const [sel, text] = type.split('='); await page.fill(sel, text); await page.waitForTimeout(200); }
const clicks = args.filter((a, i) => args[i - 1] === '--click2'); for (const c of clicks) { await page.click(c); await page.waitForTimeout(400); }
await page.screenshot({ path: out, fullPage: flag('full') });
const hs = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, title: document.title, text: document.body.innerText.slice(0, 400) }));
const expr = opt('eval', null);
let evaluated;
if (expr) { try { evaluated = await page.evaluate(`(() => (${expr}))()`); } catch (e) { evaluated = { evalError: String(e?.message || e) }; } }
console.log(JSON.stringify({ out, route, viewport: [W, H], horizontalOverflow: hs.scrollW > hs.innerW, title: hs.title, errors, ...(expr ? { eval: evaluated } : {}), textPreview: hs.text }, null, 1));
await browser.close();
server.close();
