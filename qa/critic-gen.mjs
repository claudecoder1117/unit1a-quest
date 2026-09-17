// qa/critic-gen.mjs — fix5 gen critic driver (dev only). One screenshot per run.
// node qa/critic-gen.mjs place <out.png> [--dark]
// node qa/critic-gen.mjs variant <template> <seed> <out.png> [--dark]
// node qa/critic-gen.mjs grade <seed> <right|wrong|swap> <out.png>   (T-notation variant, real taps)
// node qa/critic-gen.mjs route <#/route> <out.png> [--dark] [--state f]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const args = process.argv.slice(2); const dark = args.includes('--dark');
const si = args.indexOf('--state'); const statePath = si >= 0 ? args[si + 1] : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(REPO, 'site', p);
  try { if (!(await stat(f)).isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 375), height: +(process.env.H || 667) }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
const page = await ctx.newPage(); const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ' ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(base + 'version.js');
if (statePath) await page.evaluate((j) => localStorage.setItem('u1a.save', j), await readFile(statePath, 'utf8'));
const log = (...a) => console.log(...a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)));
const PROBE = () => {
  const svg = document.querySelector('.card-figure svg');
  const stem = document.querySelector('.card-stem')?.innerText.replace(/\s+/g, ' ').trim();
  const out = { stem, overflow: document.documentElement.scrollWidth > innerWidth };
  if (!svg) return { ...out, figure: false };
  const box = svg.getBoundingClientRect();
  const labels = [...svg.querySelectorAll('text')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect(), fs: parseFloat(getComputedStyle(t).fontSize) }));
  const scale = box.width / 400;
  const clipped = labels.filter(({ r }) => r.left < box.left - .5 || r.right > box.right + .5 || r.top < box.top - .5 || r.bottom > box.bottom + .5).map((l) => l.t);
  const over = []; for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const a = labels[i].r, b = labels[j].r; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) over.push(labels[i].t + '/' + labels[j].t); }
  const fb = document.querySelector('.card-figure').getBoundingClientRect();
  return { ...out, figure: true, svgW: Math.round(box.width), svgH: Math.round(box.height), figTop: Math.round(fb.top), figBottom: Math.round(fb.bottom), letters: labels.map((l) => l.t).join(''), letterPx: labels.map((l) => +(l.r.height).toFixed(1)).slice(0, 3), clipped, over, aria: svg.getAttribute('aria-label'), rays: svg.querySelectorAll('.fig-ray').length, lines: svg.querySelectorAll('.fig-line').length, planes: svg.querySelectorAll('.fig-plane').length };
};
const ready = () => page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w', { timeout: 20000 });
const click = (sel) => page.$eval(sel, (e) => e.click());
try {
  const mode = args[0];
  if (mode === 'place') {
    await page.goto(base + '#/onboard', { waitUntil: 'networkidle' });
    await page.waitForSelector('.ob-next'); await click('.ob-next');
    await page.waitForSelector('text=Next: where are you now?'); await page.click('text=Next: where are you now?');
    await page.waitForSelector('text=Start ·'); await page.click('text=Start ·');
    await ready(); await page.waitForTimeout(600);
    log('probe', await page.evaluate(PROBE));
    await page.screenshot({ path: args[1] });
  } else if (mode === 'variant') {
    await page.goto(base + `#/variant/${args[1]}?seed=${encodeURIComponent(args[2])}`, { waitUntil: 'networkidle' });
    await ready(); await page.waitForTimeout(500);
    log('probe', await page.evaluate(PROBE));
    await page.screenshot({ path: args[3] });
  } else if (mode === 'grade') {
    const [, seed, how, out] = args;
    await page.goto(base + `#/variant/T-notation?seed=${encodeURIComponent(seed)}`, { waitUntil: 'networkidle' });
    await ready(); await page.waitForTimeout(400);
    const it = await page.evaluate(async (s) => { const T = await import('/data/templates.js'); const x = T.generate('T-notation', s); return { stem: x.stem, kind: x.params.kind, answer: x.params.answer, part: x.parts[0] }; }, seed);
    const pr = await page.evaluate(PROBE); log('item', it.stem, it.answer, 'domStemMatch', pr.stem?.includes(it.stem.slice(0, 50)), 'probe', pr);
    const a = it.answer; let pts = a.pts.slice();
    if (how === 'wrong') pts.reverse();
    if (how === 'swap') pts = [pts[1], pts[0], pts[2]];   // angle: vertex not in middle
    await click(`.w-nt-deco-btn[data-kind="${a.kind}"]`);
    for (const L of pts) await click(`.w-nt-letter[data-l="${L}"]`);
    await page.waitForTimeout(150);
    log('preview', await page.$eval('.w-nt-preview', (e) => e.getAttribute('aria-label') || e.textContent));
    await click('.card-submit:not([hidden])'); await page.waitForTimeout(900);
    log('result', await page.evaluate(() => ({ state: document.querySelector('.w-nt')?.dataset.state, result: document.querySelector('.card-result')?.innerText.replace(/\s+/g, ' ').slice(0, 200), wmsg: document.querySelector('.w-nt')?.innerText.replace(/\s+/g, ' ').slice(-220) })));
    await page.screenshot({ path: out });
  } else if (mode === 'route') {
    await page.goto(base + args[1], { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
    log('overflow', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'text', await page.evaluate(() => document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    await page.screenshot({ path: args[2] });
  }
} catch (e) { log('ERR', e.message); }
log('errors', errors);
await browser.close(); server.close();
