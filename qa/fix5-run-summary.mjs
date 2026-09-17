// qa/fix5-run-summary.mjs — fix5 lane "run" (dev only). Reaches the Today's Page Summary from
// qa/screenshots/s9/after-ace.json WITHOUT playing: composes the page, marks every item cleared (Gold), bumps
// the four family tiles to different ladder steps (1, 2, 4 Gold Variants; 6 across 2 days), reloads → Summary.
// Shoots the mint section at the viewport given and prints every tile caption + its line boxes.
// Usage: node qa/fix5-run-summary.mjs [--set A|B] [--w 375] [--h 667] [--dark] [--motion reduce|no-preference] [--tag after] [--out dir]
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
const W = +opt('w', 375), H = +opt('h', 667), DARK = flag('dark'), MOTION = opt('motion', 'reduce'), SET = opt('set', 'A');
const OUT = path.resolve(REPO, opt('out', 'qa/screenshots/fix5-run/after')); const TAG = opt('tag', 'after');
await mkdir(OUT, { recursive: true });
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
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: DARK ? 'dark' : 'light', reducedMotion: MOTION, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
await page.goto(base + 'version.js');
await page.evaluate(j => localStorage.setItem('u1a.save', j), await readFile(path.join(REPO, 'qa/fixtures/fix5-run-after-ace.json'), 'utf8'));
await page.goto(base + '#/run/page', { waitUntil: 'networkidle' });
await page.waitForSelector('.card-screen .card-parts .w', { timeout: 20000 }); await page.waitForTimeout(400);
await page.evaluate((SET) => {
  const s = JSON.parse(localStorage.getItem('u1a.save'));
  const ip = s.inProgress; const today = new Date().toISOString().slice(0, 10);
  for (const it of ip.queue) {
    it.done = true; it.result = { id: it.id, cleared: true, firstTry: true, hints: 0, xp: 40, rarity: 'gold', ms: 1000, skill: (it.skills || [])[0] ?? null };
    if (it.kind !== 'variant' && it.id) { s.cards[it.id] = { ...(s.cards[it.id] || {}), rarity: 'gold' }; }
  }
  // r2: the Page only carries two families' Variants — clone a Variant item for the other two so all four tiles mint
  const v = ip.queue.find((it) => it.template);
  if (v) for (const [template, params] of [['T-quad-solve', { mode: 'a1' }], ['T-quad-solve', { mode: 'a2' }], ['T-quad-ctx', {}], ['T-sys', {}]]) ip.queue.push({ ...JSON.parse(JSON.stringify(v)), template, params, meta: { ...(v.meta || {}), params } });
  ip.idx = ip.queue.length;
  s.variants = s.variants || {};
  // r2: --set A = 1, 2, 3, 4 Gold Variants; --set B = 5, 6 on one day, 6 on two days (Platinum), 9 on two days
  const SETS = { A: [[1, 1], [2, 1], [3, 1], [4, 1]], B: [[5, 1], [6, 1], [6, 2], [9, 2]] };
  const fams = ['fam-quad-a2', 'fam-sys', 'fam-quad-a1', 'fam-quad-ctx'];
  const days = (k) => ['2026-09-15', today].slice(2 - k);
  fams.forEach((f, i) => { const [n, k] = SETS[SET][i]; s.variants[f] = { clearsGold: n, goldDays: days(k) }; });
  // make sure every family tile is in the page's tile set (tileIdsOf reads Variant items' families) — before = none, so all four mint
  for (const f of fams) ip.meta.before.tiles[f] = null;
  localStorage.setItem('u1a.save', JSON.stringify(s));
}, SET);
await page.goto(base + 'version.js'); await page.goto(base + '#/run/page', { waitUntil: 'networkidle' });
await page.waitForSelector('.run-summary', { timeout: 20000 }); await page.waitForTimeout(MOTION === 'reduce' ? 400 : 2600);
const info = await page.evaluate(() => [...document.querySelectorAll('.sum-tiles > li')].map(li => {
  const cap = li.querySelector('.sum-tile-cap');
  const boxes = [...cap.children].map(c => { const r = document.createRange(); r.selectNodeContents(c); const lineTops = new Set([...r.getClientRects()].map(x => Math.round(x.top))); const cr = cap.getBoundingClientRect(), er = r.getBoundingClientRect(); return { text: c.innerText.replace(/\n/g, '⏎'), lines: lineTops.size, inside: er.left >= cr.left - 0.5 && er.right <= cr.right + 0.5, w: Math.round(er.width) }; });
  const lines = boxes.map(b => `${b.text} [${b.lines} line${b.lines === 1 ? '' : 's'}, ${b.w}px${b.inside ? '' : ' OUTSIDE'}]`);
  const tile = getComputedStyle(li.querySelector('.sum-tile'));
  return { boxes, fam: li.dataset.fam, w: Math.round(li.getBoundingClientRect().width), lines, aria: li.querySelector('.sum-tile').getAttribute('aria-label').slice(0, 90), tileOpacity: tile.opacity, tileTransform: tile.transform, sheenOpacity: getComputedStyle(li.querySelector('.tile-sheen')).opacity };
}));
const legend = await page.evaluate(() => document.querySelector('.sum-fam-legend')?.innerText);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
console.log(`summary ${W}x${H} ${DARK ? 'dark' : 'light'} motion=${MOTION} overflow=${overflow}`);
for (const t of info.filter(t => t.fam === 'true')) console.log(' FAM', t.w + 'px', t.lines.join(' | '), '| opacity', t.tileOpacity, 'transform', t.tileTransform, 'sheen', t.sheenOpacity);
console.log(' originals', info.filter(t => t.fam !== 'true').length, 'e.g.', info.filter(t => t.fam !== 'true').slice(0, 2).map(t => t.lines.join(' | ')));
console.log(' legend:', legend);
if (errors.length) console.log(' errors', errors);
// r2: a geometry assertion, not a source pin — every family caption line is ONE line box inside its 130 px caption,
// no caption line of any tile starts with punctuation, final tiles shown under reduced motion
const bad = [];
for (const t of info) for (const b of t.boxes) {
  if (t.fam === 'true' && (b.lines !== 1 || !b.inside)) bad.push(`family caption "${b.text}" ${b.lines} lines${b.inside ? '' : ', overflows'}`);
  if (/(^|⏎)\s*[,.;:)]/.test(b.text)) bad.push(`caption line starts with punctuation: "${b.text}"`);
}
if (MOTION === 'reduce') for (const t of info) if (t.tileOpacity !== '1') bad.push(`tile opacity ${t.tileOpacity} under reduced motion`);
if (info.filter(t => t.fam === 'true').length !== 4) bad.push(`expected 4 family tiles, got ${info.filter(t => t.fam === 'true').length}`);
if (overflow) bad.push('horizontal overflow');
if (errors.length) bad.push('console errors');
console.log(bad.length ? ' FAIL ' + bad.join(' · ') : ' PASS family captions one line each, no leading punctuation');
process.exitCode = bad.length ? 1 : 0;
const mint = await page.$('.sum-mint');
await mint.scrollIntoViewIfNeeded();
await mint.screenshot({ path: path.join(OUT, `${TAG}-summary-mint-set${SET}-${W}x${H}${DARK ? '-dark' : ''}${MOTION === 'reduce' ? '-reduced' : ''}.png`) });
await browser.close(); server.close();
