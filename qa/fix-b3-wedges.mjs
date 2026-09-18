// qa/fix-b3-wedges.mjs — ticket fix:B3. Measures every figure wedge hit path in the real DOM, in the
// real hosts: the rendered <svg.fig> box, and each .fig-wedge-hit getBoundingClientRect(), in both
// engines, through qa/audit-states.mjs so a card is measured inside #/card AND inside a run, a mock,
// onboarding and the night screen. Dev tool; never part of site/.
//
//   node qa/fix-b3-wedges.mjs                                  # the figure states, 5 widths, both engines
//   node qa/fix-b3-wedges.mjs --only card-classify --engine chromium --vp 375x667
//
// Prints every hit box under 44x44 plus, per state/viewport, the narrowest figure the app ever renders
// (that width is what the viewBox hit geometry has to clear 44 px at).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { states } from './audit-states.mjs';

const require = createRequire(import.meta.url);
const playwright = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const ONLY = (opt('only', 'card-classify,card-multipart,card-notation,card-pairs,card-rootcase-roots,card-rootcase-reject,card-rootcase-cases,card-strip,mock-mid,mock-mid-map,run-page-item-1,run-upgrade,variant-fig-pairs,onboard-place,night-mini,boss-item')).split(',').filter(Boolean);
const VPS = (opt('vp', '320x568,375x667,834x1112,1440x900,1900x1200')).split(',').map(s => s.split('x').map(Number));
const ENGINES = opt('engine', 'both') === 'both' ? ['chromium', 'webkit'] : [opt('engine', 'chromium')];

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
const PICK = ALL.filter(s => ONLY.some(p => s.id === p || s.id.startsWith(p)));
if (!PICK.length) { console.error('no states matched'); process.exit(2); }

// NOTE (fix:B3): the figure's ELEMENT box is not its drawing width. `.card-figure .fig` carries a
// max-height, and an <svg> with the default preserveAspectRatio letterboxes its viewBox inside the
// element — so a 293 x 150 element draws the 400 x 260 viewBox at 230.8 px wide, centred. The number
// the viewBox geometry is scaled by is min(width, height * 400/260), and that is what HIT_REF_W has
// to be measured against.
const MEASURE = () => {
  const out = [];
  for (const svg of document.querySelectorAll('svg.fig')) {
    const sr = svg.getBoundingClientRect();
    if (sr.width <= 0) continue;
    const drawn = Math.min(sr.width, (sr.height * 400) / 260);
    const wedges = [];
    for (const hit of svg.querySelectorAll('.fig-wedge-hit')) {
      const r = hit.getBoundingClientRect();
      const g = hit.closest('.fig-wedge');
      wedges.push({ name: g?.dataset.name || '?', level: +(g?.dataset.level ?? 0), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
    }
    out.push({ fig: +drawn.toFixed(1), box: +sr.width.toFixed(1), figId: svg.dataset.figure || '?', wedges });
  }
  return out;
};

let bad = 0, total = 0, minFig = Infinity, minFigWhere = '';
const rows = [];
for (const engine of ENGINES) {
  const browser = await playwright[engine].launch();
  for (const [W, H] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    for (const st of PICK) {
      try { await st.prepare(page); } catch (e) { console.log(`  !! ${engine} ${W}x${H} ${st.id}: ${e.message}`); continue; }
      const figs = await page.evaluate(MEASURE);
      if (!figs.length) { rows.push({ engine, vp: `${W}x${H}`, id: st.id, fig: null, min: null, n: 0, small: 0 }); continue; }
      for (const f of figs) {
        if (!f.wedges.length) continue;
        const small = f.wedges.filter(x => x.w < 43.5 || x.h < 43.5);
        total += f.wedges.length; bad += small.length;
        if (f.fig < minFig) { minFig = f.fig; minFigWhere = `${engine} ${W}x${H} ${st.id} (${f.figId})`; }
        const min = Math.min(...f.wedges.map(x => Math.min(x.w, x.h)));
        rows.push({ engine, vp: `${W}x${H}`, id: st.id, figId: f.figId, fig: f.fig, min, n: f.wedges.length, small: small.length });
        for (const s of small) console.log(`  SMALL ${engine} ${String(W).padStart(4)}x${String(H).padEnd(4)} ${st.id.padEnd(22)} ${String(f.figId).padEnd(4)} fig ${String(f.fig).padStart(6)}px  ${s.name.padEnd(6)} lvl${s.level}  ${s.w}x${s.h}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
}
console.log('\nstate summary (min hit dimension over every wedge):');
for (const r of rows) console.log(`  ${r.engine.padEnd(8)} ${r.vp.padEnd(9)} ${r.id.padEnd(22)} ${String(r.figId ?? '-').padEnd(4)} fig ${String(r.fig ?? '-').padStart(6)}  wedges ${String(r.n).padStart(2)}  min ${r.min == null ? '   -  ' : r.min.toFixed(1).padStart(6)}  small ${r.small}`);
const REF = 230;   // svg.js HIT_REF_W — the hit geometry is solved to clear 44 px at this drawing width
console.log(`\nnarrowest DRAWN figure: ${minFig}px — ${minFigWhere}   (svg.js HIT_REF_W = ${REF})`);
console.log(`${bad} of ${total} wedge hit boxes under 44x44`);
if (minFig < REF) console.log(`!! a host draws a figure at ${minFig}px, under HIT_REF_W ${REF}: re-measure and lower HIT_REF_W in site/js/figure/svg.js`);
await new Promise(r => server.close(r));
process.exit(bad || minFig < REF ? 1 : 0);
