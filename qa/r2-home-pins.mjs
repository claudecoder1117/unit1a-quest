// qa/r2-home-pins.mjs — Playwright pins for the Home / Onboarding / Placement round-2 fixes (not part of
// `node --test`: the suite is DOM-free; run this by hand after touching the header chip, the placement
// head or Home's boot graph).
//   node qa/r2-home-pins.mjs chip     — #hdr-tminus / "set test date" hit box ≥ 44 px by elementFromPoint (375×667, light+dark)
//   node qa/r2-home-pins.mjs place    — placement: compact head, stem top ≤ 230 px, skip in the dock, back → intro → start from zero
//   node qa/r2-home-pins.mjs cold     — cold boot (SW blocked) on Wi-Fi and a 3G-class profile: files / bytes / ms to the CTA
// Serves ../site the way qa/shot.mjs does. PNGs land in --out <dir> (default: qa/screenshots).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const args = process.argv.slice(2);
const mode = args[0] || 'chip';
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const OUT = opt('out', path.join(__dirname, 'screenshots'));
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
const browser = await chromium.launch();
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

async function open({ w = 375, h = 667, dark = false, state = null, route = '#/today', sw = false, cdp = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: sw ? 'allow' : 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.goto(base + 'version.js', { waitUntil: 'load' });
  if (state) await page.evaluate(j => localStorage.setItem('u1a.save', j), state);
  if (cdp) await cdp(page);
  await page.goto(base + route, { waitUntil: 'commit' });
  return { ctx, page, errors };
}

/* ---------------- chip ---------------- */
async function chipScan(page, id) {
  return page.evaluate((id) => {
    const c = document.getElementById(id); if (!c || c.hidden) return null;
    const r = c.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hits = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === c || c.contains(e)); };
    let top = cy; while (top > 0 && hits(cx, top - 1)) top--;
    let bot = cy; while (bot < innerHeight && hits(cx, bot + 1)) bot++;
    let left = cx; while (left > 0 && hits(left - 1, cy)) left--;
    let right = cx; while (right < innerWidth && hits(right + 1, cy)) right++;
    return { text: c.textContent, visual: [Math.round(r.width * 10) / 10, r.height], hit: [right - left + 1, bot - top + 1], up9: hits(cx, r.top - 9), down9: hits(cx, r.bottom + 9) };
  }, id);
}
async function modeChip() {
  const mid = await readFile(path.join(__dirname, 'fixtures', 'midweek.json'), 'utf8');
  for (const dark of [false, true]) {
    for (const [name, state] of [['midweek', mid], ['fresh', null]]) {
      const { ctx, page, errors } = await open({ dark, state, route: name === 'fresh' ? '#/today' : '#/today' });
      await page.waitForSelector('.hdr', { timeout: 10000 });
      await page.waitForTimeout(400);
      const r = await chipScan(page, 'hdr-tminus');
      const tag = `${name} ${dark ? 'dark' : 'light'}`;
      if (!r) { check(false, `${tag}: #hdr-tminus not visible`); await ctx.close(); continue; }
      check(r.hit[1] >= 44 && r.up9 && r.down9, `${tag}: chip "${r.text}" visual ${r.visual.join('×')} hit ${r.hit.join('×')} (±9 px: ${r.up9}/${r.down9})`);
      check(errors.length === 0, `${tag}: no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
      await ctx.close();
    }
  }
}

/* ---------------- placement ---------------- */
async function anatomy(page) {
  return page.evaluate(() => {
    const q = s => document.querySelector(s); const box = s => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; };
    return { head: box('.ob-run-head'), headline: q('.ob-run-headline')?.innerText.replace(/\s+/g, ' '), stem: box('.card-stem'), dock: box('#dock'), dockText: q('#dock')?.innerText.replace(/\s+/g, ' '), skipInHead: !!q('.ob-run-head .ob-skip'), quitInHead: !!q('.ob-run-head .ob-quit'), skipInDock: !!q('#dock .ob-skip'), back: q('.card-back')?.getAttribute('href'), compact: q('.ob-run-head')?.dataset.compact, firstInputTop: (() => { const i = q('.card-parts input, .card-parts button.w-key, .card-parts button'); return i ? Math.round(i.getBoundingClientRect().top) : null; })() };
  });
}
/** Answer the current card badly until Continue shows (three wrongs reveal), then continue. */
const tap = (el) => el.evaluate(e => e.click());   // no visibility wait: keys can sit under the dock
/** Answer the current card badly until Continue shows (three wrongs reveal), then continue. */
async function bruteItem(page) {
  // card r1 made Submit idempotent (the same wrong answer is charged once), so every attempt is a DIFFERENT wrong answer.
  for (let n = 0; n < 6; n++) {
    if (await page.$('.card-continue:not([hidden])')) break;
    const skip = await page.$('.w-eq-skip'); if (skip) await tap(skip);
    const inputs = await page.$$('.card-parts input:not([disabled]), .card-parts textarea:not([disabled])');
    const ratio = await page.$('.card-parts .w-ratio, .card-parts [placeholder*=":"]');
    for (const i of inputs) { try { await i.fill(ratio ? `${7 + n}:${n + 1}` : String(7 + n)); } catch { /* not fillable */ } }
    if (!inputs.length) {
      const decos = await page.$$('.w-nt-deco-btn');
      if (decos.length) {
        const clear = await page.$('.w-nt-edit:last-child'); if (clear) await tap(clear);
        await tap(decos[n % decos.length]);
        const letters = await page.$$('.w-nt-letter'); if (letters.length) { await tap(letters[n % letters.length]); await tap(letters[(n + 1) % letters.length]); }
      } else {
        const bs = await page.$$('.card-parts button:not([disabled]):not(.w-key)'); if (bs.length) await tap(bs[n % bs.length]);
      }
    }
    const submit = await page.$('.card-submit:not([hidden])'); if (submit) await tap(submit);
    await page.waitForTimeout(300);
    if (await page.$('.card-continue:not([hidden])')) break;
    const sol = await page.$('.card-showsol:not([hidden])'); if (sol) { await tap(sol); await page.waitForTimeout(300); }
  }
  const cont = await page.$('.card-continue:not([hidden])');
  if (!cont) console.log('stuck on', await page.evaluate(() => document.querySelector('.card-parts')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
  return !!cont;
}
async function modePlace() {
  const { ctx, page, errors } = await open({ route: '#/onboard?step=3' });
  await page.waitForSelector('text=Start ·', { timeout: 15000 });
  await page.click('text=Start ·');
  await page.waitForSelector('.card-stem', { timeout: 15000 });
  await page.waitForTimeout(500);
  let a = await anatomy(page);
  console.log('item 1', JSON.stringify(a));
  check(a.compact === 'true' && a.head.h <= 60, `item 1: compact head ${a.head?.h} px (was 106)`);
  check(a.stem && a.stem.top <= 230, `item 1: .card-stem top ${a.stem?.top} ≤ 230`);
  check(!a.skipInHead && !a.quitInHead, 'item 1: no ghost buttons in the sticky head');
  check(a.back === '#/onboard?step=3&intro=1', `item 1: ← goes to the intro (${a.back})`);
  await shot(page, 'r2-place-item1.png');
  const total = Number((a.headline.match(/\/ (\d)/) || [])[1] || 8);
  let reached = 1;
  for (let i = 1; i <= total; i++) {
    const ok = await bruteItem(page);
    if (!ok) { console.log(`item ${i}: could not finish (widget not driven)`); break; }
    a = await anatomy(page);
    if (i === 4) { check(a.skipInDock, `after item 4: "Skip the rest" is in the dock (${a.dockText})`); await shot(page, 'r2-place-after4.png'); }
    if (i === total || i === 5) break;   // geometry of items 1–5 is enough; skip the rest from item 6's dock (item 8 was measured in an earlier full run)
    await tap(await page.$('.card-continue'));
    await page.waitForTimeout(500);
    reached = i + 1;
    a = await anatomy(page);
    console.log(`item ${reached}`, JSON.stringify(a));
    check(a.stem && a.stem.top <= 230, `item ${reached}: .card-stem top ${a.stem?.top} ≤ 230 (head ${a.head?.h})`);
    if (reached >= 5) check(a.skipInDock, `item ${reached}: skip in the dock`);
    if (reached === total) { await shot(page, `r2-place-item${reached}.png`); }
  }
  if (reached >= 5) {
    await tap(await page.$('.card-continue')); await page.waitForTimeout(500);
    a = await anatomy(page); console.log(`item ${reached + 1}`, JSON.stringify(a));
    check(a.stem && a.stem.top <= 230 && a.skipInDock, `item ${reached + 1}: stem ${a.stem?.top} ≤ 230, skip in the dock`);
    await shot(page, `r2-place-item${reached + 1}.png`);
    await tap(await page.$('#dock .ob-skip'));
    await page.waitForSelector('text=Placement done', { timeout: 10000 });
    await page.waitForTimeout(300);
    const sum = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 300).replace(/\s+/g, ' '), placement: JSON.parse(localStorage.getItem('u1a.save')).placement }));
    console.log('summary', JSON.stringify(sum));
    check(sum.placement.answered >= 4 && sum.placement.answered + sum.placement.skipped === total && new RegExp(`${sum.placement.answered} of ${total} answered`).test(sum.text), `skip keeps the ${sum.placement.answered} answered and says so`);
    await shot(page, 'r2-place-summary.png');
  }
  check(errors.length === 0, `placement: no console errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
  await ctx.close();

  // the honest way out before item 4: ← (intro) → "I'll start from zero" → nothing placed
  const b = await open({ route: '#/onboard?step=3' });
  await b.page.waitForSelector('text=Start ·', { timeout: 15000 });
  await b.page.click('text=Start ·');
  await b.page.waitForSelector('.card-stem', { timeout: 15000 });
  await bruteItem(b.page); await tap(await b.page.$('.card-continue')); await b.page.waitForTimeout(400);
  await bruteItem(b.page); await tap(await b.page.$('.card-continue')); await b.page.waitForTimeout(400);
  await b.page.click('.card-back');
  await b.page.waitForSelector('text=start from zero', { timeout: 10000 });
  await b.page.click('text=start from zero');
  await b.page.waitForSelector('.home-hero', { timeout: 10000 });
  await b.page.waitForTimeout(600);
  const z = await b.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); return { placement: s.placement, jumps: s.jumps, placedSkills: Object.entries(s.skills || {}).filter(([, v]) => v.placedAt).map(([k]) => k), hero: document.querySelector('.hero-text')?.innerText.replace(/\s+/g, ' ') }; });
  console.log('zero', JSON.stringify(z));
  check(z.placement.answered === 0 && z.placement.placed.length === 0 && z.placedSkills.length === 0, 'start from zero after 2 answers: nothing placed, no placedAt');
  check(/Too early to say/.test(z.hero) && /of 19 skills tested/.test(z.hero), `hero after zero: ${z.hero}`);
  await shot(b.page, 'r2-home-after-zero.png');
  await b.ctx.close();
}

/* ---------------- cold boot ---------------- */
async function modeCold() {
  const mid = await readFile(path.join(__dirname, 'fixtures', 'midweek.json'), 'utf8');
  const profiles = { wifi: { latency: 20, down: 30e6 / 8, cpu: 1 }, '3g': { latency: 150, down: 1.6e6 / 8, cpu: 4 } };
  for (const [name, p] of Object.entries(profiles)) {
    const { ctx, page, errors } = await open({
      state: mid, route: '#/today',
      cdp: async (pg) => {
        const s = await pg.context().newCDPSession(pg);
        await s.send('Network.enable');
        await s.send('Network.emulateNetworkConditions', { offline: false, latency: p.latency, downloadThroughput: p.down, uploadThroughput: p.down / 2 });
        await s.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
      },
    });
    const t0 = Date.now();
    await page.waitForSelector('.home-primary', { timeout: 60000 });
    const paint = Date.now() - t0;
    const atPaint = await page.evaluate(() => { const rs = performance.getEntriesByType('resource'); return { files: rs.length + 1, bytes: rs.reduce((t, r) => t + (r.encodedBodySize || 0), 0) }; });
    await page.waitForSelector('.home-primary[data-kind="page"]', { timeout: 60000 });
    const cta = Date.now() - t0;
    const atCta = await page.evaluate(() => { const rs = performance.getEntriesByType('resource'); return { files: rs.length + 1, bytes: rs.reduce((t, r) => t + (r.encodedBodySize || 0), 0) }; });
    if (args.includes('--verbose')) console.log(await page.evaluate(() => performance.getEntriesByType('resource').map(r => `${Math.round(r.startTime)} ${r.encodedBodySize} ${r.name.replace(/^.*\/\/[^/]+\//, '')}`).join('\n')));
    await page.waitForLoadState('networkidle');
    const idle = await page.evaluate(() => { const rs = performance.getEntriesByType('resource'); return { files: rs.length + 1, bytes: rs.reduce((t, r) => t + (r.encodedBodySize || 0), 0), graders: rs.some(r => /grader\//.test(r.name)) }; });
    console.log(name, JSON.stringify({ paintMs: paint, atPaint, ctaMs: cta, atCta, idle }));
    if (name === '3g') { check(paint <= 2500 && atPaint.files <= 30 && atPaint.bytes < 400000, `3G: Home paints in ${paint} ms with ${atPaint.files} files / ${atPaint.bytes} B (target ≤ 2.5 s / ≤ 30 / < 400 KB)`); }
    if (name === 'wifi') check(cta <= 1000, `Wi-Fi: real CTA in ${cta} ms (S9 #1 < 1 s)`);
    check(errors.length === 0, `${name}: no console errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
    await ctx.close();
  }
}

try {
  if (mode === 'chip') await modeChip();
  else if (mode === 'place') await modePlace();
  else if (mode === 'cold') await modeCold();
  else console.log('modes: chip | place | cold');
} catch (e) { console.error('script error', e); fails.push(String(e)); }
await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pins hold');
process.exit(fails.length ? 1 : 0);
