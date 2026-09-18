// qa/layout-root.mjs — LAYOUT-ROOT verifier.
// Measures the card engine and its hosts at every breakpoint in BOTH engines and asserts the
// invariants the ticket names: stem >= 18ch, no 0px grid track, no text occluded by another
// element, no document horizontal overflow, first answer control above the dock.
//
//   node qa/layout-root.mjs                          # both engines, all widths, table + PASS/FAIL
//   node qa/layout-root.mjs --engines chromium       # one engine
//   node qa/layout-root.mjs --widths 1900            # one width
//   node qa/layout-root.mjs --routes place-1,run-page
//   node qa/layout-root.mjs --shots qa/screenshots/layout-root/before --tag before
//
// Shots (with --shots) are taken for one width per breakpoint class in both themes.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const WIDTHS = (opt('widths', '320,375,390,768,834,1024,1280,1440,1900,2560')).split(',').map(Number);
const ENGINES = (opt('engines', 'chromium,webkit')).split(',');
const SHOT_DIR = opt('shots', null);
const TAG = opt('tag', 'now');
// one representative width per breakpoint class, shot in both themes
const SHOT_WIDTHS = new Set([375, 834, 1280, 1900]);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  try {
    const st = await stat(f); if (!st.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('nf ' + p); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const fx = (p) => path.resolve(__dirname, p);
/** Every host the card engine (or an equivalent paper) is mounted in. */
const ROUTES = [
  { id: 'card-ang10', must: '.card-host > .card-screen .card-parts .w', route: '#/card/ang-10', what: '#/card multi-part + figure' },
  { id: 'card-wp01', must: '.card-host > .card-screen .card-parts .w', route: '#/card/wp-01', what: '#/card word problem + optional setup' },
  { id: 'card-pairs', must: '.card-host > .card-screen .card-parts .w-pairs', route: '#/card/ang-wu-1', what: '#/card pairs (figure IS the answer)' },
  { id: 'card-strip', must: '.card-host > .card-screen .card-parts .w', route: '#/card/doc-05', what: '#/card strip' },
  { id: 'run-page', must: '.run-screen .run-stage .card-host .card-parts .w', route: '#/run/page', state: fx('screenshots/s9/after-ace.json'), what: 'run host · Today’s Page item 1' },
  { id: 'place-1', must: '.ob-run .ob-run-stage .card-host .card-parts .w', route: '#/onboard?step=3', steps: ['button:has-text("Start")'], what: 'onboarding placement (.ob-run-stage) item 1' },
  { id: 'sandbox', must: '.ob-step .ob-sandbox .card-host .card-parts .w', route: '#/onboard?step=2', what: 'onboarding step-2 sandbox — a card in a 680 px prose column at ANY viewport' },
  { id: 'boss-b4', must: '.boss-screen .boss-stage .card-host .card-parts .w', route: '#/boss/B4', steps: ['.boss-actions button:has-text("ENTER")'], what: 'boss host' },
  { id: 'mock-mid', must: '.mock-main .mock-parts .w, .mock-main .mock-parts .wd-opt', route: '#/mock', state: fx('screenshots/s9/after-page.json'), steps: ['button.mock-start', '.mock-nav-btn:has-text("Next")', '.mock-nav-btn:has-text("Next")'], what: 'mock stage mid-item' },
  // the rest of the app: no paper, but the same class of grid (a text track beside a fixed one)
  { id: 'home', must: '.home.with-rail .home-rail .skill-row', route: '#/today', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'Home hero + skills rail (.with-rail)' },
  { id: 'binder', must: '.binder .tile, .binder .bnd-row', route: '#/binder', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'Binder grid + sheet tabs' },
  { id: 'stats', must: '.stats .st-skills li, .stats .st-bars li', route: '#/stats', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'Stats bars + skill rows' },
  { id: 'summary', must: '.run-screen', route: '#/run/page', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'run screen on a cleared Page (summary / empty)' },
  { id: 'mock-rules', must: '.mock-rules .mock-sec', route: '#/mock', state: fx('screenshots/s9/after-ace.json'), paper: false, what: 'Mock rules card (.mock-sec rows)' },
  { id: 'place-sum', must: '.ob-step .ob-result-row', route: '#/onboard?step=4', state: fx('screenshots/s9/after-ace.json'), paper: false, what: 'placement summary (.ob-result-row)' },
  { id: 'night', must: '.nb-intro, .ob-run.nb-mini', route: '#/night', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'Night Before intro' },
  { id: 'settings', must: '.screen .set-kv, .screen .set-card, .screen', route: '#/settings', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'Settings' },
  { id: 'sheet', must: '.sh .sh-line', route: '#/sheet', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'printable cheat sheet (2-col at 760)' },
  { id: 'blitz', must: '.run-screen.blitz .blitz-answers, .run-screen .run-empty', route: '#/run/blitz', state: fx('screenshots/s9/after-page.json'), paper: false, what: 'BLITZ sprint (.blitz-answers)' },
  { id: 'boss-intro', must: '.boss-screen .boss-panel .boss-rules', route: '#/boss/B4', paper: false, what: 'Boss intro panel' },
];
const WANT = new Set((opt('routes', ROUTES.map(r => r.id).join(','))).split(','));

/* ---------------------------------------------------------------- the in-page probe */
const PROBE = (mustSel) => {
  const R = (e) => e.getBoundingClientRect();
  const vis = (e) => { const r = R(e); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const sel1 = (s) => document.querySelector(s);
  const name = (e) => !e ? null : (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''));

  // the paper's question text: the Card engine's .card-stem, the Mock's .mock-stem
  const stem = sel1('.card-stem') || sel1('.mock-stem');
  let stemW = null, ch = null, stemCh = null, stemText = null;
  if (stem) {
    stemW = R(stem).width;
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:10ch;height:1px;';
    stem.appendChild(probe);
    ch = probe.offsetWidth / 10 || null;
    probe.remove();
    stemCh = ch ? stemW / ch : null;
    stemText = (stem.textContent || '').trim().slice(0, 40);
  }

  // 0px tracks on every grid that carries text
  const GRIDS = ['.card-screen', '.card-paper', '.card-parts', '.mock-main', '.with-rail', '.sum-stats', '.sum-bar', '.report-split', '.st-skills li', '.st-bars li', '.w-fields', '.w-pairs-cols', '.mock-sec', '.ob-result-row', '.sh-fixed', '.weak-row', '.skill-row', '.home-today', '.blitz-answers', '.report-answers', '.binder'];
  const zeroTracks = [];
  const tracks = {};
  for (const s of GRIDS) {
    for (const el of document.querySelectorAll(s)) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display !== 'grid' && cs.display !== 'inline-grid') continue;
      const cols = cs.gridTemplateColumns;
      if (tracks[s] === undefined) tracks[s] = cols;
      // a track that rounds to 0 cannot hold text
      if (/(^|\s)0(\.\d+)?px(\s|$)/.test(cols)) zeroTracks.push({ sel: s, cols });
    }
  }

  // occlusion: is each text row actually the thing painted at its own pixels?
  // Sticky app chrome (#dock, .hdr, #banner) and overlays legitimately cover page content while you
  // scroll — that is "below the fold", not "hidden". An SVG hit-path that paints nothing (fill/stroke
  // none or fully transparent — the figure's ≥44 px wedge hit bands) hides no text either.
  // Sticky app/screen chrome covering content you have scrolled past is "below the fold", not
  // "hidden" — the stickyClash check below is what catches chrome that hides PINNED content.
  const CHROME = '#dock, .hdr, #banner, .sw-pill, .t11-toasts, .levelup, [role="dialog"], .mock-map, .mock-sheet-backdrop, .ob-run-head, .boss-head, .mock-bar';
  const paints = (e) => {
    const cs = getComputedStyle(e);
    if (e.namespaceURI === 'http://www.w3.org/2000/svg') {
      const on = (v) => v && v !== 'none' && !/rgba\([^)]*,\s*0\)/.test(v);
      return on(cs.fill) || on(cs.stroke);
    }
    const bg = cs.backgroundColor || '';
    const opaqueBg = bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0(\.0+)?\)/.test(bg);
    return opaqueBg || !!(e.textContent || '').trim();
  };
  const TEXTY = ['.run-title', '.run-sub', '.run-progress-n', '.ob-run-title', '.ob-run-count', '.ob-run-label',
    '.card-skills', '.card-no', '.card-stem', '.card-instruction', '.card-side-h', '.card-part-h',
    '.boss-name', '.mock-stem', '.mock-item-label', '.sum-bar-name', '.card-scratch-toggle'];
  const occluded = [];
  for (const s of TEXTY) {
    for (const el of document.querySelectorAll(s)) {
      if (!vis(el) || !(el.textContent || '').trim()) continue;
      const r = R(el);
      if (r.bottom < 0 || r.top > innerHeight) continue;          // off-screen vertically: scroll, not overlap
      const pts = [[r.left + Math.min(8, r.width / 2), r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2]];
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        if (hit === el || el.contains(hit) || hit.contains(el)) continue;
        if (hit.closest(CHROME)) continue;
        if (!paints(hit)) continue;
        occluded.push({ sel: s, by: name(hit), at: [Math.round(x), Math.round(y)] });
        break;
      }
    }
  }

  // two in-flow siblings of a layout grid must never share pixels. This is the student's complaint
  // ("the run header, card chips and Scratch heading overlapping each other") stated as an invariant.
  // Sticky/absolute/fixed children are excluded: a sticky head covering following content is by design.
  const siblingOverlap = [];
  for (const s of ['.card-screen', '.card-paper', '.card-parts', '.run-screen', '.ob-run', '.mock-main', '.mock-body', '.with-rail', '.boss-screen']) {
    for (const box of document.querySelectorAll(s)) {
      const kids = [...box.children].filter(e => vis(e) && getComputedStyle(e).position === 'static' && (e.textContent || '').trim());
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = R(kids[i]), b = R(kids[j]);
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) siblingOverlap.push({ in: s, a: name(kids[i]).slice(0, 34), b: name(kids[j]).slice(0, 34), by: [Math.round(ox), Math.round(oy)] });
      }
    }
  }

  // Two `position: sticky` elements that share pixels: the lower one is PERMANENTLY hidden for the
  // whole scroll, which is what "the run header and the Scratch heading overlapping" actually was.
  const sticky = [];
  for (const e of document.querySelectorAll('*')) {
    if (getComputedStyle(e).position !== 'sticky' || !vis(e)) continue;
    sticky.push(e);
  }
  const stickyClash = [];
  for (let i = 0; i < sticky.length; i++) for (let j = i + 1; j < sticky.length; j++) {
    const a = R(sticky[i]), b = R(sticky[j]);
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 2 && oy > 2) stickyClash.push({ a: name(sticky[i]).slice(0, 34), b: name(sticky[j]).slice(0, 34), by: [Math.round(ox), Math.round(oy)] });
  }

  // the first answer control must be reachable without scrolling past the dock
  const dock = document.querySelector('#dock:not([hidden])');
  const dockTop = dock && vis(dock) ? R(dock).top : innerHeight;
  const ctrlSel = '.card-parts button:not([hidden]):not([disabled]), .card-parts input, .card-parts textarea, .card-parts [role="button"], .card-parts .fig-wedge, .mock-parts button, .mock-parts input';
  let firstCtrl = null;
  for (const el of document.querySelectorAll(ctrlSel)) { if (vis(el)) { firstCtrl = el; break; } }
  const ctrl = firstCtrl ? { sel: name(firstCtrl).slice(0, 48), top: Math.round(R(firstCtrl).top), bottom: Math.round(R(firstCtrl).bottom), aboveDock: R(firstCtrl).bottom <= dockTop + 1 } : null;

  const cs = (s) => { const e = sel1(s); return e ? { w: Math.round(R(e).width), cols: getComputedStyle(e).gridTemplateColumns, maxW: getComputedStyle(e).maxWidth, ct: getComputedStyle(e).containerType } : null; };
  // The card may only spend 320 px on a rail when its OWN box is wide enough for one. A card that
  // shows the rail at 680 px has a 336 px paper — narrower than a 375 px phone — which is the exact
  // configuration that collapsed the stem to 0 px on any card with a figure.
  const card = sel1('.card-screen');
  let railTooEarly = null;
  if (card) {
    const tracks = getComputedStyle(card).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    const w = R(card).width;
    if (tracks.length > 1 && w < 900) railTooEarly = { w: Math.round(w), cols: tracks.join(' ') };
  }
  const paper = sel1('.card-paper');
  const paperTooNarrow = paper && card && R(paper).width < Math.min(320, R(card).width)
    ? { paper: Math.round(R(paper).width), card: Math.round(R(card).width) } : null;

  return {
    stemW: stemW == null ? null : Math.round(stemW),
    stemCh: stemCh == null ? null : Math.round(stemCh * 10) / 10,
    stemText,
    cardScreen: cs('.card-screen'), cardPaper: cs('.card-paper'), cardStage: cs('.card-stage'),
    host: (() => { const e = sel1('.card-screen'); const p = e?.parentElement; return p ? { sel: name(p).slice(0, 60), w: Math.round(R(p).width), ct: getComputedStyle(p).containerType } : null; })(),
    screenMaxW: (() => { const e = sel1('.screen'); return e ? { sel: name(e).slice(0, 48), w: Math.round(R(e).width), maxW: getComputedStyle(e).maxWidth } : null; })(),
    zeroTracks, tracks, occluded, siblingOverlap, stickyClash, railTooEarly, paperTooNarrow, ctrl,
    mustCount: mustSel ? document.querySelectorAll(mustSel).length : null,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1
      ? { scrollW: document.documentElement.scrollWidth, innerW: innerWidth } : null,
  };
};

/* ---------------------------------------------------------------- driver */
async function prep(page, spec) {
  // 'load', never 'networkidle': the service worker keeps webkit's network busy forever.
  if (spec.state) {
    await page.goto(BASE + 'version.js', { waitUntil: 'load', timeout: 20000 });
    await page.evaluate(j => localStorage.setItem('u1a.save', j), await readFile(spec.state, 'utf8'));
  }
  // A cache-busting query before the hash forces a CROSS-document navigation. Without it a
  // goto that only changes the hash fires no load event in webkit and page.goto hangs.
  await page.goto(`${BASE}?nav=${++prep.n}${spec.route}`, { waitUntil: 'load', timeout: 25000 });
  await page.waitForTimeout(1500);
  for (const s of spec.steps ?? []) {
    const b = await page.$(s);
    if (b) { await b.click().catch(() => {}); await page.waitForTimeout(1100); }
  }
  // the card engine loads its widget module async
  await page.waitForTimeout(500);
}

prep.n = 0;

const rows = [];
const fails = [];
if (SHOT_DIR) await mkdir(SHOT_DIR, { recursive: true });

for (const engName of ENGINES) {
  const browser = await (engName === 'webkit' ? webkit : chromium).launch();
  for (const W of WIDTHS) {
    const themes = SHOT_DIR && SHOT_WIDTHS.has(W) ? ['light', 'dark'] : ['light'];
    for (const theme of themes) {
      // serviceWorkers: 'block' — once the SW takes control webkit's page.goto never resolves.
      const ctx = await browser.newContext({ viewport: { width: W, height: W >= 1024 ? 1200 : 812 }, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1, serviceWorkers: 'block' });
      const errs = [];
      for (const spec of ROUTES) {
        if (!WANT.has(spec.id)) continue;
        // a fresh page per route: no leaked timers, no SW client, no stale save
        const page = await ctx.newPage();
        page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
        let m;
        try {
          await prep(page, spec);
          m = await page.evaluate(PROBE, spec.must ?? null);
          // sticky chrome only overlaps content once you scroll: probe again, half a screen down
          await page.evaluate(() => scrollBy(0, Math.round(innerHeight * 0.6)));
          await page.waitForTimeout(250);
          const s2 = await page.evaluate(PROBE, null);
          m.scrolledOccluded = s2.occluded; m.scrolledOverlap = s2.siblingOverlap; m.scrolledZero = s2.zeroTracks; m.scrolledSticky = s2.stickyClash;
          await page.evaluate(() => scrollTo(0, 0));
        }
        catch (e) { m = { error: String(e.message).slice(0, 140) }; }
        const bad = [];
        if (m.error) bad.push('probe:' + m.error);
        else {
          if (spec.paper === false) { /* no question paper on this screen */ }
          else if (m.stemCh == null) bad.push('no stem');
          else if (m.stemCh < 18) bad.push(`stem ${m.stemCh}ch < 18ch`);
          if (m.zeroTracks.length) bad.push(`0px track: ${m.zeroTracks.map(z => z.sel + ' [' + z.cols + ']').join(' ; ')}`);
          if (m.occluded.length) bad.push(`occluded: ${m.occluded.map(o => o.sel + ' by ' + o.by).join(' ; ')}`);
          if (m.siblingOverlap.length) bad.push(`overlap: ${m.siblingOverlap.map(o => `${o.a} × ${o.b} in ${o.in} by ${o.by}`).join(' ; ')}`);
          if (m.scrolledOverlap?.length) bad.push(`overlap (scrolled): ${m.scrolledOverlap.map(o => `${o.a} × ${o.b} in ${o.in}`).join(' ; ')}`);
          if (m.scrolledOccluded?.length) bad.push(`occluded (scrolled): ${m.scrolledOccluded.map(o => o.sel + ' by ' + o.by).join(' ; ')}`);
          if (m.scrolledZero?.length) bad.push(`0px track (scrolled): ${m.scrolledZero.map(z => z.sel).join(' ; ')}`);
          if (m.scrolledSticky?.length) bad.push(`sticky bands collide (scrolled): ${m.scrolledSticky.map(o => `${o.a} × ${o.b} by ${o.by}`).join(' ; ')}`);
          if (m.railTooEarly) bad.push(`rail at ${m.railTooEarly.w}px card (needs 960): ${m.railTooEarly.cols}`);
          if (m.paperTooNarrow) bad.push(`paper ${m.paperTooNarrow.paper}px inside a ${m.paperTooNarrow.card}px card`);
          if (spec.must && !m.mustCount) bad.push(`the screen never rendered: no ${spec.must}`);
          if (m.overflowX) bad.push(`overflow-x ${m.overflowX.scrollW}>${m.overflowX.innerW}`);
          if (m.ctrl && !m.ctrl.aboveDock) bad.push(`first control below dock (bottom ${m.ctrl.bottom})`);
          if (!m.ctrl && spec.paper !== false) bad.push('no answer control');
        }
        rows.push({ eng: engName, w: W, theme, id: spec.id, stemW: m.stemW, stemCh: m.stemCh, cardW: m.cardScreen?.w, paperW: m.cardPaper?.w, cardCols: m.cardScreen?.cols, paperCols: m.cardPaper?.cols, hostW: m.host?.w, screen: m.screenMaxW && `${m.screenMaxW.w}/${m.screenMaxW.maxW}`, bad });
        if (bad.length) fails.push({ eng: engName, w: W, theme, id: spec.id, bad });
        if (SHOT_DIR && SHOT_WIDTHS.has(W)) {
          await page.screenshot({ path: path.join(SHOT_DIR, `${TAG}-${engName}-${W}-${theme}-${spec.id}.png`) });
        }
        await page.close();
      }
      if (errs.length) fails.push({ eng: engName, w: W, theme, id: 'pageerror', bad: errs });
      await ctx.close();
    }
  }
  await browser.close();
}

/* ---------------------------------------------------------------- report */
const pad = (s, n) => String(s ?? '—').padEnd(n).slice(0, n);
const lpad = (s, n) => String(s ?? '—').padStart(n).slice(0, n);
console.log(`\n${pad('eng', 9)}${lpad('w', 5)} ${pad('route', 11)}${lpad('stem', 6)}${lpad('ch', 7)}${lpad('card', 6)}${lpad('paper', 6)}  ${pad('card cols', 30)}${pad('paper cols', 26)} ok`);
console.log('-'.repeat(124));
for (const r of rows) {
  console.log(`${pad(r.eng, 9)}${lpad(r.w, 5)} ${pad(r.id, 11)}${lpad(r.stemW, 6)}${lpad(r.stemCh, 7)}${lpad(r.cardW, 6)}${lpad(r.paperW, 6)}  ${pad(r.cardCols, 30)}${pad(r.paperCols, 26)} ${r.bad.length ? 'FAIL' : 'ok'}`);
}
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log(` ${f.eng} ${f.w} ${f.theme} ${f.id}: ${f.bad.join(' | ')}`);
} else {
  console.log('\nALL PASS');
}
await new Promise(r => server.close(r));
process.exit(fails.length ? 1 : 0);
