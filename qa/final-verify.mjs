// qa/final-verify.mjs — ticket FINAL, step 2 and step 3.
//
// Step 2: the STUDENT'S OWN CASE, by hand, in webkit (= Safari), at the window he actually used and two
// more: 1900x1200, 2560x1440, 1280x800. Route #/onboard?step=3 -> PLACEMENT item 1. It prints the numbers
// that were wrong on the live site (.card-stem width in px and ch, .card-paper's computed tracks, the
// .card-screen and .card-host widths, and how many lines the question text actually renders on) and writes
// a PNG per size to read by eye.
//
//   node qa/final-verify.mjs place                       # step 2 (webkit, 3 sizes)
//   node qa/final-verify.mjs walk [--w 1900 --h 1200]    # step 3: one full session, a PNG per screen
//   node qa/final-verify.mjs place --engine chromium     # the other engine, for comparison
//
// Dev-only. Serves site/ at the origin root exactly as qa/shot.mjs does. Writes into
// qa/screenshots/final/ (git-ignored).
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), 'shot.mjs'));
const pw = require('playwright');
const QA = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(QA, '..', 'site');
const OUT = path.join(QA, 'screenshots', 'final');

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) || 'place';
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const nap = (page, ms) => page.waitForTimeout(ms);

/** Every number the student's bug was made of, measured on the live DOM. */
const measure = (page) => page.evaluate(() => {
  const px = (v) => Math.round(v * 10) / 10;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); return { w: px(r.width), contentW: px(r.width - padX) }; };
  const stem = document.querySelector('.card-stem');
  const paper = document.querySelector('.card-paper');
  const screen = document.querySelector('.card-screen');
  const host = document.querySelector('.card-host');

  // ch is font-relative, and webkit's "0" is ~4% wider than chromium's, so measure it in the stem's
  // own font with a real probe instead of assuming a number.
  let ch = null;
  if (stem) {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    probe.textContent = '0'.repeat(10);
    stem.appendChild(probe);
    const one = probe.getBoundingClientRect().width / 10;
    probe.remove();
    if (one > 0) ch = px(box(stem).contentW / one);
  }

  // How many lines the question ACTUALLY renders on (the bug was ~1 char per line), from the real text
  // nodes, not the element box.
  let lines = null, chars = 0;
  if (stem) {
    const walker = document.createTreeWalker(stem, NodeFilter.SHOW_TEXT);
    const ys = new Set(); let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      chars += n.nodeValue.trim().length;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0 || r.height > 0) ys.add(Math.round(r.top));
    }
    lines = ys.size;
  }
  return {
    stem: box(stem), stemCh: ch, stemLines: lines, stemChars: chars,
    stemText: stem ? stem.textContent.trim().replace(/\s+/g, ' ').slice(0, 90) : null,
    paper: box(paper), paperTracks: paper ? getComputedStyle(paper).gridTemplateColumns : null,
    screen: box(screen), screenTracks: screen ? getComputedStyle(screen).gridTemplateColumns : null,
    host: box(host), hostType: host ? getComputedStyle(host).containerType : null,
    docOverflow: px(document.documentElement.scrollWidth - window.innerWidth),
  };
});

/** #/onboard?step=3 -> Start -> PLACEMENT item 1, from a cleared save. */
async function toPlacementItem1(page) {
  await page.goto(base + '#/onboard?step=3', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('u1a.save'));
  await page.goto(base + '#/onboard?step=3', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ob-step', { timeout: 20000 });
  await nap(page, 400);
  await page.click('.ob-step button.btn-primary, .ob-step .btn-primary');
  await page.waitForSelector('.ob-run .card-screen', { timeout: 20000 });
  await page.waitForSelector('.card-screen:not([data-state="loading"])', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.card-parts .w, .card-parts .w-field, .card-parts button', { timeout: 20000 }).catch(() => {});
  await nap(page, 600);
}

const engineName = opt('engine', 'webkit');
const browser = await pw[engineName].launch();

if (mode === 'place') {
  const sizes = [[1900, 1200], [2560, 1440], [1280, 800]];
  console.log(`\nFINAL step 2 — the student's case in ${engineName} (webkit = Safari): #/onboard?step=3, PLACEMENT item 1\n`);
  const rows = [];
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await toPlacementItem1(page);
    const m = await measure(page);
    const png = path.join(OUT, `place-item1-${w}x${h}-${engineName}.png`);
    await page.screenshot({ path: png, fullPage: false });
    rows.push({ vp: `${w}x${h}`, ...m, errs: errs.length, png });
    console.log(`${w}x${h}`);
    console.log(`  .card-host    ${m.host ? m.host.w + 'px  (container-type: ' + m.hostType + ')' : 'MISSING'}`);
    console.log(`  .card-screen  ${m.screen ? m.screen.w + 'px  tracks: ' + m.screenTracks : 'MISSING'}`);
    console.log(`  .card-paper   ${m.paper ? m.paper.w + 'px  tracks: ' + m.paperTracks : 'MISSING'}`);
    console.log(`  .card-stem    ${m.stem ? m.stem.contentW + 'px content box = ' + m.stemCh + 'ch' : 'MISSING'}   <-- was 0px on the live site`);
    console.log(`  question      ${m.stemChars} chars on ${m.stemLines} rendered line(s)  (the bug: ~1 char per line)`);
    console.log(`  doc overflow  ${m.docOverflow}px     console errors: ${errs.length}`);
    console.log(`  text          "${m.stemText}"`);
    console.log(`  png           ${png}\n`);
    await ctx.close();
  }
  // The verdict, machine-checked so this script cannot "pass" by printing numbers nobody reads.
  let bad = 0;
  for (const r of rows) {
    const fail = [];
    if (!r.stem) fail.push('no .card-stem at all');
    else {
      if (r.stem.contentW < 60) fail.push(`stem ${r.stem.contentW}px`);
      if (r.stemCh < 18) fail.push(`stem ${r.stemCh}ch < 18ch`);
      if (r.stemLines > Math.max(2, r.stemChars / 12)) fail.push(`${r.stemChars} chars on ${r.stemLines} lines`);
    }
    if (/(^|\s)0px/.test(r.paperTracks || '')) fail.push(`0px paper track: ${r.paperTracks}`);
    if (r.docOverflow > 1) fail.push(`doc overflows by ${r.docOverflow}px`);
    if (r.errs) fail.push(`${r.errs} console errors`);
    if (fail.length) { bad++; console.log(`FAIL ${r.vp}: ${fail.join(' | ')}`); }
  }
  console.log(bad ? `\n${bad}/${rows.length} sizes FAIL` : `\nALL ${rows.length} sizes PASS — the question reads as prose in every one`);
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
}

/* ---------------- step 3: one full session at desktop width ---------------- */

const W = +opt('w', 1900), H = +opt('h', 1200);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e));
page.on('console', (m) => { if (m.type() === 'error' && !/service ?worker|sw\.js/i.test(m.text())) errors.push('console: ' + m.text()); });

let n = 0;
async function shot(label) {
  n++;
  const png = path.join(OUT, `walk-${String(n).padStart(2, '0')}-${label}-${W}x${H}-${engineName}.png`);
  await page.screenshot({ path: png, fullPage: false });
  const m = await measure(page);
  // Which save is actually on screen? A walk that silently falls back to a fresh save is a walk of the
  // wrong screens (it happened: a goto that only changes the hash does not re-boot the app).
  const who = await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('u1a.save')); return (s?.profileId || 'none') + ' xp=' + (s?.xp ?? '?'); } catch { return 'unreadable'; } });
  const flags = [];
  if (/^none/.test(who)) flags.push('NO SAVE');
  if (m.stem && m.stem.contentW < 60) flags.push(`STEM ${m.stem.contentW}px`);
  if (m.stemCh != null && m.stemCh < 18) flags.push(`STEM ${m.stemCh}ch`);
  if (/(^|\s)0px/.test(m.paperTracks || '')) flags.push(`0px paper track (${m.paperTracks})`);
  if (m.docOverflow > 1) flags.push(`doc overflow ${m.docOverflow}px`);
  console.log(`${String(n).padStart(2, '0')} ${label.padEnd(22)} ${m.stem ? `stem ${m.stem.contentW}px/${m.stemCh}ch` : '(no card)'}  save=${who}  ${flags.length ? 'FLAG: ' + flags.join(', ') : 'ok'}`);
  console.log(`   ${png}`);
  return m;
}

/** Answer the current card wrong on purpose (the fastest way to the next item), then continue. */
async function missAndContinue(page) {
  const opt1 = page.locator('.card-parts .w-mc button, .card-parts .w-tf button, .card-parts button[data-choice]').first();
  if (await opt1.count()) await opt1.click({ timeout: 4000 }).catch(() => {});
  else {
    const f = page.locator('.card-parts input[type="text"], .card-parts input:not([type]), .card-parts input[type="number"]').first();
    if (await f.count()) { await f.fill('999999'); }
  }
  const check = page.locator('.card-check:not([hidden]), button.card-check, .card-parts ~ * button.btn-primary').first();
  if (await check.count()) await check.click({ timeout: 4000 }).catch(() => {});
  await nap(page, 700);
  const cont = page.locator('.card-continue:not([hidden])').first();
  if (await cont.count()) await cont.click({ timeout: 4000 }).catch(() => {});
  await nap(page, 900);
}

console.log(`\nFINAL step 3 — one full session in ${engineName} at ${W}x${H}\n`);

await toPlacementItem1(page);
await shot('placement-item1');
for (let i = 0; i < 3; i++) { await missAndContinue(page); await shot(`placement-item${i + 2}`); }

// Straight to Home with a realistic mid-week save rather than grinding all 8 placement items.
// NOTE the order (qa/audit-states.mjs `go` does the same): land on a REAL document first, write the
// save, and only then set the hash — a goto that changes nothing but the hash does not re-boot the app,
// so a save written after the first load is never read and the screen comes up fresh.
// AND verify it took: leaving a live run (the placement) the app writes its own state back over the
// fixture, so the first attempt lands on the run's save and the screen is the wrong screen. Same reason
// qa/audit-states.mjs has ensureSave() — write, boot, CHECK, retry.
const midweek = await readFile(path.join(QA, 'fixtures', 'midweek.json'), 'utf8');
const wantId = JSON.parse(midweek).profileId;
async function withSave(hash, root, save = midweek) {
  const want = save ? JSON.parse(save).profileId : null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(base + 'version.js', { waitUntil: 'load' });
    await page.evaluate(async () => {
      const rs = await navigator.serviceWorker?.getRegistrations?.().catch(() => []) || [];
      for (const r of rs) await r.unregister().catch(() => {});
    });
    await page.evaluate((j) => { if (j) localStorage.setItem('u1a.save', j); else localStorage.removeItem('u1a.save'); }, save);
    await page.goto(base + hash, { waitUntil: 'load', timeout: 60000 });
    if (root) await page.waitForSelector(root, { timeout: 20000 }).catch(() => {});
    await nap(page, 900);
    const got = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('u1a.save'))?.profileId ?? null; } catch { return null; } });
    if (got === want) return;
    if (attempt === 3) throw new Error(`${hash}: the fixture never took — wanted ${want}, got ${got}. The walk would be measuring the wrong screen.`);
  }
}
await withSave('#/today', '.home');
await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 }).catch(() => {});
await shot('home');

// Today's Page: 4 items, then the summary.
const start = page.locator('.home-primary a, .home-primary button, a[href*="#/run/page"]').first();
if (await start.count()) await start.click({ timeout: 6000 }).catch(() => {});
await page.waitForSelector('.card-screen', { timeout: 20000 }).catch(() => {});
await nap(page, 800);
await shot('page-item1');
for (let i = 0; i < 3; i++) { await missAndContinue(page); await shot(`page-item${i + 2}`); }
// Run it out to the summary.
for (let i = 0; i < 14; i++) {
  if (await page.locator('.sum-stats, .run-summary, .sum-bar').count()) break;
  await missAndContinue(page);
}
await nap(page, 700);
await shot('page-summary');

for (const [label, route, root] of [
  ['binder', '#/binder', '.binder'],
  ['mock-rules', '#/mock', '.mock-screen, .mock-rules, .screen'],
  ['settings', '#/settings', '.screen'],
]) {
  await withSave(route, root);
  await shot(label);
}

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e);
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
