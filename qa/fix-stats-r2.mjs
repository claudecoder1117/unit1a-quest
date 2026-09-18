// qa/fix-stats-r2.mjs — measurements for ticket `fix:stats r2` (Stats screen, round 2).
// Dev tool; never part of site/.
//
//   node qa/fix-stats-r2.mjs [--engine chromium|webkit|both] [--widths 375,834,1024,1440,1900,2560]
//                            [--theme light|dark|both] [--shots dir --tag t]
//
// Two findings, two measurements:
//
//   V1 tap targets — every `.st-jump .chip` (the six section chips) and `.st-skill-drill`, measured as a
//   REAL hit box: `elementFromPoint` stepping out from the element's own edges, so a hit area promised by
//   an absolutely-positioned ::before that `overflow: hidden` clips away is reported at its true size.
//   qa/layout-audit.mjs reaches the same verdict from the other direction (it reads the computed insets
//   and intersects them with the clip box that applies); measuring it by hit-test is the independent
//   check — when this ticket started the detector was not yet clip-aware and scored the r1 chips 44x44.
//
//   V3 dead container thresholds — for every `@container <name> (min-width: N)` in site/css, the widest
//   width the named container actually reaches anywhere in the app. A threshold above that maximum is a
//   rule that can never match: dead CSS, and a layout nobody ever sees.
//
// Exits non-zero when any hit box is under 44x44, any threshold is unreachable, any Stats grid track
// resolves to 0 px, or the document scrolls horizontally.

import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ENGINES = (() => { const e = opt('engine', 'both'); return e === 'both' ? ['chromium', 'webkit'] : [e]; })();
const THEMES = (() => { const t = opt('theme', 'both'); return t === 'both' ? ['light', 'dark'] : [t]; })();
const WIDTHS = (opt('widths', '375,834,1024,1440,1900,2560')).split(',').map(Number);
const SHOTS = opt('shots', null);
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const FIXTURE = await readFile(path.join(__dirname, 'fixtures', 'midweek.json'), 'utf8');

/* ---------------------------------------------------------------- the browser-side probes */

// A real hit box: walk out from the visual box in 1 px steps and keep the rows/columns where
// elementFromPoint still lands on the element (or on a descendant of it). Clipped pseudo-elements do
// not respond to hit-testing, so this measures what a finger actually finds.
const probeHits = (sel) => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.top < 0 || r.bottom > innerHeight) continue;           // must be on screen to hit-test
    const owns = (n) => n && (n === el || el.contains(n));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!owns(document.elementFromPoint(cx, cy))) { out.push({ label: (el.textContent || '').trim().slice(0, 24), w: 0, h: 0, note: 'centre not hittable' }); continue; }
    // Step OUTWARD FROM THE TRUE EDGE (not from the centre ± half the height): a 36.5 px box centred on
    // a half pixel would otherwise lose a step at each edge and under-report a real 44 px hit box by 2 px.
    const grow = (dx, dy) => {
      const edge = dx < 0 ? r.left : dx > 0 ? r.right : dy < 0 ? r.top : r.bottom;
      let n = 0;
      for (let i = 1; i <= 24; i++) {
        const off = (dx < 0 || dy < 0) ? edge - i + 0.5 : edge + i - 0.5;
        const pt = dx ? [off, cy] : [cx, off];
        if (owns(document.elementFromPoint(pt[0], pt[1]))) n = i; else break;
      }
      return n;
    };
    const up = grow(0, -1), down = grow(0, 1), left = grow(-1, 0), right = grow(1, 0);
    out.push({
      label: (el.textContent || '').trim().slice(0, 24),
      box: [+r.width.toFixed(1), +r.height.toFixed(1)],
      w: +(r.width + left + right).toFixed(1), h: +(r.height + up + down).toFixed(1),
      pad: [up, right, down, left],
    });
  }
  return out;
};

// Every named container's widest realised width, and the tracks of the Stats rows.
const probeStats = () => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const containers = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.containerType === 'normal' || !cs.containerType) continue;
    containers.push({ name: cs.containerName || '(unnamed)', sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''), w: +el.getBoundingClientRect().width.toFixed(1) });
  }
  const tracks = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).gridTemplateColumns : null; };
  const zero = [];
  for (const sel of ['.st-bars li', '.st-skills li', '.st-block', '.stats']) {
    for (const el of document.querySelectorAll(sel)) {
      const t = getComputedStyle(el).gridTemplateColumns;
      if (!t || t === 'none') continue;
      const ns = t.split(' ').map(parseFloat);
      if (ns.some((n) => isFinite(n) && n === 0) && (el.textContent || '').trim()) { zero.push({ sel, t }); break; }
    }
  }
  // stem-style floor check: the narrowest rendered skill name box, in its own ch
  const probe = document.createElement('span');
  const nameEl = document.querySelector('.st-skill-name');
  let ch = null, nameW = null;
  if (nameEl) {
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    probe.textContent = '0000000000';
    nameEl.appendChild(probe);
    ch = probe.getBoundingClientRect().width / 10;
    probe.remove();
    nameW = Math.min(...[...document.querySelectorAll('.st-skill-name')].map((n) => n.getBoundingClientRect().width));
  }
  // In-flow siblings of a Stats row must never share pixels. The audit matrix has no viewport between
  // 430 and 768 px, so the 640-679 px container window this ticket's threshold opens (viewport 672-711)
  // is only ever measured here — it needs its own overlap check, not just the track numbers.
  const overlap = [];
  let pairs = 0;                    // so a "no overlap" pass cannot mean "nothing was compared"
  for (const row of document.querySelectorAll('.st-skills li, .st-bars li, .st-errors li, .st-jump')) {
    const kids = [...row.children].filter((k) => {
      const s = getComputedStyle(k);
      if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'absolute' || s.position === 'fixed') return false;
      const r = k.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      pairs++;
      if (w > 1 && h > 1) overlap.push({ row: row.className || row.tagName, a: kids[i].className, b: kids[j].className, by: `${Math.round(w)}x${Math.round(h)}` });
    }
  }
  return {
    stats: box('.screen.stats'), view: box('#view'),
    containers, zero, overlap, pairs,
    barTracks: tracks('.st-bars li'), skillTracks: tracks('.st-skills li'),
    skillNameCh: ch && nameW ? +(nameW / ch).toFixed(1) : null,
    // Clipped INK, measured with a Range over the element's own text: `scrollWidth` also counts an
    // absolutely-positioned ::before that sticks out of the box, which is not a clipped word.
    clipped: [...document.querySelectorAll('.st-skill-name, .st-skill-meta, .st-bar-label, .st-jump .chip')]
      .map((el) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        if (!t) return null;
        const rng = document.createRange(); rng.selectNodeContents(t);
        const ink = rng.getBoundingClientRect(), box = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
        const room = box.width - padL - padR;
        return ink.width > room + 1
          ? { sel: el.className, text: t.textContent.trim().slice(0, 30), ink: +ink.width.toFixed(1), room: +room.toFixed(1) }
          : null;
      })
      .filter(Boolean),
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
  };
};

/* ---------------------------------------------------------------- the CSS-side probe: thresholds */

const cssFiles = ['theme', 'base', 'components', 'figure', 'motion', 'widgets', 'screens', 'polish'];
const thresholds = [];
for (const f of cssFiles) {
  let src; try { src = await readFile(path.join(SITE, 'css', f + '.css'), 'utf8'); } catch { continue; }
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    const m = /@container\s+([a-zA-Z_-][\w-]*)\s*\(\s*min-width:\s*([\d.]+)px/.exec(ln);
    if (m) thresholds.push({ file: `css/${f}.css`, line: i + 1, name: m[1], px: +m[2] });
  });
}

/* ---------------------------------------------------------------- the run */

const maxSeen = new Map();          // container name -> widest width measured anywhere
const rows = [];
const fails = [];

for (const engine of ENGINES) {
  const browser = await playwright[engine].launch();
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: Math.max(700, Math.round(w * 0.63)) }, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/version.js`, { waitUntil: 'load' });
      await page.evaluate((j) => localStorage.setItem('u1a.save', j), FIXTURE);
      await page.goto(`http://127.0.0.1:${PORT}/#/stats`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.stats', { timeout: 15000 });
      await page.waitForTimeout(350);

      const m = await page.evaluate(probeStats);
      const chips = await page.evaluate(probeHits, '.st-jump .chip');
      const drills = await page.evaluate(probeHits, '.st-skill-drill');

      for (const c of m.containers) maxSeen.set(c.name, Math.max(maxSeen.get(c.name) || 0, c.w));

      const bad = [...chips, ...drills].filter((c) => c.w < 43.5 || c.h < 43.5);
      for (const c of bad) fails.push(`${engine}/${theme}/${w}: hit box ${c.w}x${c.h} < 44x44 — "${c.label}" (visual ${c.box ? c.box.join('x') : '?'}${c.note ? ', ' + c.note : ''})`);
      for (const z of m.zero) fails.push(`${engine}/${theme}/${w}: 0px grid track on ${z.sel} [${z.t}]`);
      for (const o of m.overlap) fails.push(`${engine}/${theme}/${w}: siblings share pixels in ${o.row}: .${o.a} x .${o.b} by ${o.by}`);
      for (const c of m.clipped) fails.push(`${engine}/${theme}/${w}: text clipped in ${c.sel} — "${c.text}" (ink ${c.ink} > room ${c.room})`);
      if (m.overflowX) fails.push(`${engine}/${theme}/${w}: document scrolls horizontally`);
      if (!m.pairs) fails.push(`${engine}/${theme}/${w}: the overlap check compared 0 sibling pairs (it would pass vacuously)`);

      rows.push({
        engine, theme, vw: w,
        stats: m.stats?.w ?? null,
        bars: m.barTracks, skills: m.skillTracks, nameCh: m.skillNameCh,
        chipMin: chips.length ? Math.min(...chips.map((c) => c.h)) : null,
        chipVisual: chips.length ? chips[0].box?.[1] ?? null : null,
        drillMin: drills.length ? Math.min(...drills.map((c) => c.h)) : null,
        pairs: m.pairs,
      });

      if (SHOTS && [375, 834, 1440, 1900].includes(w)) {
        await mkdir(SHOTS, { recursive: true });
        if (engine === 'chromium') await page.screenshot({ path: path.join(SHOTS, `${TAG}-${w}-${theme}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
}

/* thresholds vs the widest realised container width (the V3 check) */
// Widths only measured on #/stats here, so judge only the containers this run actually saw.
const tCheck = [];
for (const t of thresholds) {
  const seen = maxSeen.get(t.name);
  if (seen === undefined) { tCheck.push({ ...t, seen: null, verdict: 'not on this route' }); continue; }
  const ok = t.px <= seen + 0.5;
  tCheck.push({ ...t, seen, verdict: ok ? 'reachable' : 'DEAD' });
  if (!ok) fails.push(`dead container threshold: @container ${t.name} (min-width: ${t.px}px) at ${t.file}:${t.line} — the container never exceeds ${seen}px`);
}

console.log('\n== Stats measurements ==');
console.log(['engine', 'theme', 'vw', '.screen.stats', 'chip visual h', 'chip HIT h', 'drill HIT h', 'name ch', 'sibling pairs'].join(' | '));
for (const r of rows) console.log([r.engine, r.theme, r.vw, r.stats, r.chipVisual, r.chipMin, r.drillMin, r.nameCh, r.pairs].join(' | '));
console.log('\n== Stats row tracks (chromium/light) ==');
for (const r of rows.filter((r) => r.engine === 'chromium' && r.theme === 'light')) console.log(`${r.vw}: .st-bars li [${r.bars}]  .st-skills li [${r.skills}]`);
console.log('\n== @container thresholds vs widest realised container width (on #/stats) ==');
for (const t of tCheck) console.log(`${t.file}:${t.line}  @container ${t.name} (min-width: ${t.px}px)  container max ${t.seen ?? '—'}  → ${t.verdict}`);

console.log(fails.length ? `\nFAIL — ${fails.length} problem(s):\n` + [...new Set(fails)].map((f) => '  ' + f).join('\n') : '\nALL PASS');
server.close();
process.exit(fails.length ? 1 : 0);
