// qa/fixb6-probe.mjs — measurement probe for ticket FIX:B6 (card side rail + mc/termmatch cosmetics).
// Dev tool, never part of site/. Serves ../site like qa/shot.mjs and prints the two numbers the
// layout audit complains about, so a fix can be judged by measurement instead of by eye:
//
//   A. the hint ladder's button — the ladder's content width, the button's box, and for every child
//      of the button its own content width, its line boxes and its widest inked line (in ch).
//      Finding 9: `span.muted.fs-1` measured 17.1ch inside a 27.7ch ladder.
//   B. the mc options on #/card/voc-09 — every .wd-opt box and every .wd-opt-t line box, plus any
//      ink that lands outside its own button or on a neighbouring one.
//      Finding 16: a 1183px² graze, webkit only, 844x390.
//
//   node qa/fixb6-probe.mjs [--engine chromium|webkit|both] [--tag before|after]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const FIX = path.resolve(__dirname, 'fixtures', 'midweek.json');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const ENGINES = opt('engine', 'both') === 'both' ? ['chromium', 'webkit'] : [opt('engine', 'both')];
const TAG = opt('tag', '');

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
const PORT = server.address().port;
const SAVE = await readFile(FIX, 'utf8');

const VPS = [[375, 667], [834, 1112], [1440, 900], [1900, 1200], [844, 390]];

async function open(browser, w, h, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/version.js`, { waitUntil: 'load' });
  await page.evaluate((j) => localStorage.setItem('u1a.save', j), SAVE);
  return { ctx, page };
}

/* ---- A: the hint button ---- */
const HINT_PROBE = () => {
  const px = (v) => Math.round(v * 10) / 10;
  const chOf = (el) => {
    const s = document.createElement('span');
    s.textContent = '0000000000';
    s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    el.appendChild(s);
    const w = s.getBoundingClientRect().width / 10;
    s.remove();
    return w;
  };
  const ladder = document.querySelector('.card-side .hint-ladder');
  const btn = document.querySelector('.card-side .card-hint-btn');
  if (!ladder || !btn) return { missing: true };
  const lc = getComputedStyle(ladder);
  const lw = ladder.getBoundingClientRect().width - parseFloat(lc.paddingLeft) - parseFloat(lc.paddingRight) - parseFloat(lc.borderLeftWidth) - parseFloat(lc.borderRightWidth);
  const br = btn.getBoundingClientRect();
  const kids = [...btn.children].map((el) => {
    const c = getComputedStyle(el);
    const cw = el.getBoundingClientRect().width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
    const r = document.createRange();
    r.selectNodeContents(el);
    const lines = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    const ch = chOf(el);
    return {
      sel: el.className || el.tagName.toLowerCase(),
      text: el.textContent.trim().slice(0, 40),
      display: c.display,
      cw: px(cw), ch: px(ch), cwCh: px(cw / ch),
      lines: lines.length,
      widestInkCh: px(Math.max(0, ...lines.map((x) => x.width)) / ch),
    };
  });
  return {
    ladderCw: px(lw), ladderCh: px(lw / chOf(ladder)),
    btn: { w: px(br.width), h: px(br.height), text: btn.textContent.trim() },
    btnLines: (() => { const r = document.createRange(); r.selectNodeContents(btn); return [...r.getClientRects()].filter((x) => x.width > 0).length; })(),
    kids,
  };
};

/* ---- B: the mc options ---- */
const MC_PROBE = () => {
  const px = (v) => Math.round(v * 10) / 10;
  const inter = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const opts = [...document.querySelectorAll('.w-mc .wd-opts > .wd-opt')];
  const rows = opts.map((b, i) => {
    const br = b.getBoundingClientRect();
    const t = b.querySelector('.wd-opt-t');
    const r = document.createRange();
    if (t) r.selectNodeContents(t);
    const lines = t ? [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0) : [];
    const cs = getComputedStyle(b);
    return {
      i,
      box: { top: px(br.top), bottom: px(br.bottom), w: px(br.width), h: px(br.height) },
      minH: cs.minHeight, align: cs.alignItems, padY: `${cs.paddingTop}/${cs.paddingBottom}`,
      lineH: t ? getComputedStyle(t).lineHeight : null,
      text: t ? t.textContent.trim().slice(0, 34) : null,
      lines: lines.map((x) => ({ top: px(x.top), bottom: px(x.bottom), w: px(x.width) })),
      spillBelow: lines.length ? px(Math.max(0, Math.max(...lines.map((x) => x.bottom)) - br.bottom)) : 0,
      spillAbove: lines.length ? px(Math.max(0, br.top - Math.min(...lines.map((x) => x.top)))) : 0,
    };
  });
  const grazes = [];
  for (const a of rows) {
    for (const b of rows) {
      if (a.i === b.i) continue;
      const box = opts[b.i].getBoundingClientRect();
      const area = a.lines.reduce((s, l) => s + inter({ left: 0, right: 1e4, top: l.top, bottom: l.bottom }, box), 0);
      if (area > 0) grazes.push({ text: `opt${a.i} ink over opt${b.i} box`, area: px(area) });
    }
  }
  return { count: rows.length, rows, grazes };
};

const out = [];
for (const name of ENGINES) {
  const browser = await playwright[name].launch();
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of VPS) {
      // A — the hint ladder, on #/card/wp-01 with two hints open (the audit's card-wp-01-hint)
      {
        const { ctx, page } = await open(browser, w, h, theme);
        await page.goto(`http://127.0.0.1:${PORT}/#/card/wp-01`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.card-screen', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        for (let k = 0; k < 2; k++) {
          await page.click('.card-hint-btn, .card-dock-hint').catch(() => {});
          await page.waitForTimeout(350);
        }
        out.push({ probe: 'hint', engine: name, theme, vp: `${w}x${h}`, ...(await page.evaluate(HINT_PROBE)) });
        await ctx.close();
      }
      // B — the mc options, on #/card/voc-09 (the audit's card-termmatch)
      {
        const { ctx, page } = await open(browser, w, h, theme);
        await page.goto(`http://127.0.0.1:${PORT}/#/card/voc-09`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.card-screen', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        out.push({ probe: 'mc', engine: name, theme, vp: `${w}x${h}`, ...(await page.evaluate(MC_PROBE)) });
        await ctx.close();
      }
    }
  }
  await browser.close();
}

/* ---- print ---- */
console.log(`\n=== FIX:B6 probe ${TAG ? `(${TAG})` : ''} ===`);
console.log('\nA. hint ladder button (finding 9: a 17.1ch text block in a 27.7ch container)');
for (const r of out.filter((x) => x.probe === 'hint')) {
  if (r.missing) { console.log(`  ${r.engine}/${r.theme} ${r.vp}: NO LADDER (rail hidden at this host width)`); continue; }
  console.log(`  ${r.engine}/${r.theme} ${r.vp}: ladder ${r.ladderCw}px (${r.ladderCh}ch) · button ${r.btn.w}x${r.btn.h} · ${r.btnLines} line(s) · "${r.btn.text}"`);
  for (const k of r.kids) console.log(`      ${k.sel.padEnd(28)} display:${k.display.padEnd(12)} cw ${String(k.cw).padStart(6)}px = ${String(k.cwCh).padStart(5)}ch · ${k.lines} line(s) · widest ink ${k.widestInkCh}ch · "${k.text}"`);
}
console.log('\nB. mc options (finding 16: 1183px² graze, webkit, 844x390)');
for (const r of out.filter((x) => x.probe === 'mc')) {
  const bad = r.grazes.length;
  const spill = r.rows.filter((x) => x.spillBelow > 0.5 || x.spillAbove > 0.5);
  console.log(`  ${r.engine}/${r.theme} ${r.vp}: ${r.count} option(s) · ink outside its own button: ${spill.length} · ink over another button: ${bad}`);
  for (const s of spill) console.log(`      opt${s.i} box h=${s.box.h} (min-height ${s.minH}, align ${s.align}, pad ${s.padY}, line-height ${s.lineH}) spill above ${s.spillAbove} below ${s.spillBelow} — "${s.text}"`);
  for (const g of r.grazes) console.log(`      ${g.text}: ${g.area}px²`);
}
const worst = Math.max(0, ...out.filter((x) => x.probe === 'mc').flatMap((r) => r.grazes.map((g) => g.area)));
const narrow = out.filter((x) => x.probe === 'hint' && !x.missing).flatMap((r) => r.kids.filter((k) => k.cwCh < 18 && k.text.length >= 20).map((k) => `${r.engine}/${r.theme} ${r.vp} ${k.sel} ${k.cwCh}ch`));
console.log(`\nVERDICT: worst mc graze ${worst}px² · hint children under the 18ch squeeze floor: ${narrow.length}${narrow.length ? ' → ' + narrow.join(', ') : ''}`);

await new Promise((r) => server.close(r));
