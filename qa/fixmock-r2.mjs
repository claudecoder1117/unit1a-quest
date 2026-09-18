// qa/fixmock-r2.mjs — ticket fix:mock r2. Measures the Mock REPORT's own boxes and grid tracks.
//
// Why: `qa/layout-audit.mjs` cannot see a DEAD container threshold. `@container report (min-width:
// 720px)` sits on a `.report-screen` that base.css caps at the 680 px prose column, so the rule can
// never match and `.report-split` (your answer | the worked solution) is one column at EVERY
// viewport — where HEAD's viewport-keyed rule gave `273.625px 328.375px`. Nothing in the net fires:
// one column of readable text is not a 0 px track, not an overlap and not an overflow. So this
// prints the numbers instead: the host width, the box that actually reshapes, and its resolved
// tracks, in both engines.
//
//   node qa/fixmock-r2.mjs [--engines chromium,webkit] [--widths 375,834,1440,1900] [--themes light,dark]
//                          [--json out.json] [--shots <dir> --tag before|after]
//
// Exit code 1 if any assertion fails. Dev tool; never part of site/.

import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { states } from './audit-states.mjs';

const require = createRequire(import.meta.url);
const playwright = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// --site points the server at a COPY of site/ (the file-copy A/B: never edit the live tree to take a
// "before" reading — other lanes are appending to polish.css while this runs):
//   mkdir -p /tmp/nc && cp -R site /tmp/nc/ && sed -i '' '/=== fix:mock r2 ===/,$d' /tmp/nc/site/css/polish.css
//   node qa/fixmock-r2.mjs --site /tmp/nc/site --tag before   # the un-fixed reading
const SITE = path.resolve(process.argv.includes('--site') ? process.argv[process.argv.indexOf('--site') + 1] : path.join(__dirname, '..', 'site'));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const ENGINES = opt('engines', 'chromium,webkit').split(',').map(s => s.trim()).filter(Boolean);
const WIDTHS = opt('widths', '375,834,1024,1280,1440,1900,2560').split(',').map(Number);
const THEMES = opt('themes', 'light,dark').split(',').map(s => s.trim());
const JSON_OUT = opt('json', null);
const SHOTS = opt('shots', null);            // dir; one PNG per state x width x theme x engine
const TAG = opt('tag', 'after');

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

const ALL = states({ base });
const WANT = ['mock-report-expanded', 'mock-report'];
const PICKED = WANT.map(id => ALL.find(s => s.id === id)).filter(Boolean);

/* The auditor's own `mock-report-expanded` expands item 10 — its "miss" regex is /✗|miss|0\b/ and
   "10" matches `0\b`, so the state is a CORRECT item with an EMPTY scratch and a one-step solution.
   That is the easiest possible payload for `.report-split`. The screen a student actually reads is
   a MISSED item: his own typed working in the monospace scratch, a figure, and a multi-step worked
   solution. So this driver adds that state itself — same fixture, patched in localStorage and
   re-rendered by the app, then the first 0-credit item expanded. (Request to the audit-states owner
   in notes/FIX-mock.md.) */
const SCRATCH = [
  '2x + 3 = 47',
  '2x = 44   ->  x = 22',
  'so  m<ABC = 3(22) - 14 = 52',
  'check: 52 + 128 = 180  (linear pair) OK',
  'but the question asks for the SUPPLEMENT of <ABC, not <ABC',
];
PICKED.push({
  id: 'mock-report-worst',
  prepare: async (page) => {
    const base0 = PICKED[0];
    await base0.prepare(page);
    await page.evaluate((work) => {
      const s = JSON.parse(localStorage.getItem('u1a.save'));
      const run = (s.runs || []).filter(r => r && r.kind === 'mock').pop();
      for (const it of (run?.items || [])) it.work = work;
      localStorage.setItem('u1a.save', JSON.stringify(s));
    }, SCRATCH.join('\n'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.report-screen', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.report-item-h')].find(x => /\b0\s*\/\s*5\b/.test(x.innerText));
      (b || document.querySelector('.report-item-h'))?.click();
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => document.querySelector('.report-item-h[aria-expanded="true"]')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
  },
});

/* What we measure, in the page. */
const PROBE = () => {
  const px = (v) => Math.round(v * 100) / 100;
  const one = (sel) => document.querySelector(sel);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const inner = r.width - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
      - parseFloat(cs.borderLeftWidth || 0) - parseFloat(cs.borderRightWidth || 0);
    return { w: Math.round(r.width * 100) / 100, inner: Math.round(inner * 100) / 100, cols: cs.gridTemplateColumns, ct: cs.containerType, cn: cs.containerName };
  };
  // one ch in .report-split's own font, so a ch floor can be reported in px
  const chOf = (el) => {
    if (!el) return null;
    const s = document.createElement('span');
    s.textContent = '0000000000';
    s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    el.appendChild(s);
    const w = s.getBoundingClientRect().width / 10;
    s.remove();
    return Math.round(w * 100) / 100;
  };
  const split = one('.report-split');
  const kids = split ? [...split.children].map(c => ({ cls: c.className, w: px(c.getBoundingClientRect().width), top: px(c.getBoundingClientRect().top) })) : [];
  const twoCol = kids.length === 2 && Math.abs(kids[0].top - kids[1].top) < 4 && kids[0].w + kids[1].w < (split ? split.getBoundingClientRect().width - 4 : 0) + 4;
  // a monospace `pre` with pre-wrap is the one child that can push a column wider than its track
  const spill = split ? [...split.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1)
    .map(e => ({ cls: e.className, sw: e.scrollWidth, cw: e.clientWidth })) : [];
  // the narrowest text column anywhere in the split, in ch
  const narrowest = kids.length ? Math.min(...kids.map(k => k.w)) : null;
  return {
    screen: box(one('.report-screen')),
    itemB: box(one('.report-item-h[aria-expanded="true"]')?.parentElement?.querySelector('.report-item-b')),
    split: box(split),
    answers: box(one('.report-answers')),
    actions: (() => {
      const a = one('.report-actions'); if (!a) return null;
      const bs = [...a.querySelectorAll('.btn')].map(b => ({ w: px(b.getBoundingClientRect().width), top: px(b.getBoundingClientRect().top) }));
      const rows = new Set(bs.map(b => Math.round(b.top))).size;
      return { n: bs.length, rows, w: px(a.getBoundingClientRect().width) };
    })(),
    kids, twoCol, narrowest, spill,
    ch: chOf(split),
    narrowestCh: split && narrowest != null ? Math.round((narrowest / chOf(split)) * 10) / 10 : null,
    docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

const rows = [];
let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL ' + msg); };

for (const engine of ENGINES) {
  const browser = await playwright[engine].launch();
  for (const theme of THEMES) {
    for (const st of PICKED) {
      for (const w of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width: w, height: w >= 1900 ? 1200 : 900 }, colorScheme: theme, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        try {
          await st.prepare(page);
          const m = await page.evaluate(PROBE);
          rows.push({ engine, theme, state: st.id, w, ...m });
          if (SHOTS) {
            await mkdir(SHOTS, { recursive: true });
            const el = await page.$('.report-item-h[aria-expanded="true"]');
            if (el) await el.evaluate(n => n.scrollIntoView({ block: 'start' }));
            await page.waitForTimeout(150);
            await page.screenshot({ path: path.join(SHOTS, `${TAG}-${st.id}-${w}-${theme}-${engine}.png`) });
          }
        } finally { await ctx.close(); }
      }
    }
  }
  await browser.close();
}

/* ------------------------------------------------------------------ report */

const f = (v) => v == null ? '—' : String(v);
console.log('');
console.log('state                  engine   theme  vp    .report-screen  .report-item-b  .report-split   tracks                       2col  narrowest');
for (const r of rows) {
  console.log(
    r.state.padEnd(22) + ' ' + r.engine.padEnd(8) + ' ' + r.theme.padEnd(6) + ' ' + String(r.w).padEnd(5) + ' ' +
    f(r.screen?.w).padEnd(15) + ' ' + f(r.itemB?.inner).padEnd(15) + ' ' + f(r.split?.w).padEnd(15) + ' ' +
    f(r.split?.cols).padEnd(28) + ' ' + (r.split ? (r.twoCol ? 'yes ' : 'NO  ') : '—   ') + '  ' +
    (r.narrowestCh != null ? r.narrowestCh + 'ch' : '—'));
}

console.log('');
/* Assertions. Three bands, none of them a restatement of the CSS:
   - NEED = two 18ch floors + the 16 px gap + the solution list's 20 px marker gutter (39.5ch). Below
     it the split MUST be one column: two columns there would squeeze a text track under its floor,
     which is the original bug.
   - DECLARED = the block's own threshold, 44ch (NEED + ~11 % headroom). At or above it the split MUST
     be two columns — this is the assertion the dead `@container report (min-width: 720px)` failed at
     every desktop width.
   - HEAD = 618 px, the split's width inside the 680 px reading column, i.e. the width the student
     actually reads at. There the tracks must still be HEAD's `273.6 / 328.4`, so the fix can never
     be scored as "green because it went one-column everywhere".
   Between NEED and DECLARED either layout is correct (that is what headroom means), so nothing is
   asserted there. Plus: a two-column split never puts a track under the 18ch floor, and nothing
   overflows. */
const NEED_CH = 18 * 2 + 16 / 10.28 + 20 / 10.28;   // 39.5ch — printed, not hard-coded in px
const DECLARED_CH = 44;
for (const r of rows) {
  if (r.state === 'mock-report') continue;
  const tag = `${r.state} ${r.engine}/${r.theme}@${r.w}`;
  if (!r.split) { fail(`${tag}: no .report-split rendered`); continue; }
  const widthCh = r.split.w / r.ch;
  if (widthCh >= DECLARED_CH && !r.twoCol) fail(`${tag}: .report-split is ${r.split.w}px (${widthCh.toFixed(1)}ch >= ${DECLARED_CH}ch) but laid out ONE column [${r.split.cols}]`);
  if (widthCh < NEED_CH && r.twoCol) fail(`${tag}: .report-split is only ${r.split.w}px (${widthCh.toFixed(1)}ch < ${NEED_CH.toFixed(1)}ch of need) but split into two columns [${r.split.cols}]`);
  if (r.twoCol && r.narrowestCh < 18) fail(`${tag}: two columns but the narrower is ${r.narrowestCh}ch < 18ch floor`);
  if (Math.abs(r.split.w - 618) < 1) {
    if (!r.twoCol) fail(`${tag}: the 618px split the student reads is ONE column — HEAD gave 273.6/328.4 [${r.split.cols}]`);
    const cols = (r.split.cols.match(/[\d.]+/g) || []).map(Number);
    if (cols.length !== 2 || Math.abs(cols[0] - 273.6) > 1 || Math.abs(cols[1] - 328.4) > 1) fail(`${tag}: the 618px split's tracks are [${r.split.cols}], HEAD gave 273.625px 328.375px`);
  }
  if (r.docOverflow) fail(`${tag}: document overflows horizontally`);
  for (const s of (r.spill || [])) fail(`${tag}: ${s.cls} spills its column (${s.sw} > ${s.cw})`);
  if (r.answers?.cols && /\b0px\b/.test(r.answers.cols)) fail(`${tag}: .report-answers has a 0px track [${r.answers.cols}]`);
  if (r.actions && r.w >= 1024 && r.actions.rows > 2) fail(`${tag}: .report-actions wrapped to ${r.actions.rows} rows at ${r.w}px`);
}

if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(rows, null, 2));
console.log(failures ? `FAILURES: ${failures}` : `ALL PASS (${rows.length} measurements)`);
await new Promise(r => server.close(r));
process.exit(failures ? 1 : 0);
