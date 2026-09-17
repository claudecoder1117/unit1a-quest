// qa/fix5-gen-walk.mjs — fix5 lane "gen" driver (dev only, not part of the artifact). See notes/FIX5-gen.md.
// Serves site/ unpatched (every tap goes through the real widgets) and writes PNGs to qa/screenshots/fix5-gen/.
// Usage: node qa/fix5-gen-walk.mjs place <tag> [--dark]     fresh visit → #/onboard → Start → shoot placement item 1
//        node qa/fix5-gen-walk.mjs grade <tag>              placement item 1 answered CORRECTLY by real taps, then
//                                                           two T-notation Variants: one correct, one wrong (reversed ray)
//        node qa/fix5-gen-walk.mjs dev <tag> [--dark] [--set a|b|c|d|v]   qa/fix5-gen-figures.html (repo root) — one batch, full page
// One screenshot per mode run (grade mode shoots one PNG per answer, after grading).
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const OUT = path.join(REPO, 'qa', 'screenshots', 'fix5-gen');
await mkdir(OUT, { recursive: true });
const [mode = 'place', tag = 'x'] = process.argv.slice(2);
const dark = process.argv.includes('--dark');
const ROOT = mode === 'dev' ? REPO : path.join(REPO, 'site');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  try {
    const st = await stat(file); if (!st.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const say = (...a) => console.log(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));

async function open(route, { w = 375, h = 667 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(base + route, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}
const tap = (page, sel) => page.$eval(sel, (e) => e.click());
const cardReady = (page) => page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w', { timeout: 20000 });

/** What the page shows about the figure: letters drawn, stem, clipping/overlap measured in the DOM. */
const FIGPROBE = `(() => {
  const svg = document.querySelector('.card-figure svg');
  const stem = document.querySelector('.card-stem')?.innerText.replace(/\\s+/g, ' ').trim();
  if (!svg) return { figure: false, stem };
  const box = svg.getBoundingClientRect();
  const labels = [...svg.querySelectorAll('.fig-label')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() }));
  const clipped = labels.filter(({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5).map((l) => l.t);
  const over = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = labels[i].r, b = labels[j].r;
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) over.push(labels[i].t + '/' + labels[j].t);
  }
  const vis = !!document.querySelector('.card-figure:not([hidden])');
  return { figure: true, visible: vis, w: Math.round(box.width), h: Math.round(box.height), letters: labels.map((l) => l.t), clipped, over, aria: svg.getAttribute('aria-label'), stem, overflow: document.documentElement.scrollWidth > innerWidth };
})()`;

async function toPlacementItem1(page) {
  await page.goto(base + '#/onboard', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ob-next', { timeout: 15000 });
  await tap(page, '.ob-next');
  await page.waitForSelector('text=Next: where are you now?', { timeout: 15000 });
  await page.click('text=Next: where are you now?');
  await page.waitForSelector('text=Start ·', { timeout: 15000 });
  await page.click('text=Start ·');
  await cardReady(page);
  await page.waitForTimeout(500);
}

/** Build {kind, pts} with real taps and submit; returns the result text. */
async function buildAndSubmit(page, kind, pts, name) {
  await tap(page, `.w-nt-deco-btn[data-kind="${kind}"]`);
  for (const L of pts) await tap(page, `.w-nt-letter[data-l="${L}"]`);
  await page.waitForTimeout(150);
  const preview = await page.$eval('.w-nt-preview', (e) => e.getAttribute('aria-label'));
  await tap(page, '.card-submit:not([hidden])');
  await page.waitForTimeout(700);
  const res = await page.evaluate(() => ({
    result: document.querySelector('.card-result')?.innerText.replace(/\s+/g, ' ').slice(0, 200) ?? null,
    msg: document.querySelector('.w-nt .w-msg, .w-nt [role="status"]')?.innerText ?? null,
    state: document.querySelector('.w-nt')?.dataset.state ?? null,
    cont: !!document.querySelector('.card-continue:not([hidden])'),
  }));
  await page.evaluate(() => document.querySelector('.card-figure')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  const p = path.join(OUT, name);
  await page.screenshot({ path: p });
  say('built', { kind, pts, preview }, 'graded', res, 'shot', p);
  return res;
}

try {
  if (mode === 'place') {
    const { ctx, page, errors } = await open('version.js');
    await toPlacementItem1(page);
    const probe = await page.evaluate(FIGPROBE);
    const p = path.join(OUT, `${tag}-place-item1-${dark ? 'dark' : 'light'}.png`);
    await page.screenshot({ path: p });
    say('probe', probe, 'errors', errors, 'shot', p);
    await ctx.close();
  } else if (mode === 'grade') {
    const sti = process.argv.indexOf('--step'); const step = sti > 0 ? +process.argv[sti + 1] : 0;   // one screenshot per run
    // 1) placement item 1, answered correctly by taps (the params the placement uses: kind 'ray')
    let ctx, page, errors;
    if (!step || step === 1) {
    ({ ctx, page, errors } = await open('version.js'));
    await toPlacementItem1(page);
    const want = await page.evaluate(async () => {
      const T = await import('/data/templates.js');
      const save = JSON.parse(localStorage.getItem('u1a.save'));
      const p6 = String(save?.profileId ?? 'anon').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'anon';
      const it = T.generate('T-notation', `${p6}-pl-notation`, { kind: 'ray' });
      return { stem: it.stem, answer: it.params.answer, figLetters: it.figure ? Object.keys(it.figure.spec.points ?? {}) : null };
    });
    const probe = await page.evaluate(FIGPROBE);
    say('placement item 1', want, 'dom stem matches', probe.stem?.includes(want.stem.slice(0, 40)), 'probe', probe);
    await buildAndSubmit(page, want.answer.kind, want.answer.pts, `${tag}-grade-place1-correct.png`);
    say('errors', errors); await ctx.close();
    }
    // 2) + 3) two Variants on the real /variant route
    for (const [seed, correct, n] of [['fix5-gen-a', true, 2], ['fix5-gen-b', false, 3]]) {
      if (step && step !== n) continue;
      ({ ctx, page, errors } = await open('version.js'));
      await page.goto(base + `#/variant/T-notation?seed=${seed}`, { waitUntil: 'networkidle' });
      await cardReady(page); await page.waitForTimeout(400);
      const it = await page.evaluate(async (s) => { const T = await import('/data/templates.js'); const x = T.generate('T-notation', s); return { stem: x.stem, kind: x.params.kind, answer: x.params.answer }; }, seed);
      const pr = await page.evaluate(FIGPROBE);
      say(`variant ${seed}`, it, 'dom stem matches', pr.stem?.includes(it.stem.slice(0, 40)), 'probe', pr);
      if (it.kind === 'read') { say('SKIP read kind for tap-build; choose another seed'); await ctx.close(); continue; }
      const a = it.answer;
      const pts = correct ? a.pts : a.pts.slice().reverse();
      await buildAndSubmit(page, a.kind, pts, `${tag}-grade-${seed}-${correct ? 'correct' : 'wrong'}.png`);
      say('errors', errors); await ctx.close();
    }
  } else if (mode === 'dev') {
    const si = process.argv.indexOf('--set'); const set = si > 0 ? process.argv[si + 1] : 'a';
    const { ctx, page, errors } = await open(`qa/fix5-gen-figures.html?set=${set}`, { w: 375, h: 800 });
    await page.waitForFunction(() => window.__report, null, { timeout: 20000 });
    const rep = await page.evaluate(() => window.__report);
    const p = path.join(OUT, `${tag}-dev-${set}-${dark ? 'dark' : 'light'}.png`);
    await page.screenshot({ path: p, fullPage: true });
    say('report', rep, 'errors', errors, 'shot', p);
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
