// qa/fix-boss-miss.mjs — ticket fix:boss-miss-dock. Dev tool; never part of site/.
//
// THE REAL HIT BOX OF THE BOSS'S MISS STRIP IN THE DOCK, measured the hard way: drive a real Boss B4
// run to a real miss, then hit-test the strip's link with `document.elementFromPoint` stepping out from
// the element's own edges, one pixel at a time. No computed style is trusted — reading CSS is exactly
// how the defect survived two audit rounds ("but it says inset: -14px").
//
//   node qa/fix-boss-miss.mjs [--engine chromium|webkit|both] [--shots DIR --tag before|after]
//
// It walks both shapes of the strip — heart lost ("Drill 5") and the empty equation setup ("Skip the
// setup") — at the viewports where "mock r2" collapses it to one row: the on-screen keyboard open
// (`:root[data-kb="open"]`) and any viewport under 520 px tall (`@media (max-height: 520px)`, which is
// the landscape phone AND a short desktop window), plus one tall phone as the un-collapsed control.
// Prints a row per combination and exits non-zero if any hit box is under the S5 44x44 floor.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QA = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(QA, '..');
const SITE = path.join(REPO, 'site');
const require = createRequire(import.meta.url);        // playwright is installed under qa/
const pw = require('playwright');
const { states } = await import(path.join(QA, 'audit-states.mjs'));

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ENGINES = (opt('engine', 'both') === 'both' ? ['chromium', 'webkit'] : [opt('engine', 'both')]);
const SHOTS = opt('shots', null), TAG = opt('tag', 'run');
const FLOOR = 43.5;    // the same 0.5 px tolerance qa/layout-audit.mjs uses: 44 px measures 43.99 often

/* ------------------------------------------------------------------ the server (site/ as-is) */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  try {
    const st = await stat(f);
    if (!st.isFile()) throw 0;
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const H = {
  base,
  gotoRoute: (p, hash) => p.goto(base + hash, { waitUntil: 'networkidle' }),
  setSave: (p, j) => p.evaluate((x) => localStorage.setItem('u1a.save', x), j),
  waitReady: (p) => p.waitForTimeout(450),
  readFixture: (n) => readFile(path.join(QA, 'fixtures', n), 'utf8'),
};
const CATALOG = states(H);

/* ------------------------------------------------------------------ the in-page probe */

const probe = () => {
  const SEL = '#dock .boss-miss .btn';
  /** The hit box a thumb really has: walk out from each edge while elementFromPoint still answers us. */
  const hit = (el) => {
    const b = el.getBoundingClientRect();
    const owns = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t) || (t.closest && t.closest(SEL) === el)); };
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    let top = b.y, bot = b.y + b.height, left = b.x, right = b.x + b.width;
    for (let i = 1; i <= 40; i++) { if (owns(cx, b.y - i)) top = b.y - i; else break; }
    for (let i = 1; i <= 40; i++) { if (owns(cx, b.y + b.height + i)) bot = b.y + b.height + i; else break; }
    for (let i = 1; i <= 40; i++) { if (owns(b.x - i, cy)) left = b.x - i; else break; }
    for (let i = 1; i <= 40; i++) { if (owns(b.x + b.width + i, cy)) right = b.x + b.width + i; else break; }
    return { box: [+b.width.toFixed(1), +b.height.toFixed(1)], hit: [+(right - left).toFixed(1), +(bot - top).toFixed(1)] };
  };
  const strip = document.querySelector('#dock .boss-miss');
  const dock = document.querySelector('#dock');
  const hdr = document.querySelector('.hdr, header.hdr');
  const ink = (el) => {   // how much of the control's own box the strip's clip cuts off
    const sb = strip.getBoundingClientRect(), b = el.getBoundingClientRect();
    return [+Math.max(0, sb.top - b.top).toFixed(1), +Math.max(0, b.bottom - sb.bottom).toFixed(1)];
  };
  return {
    kb: document.documentElement.dataset.kb || null,
    strip: strip ? { h: +strip.getBoundingClientRect().height.toFixed(1), maxH: getComputedStyle(strip).maxHeight, of: getComputedStyle(strip).overflow } : null,
    dockH: dock ? +dock.getBoundingClientRect().height.toFixed(1) : null,
    // the room the collapsed strip exists to protect: app header bottom → dock top
    room: dock && hdr ? +(dock.getBoundingClientRect().top - hdr.getBoundingClientRect().bottom).toFixed(1) : null,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    btns: [...document.querySelectorAll(SEL)].map((el) => ({
      label: (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 34),
      ...hit(el), clipped: ink(el),
      pseudo: getComputedStyle(el, '::before').content === 'none' ? 'none'
        : [getComputedStyle(el, '::before').top, getComputedStyle(el, '::before').left].join(' '),
    })),
  };
};

/* ------------------------------------------------------------------ driving */

/** Boss B4 at its FIRST miss, card still mounted, so boss.js has re-homed the strip into the dock. */
async function toMiss(page, setup) {
  const st = CATALOG.find((s) => s.id === (setup ? 'boss-b4-miss-setup-kb' : 'boss-b4-miss-dock'));
  if (!st) throw new Error('audit-states.mjs no longer carries the dock miss states');
  await st.prepare(page);
  return page.evaluate(() => { const e = document.querySelector('#dock .boss-miss'); return !!e && !e.hasAttribute('hidden') && !!e.getClientRects().length; });
}

// [width, height, keyboard-open] — the two collapsed triggers, plus the un-collapsed control.
// NB the catalog's `-kb` state pins data-kb at phone widths on its own, so every row prints the kb the
// page was MEASURED in, not the one asked for; the un-collapsed control is a tablet for that reason.
const VPS = [
  [375, 667, true],    // phone, keyboard up: the :root[data-kb="open"] copy
  [375, 380, true],    // the same phone with the keyboard eating the viewport (the tightest case)
  [844, 390, false],   // landscape phone: the @media (max-height: 520px) copy
  [1280, 500, false],  // a short DESKTOP window: the same copy, which no round had measured
  [768, 1024, false],  // control: neither trigger applies, the strip keeps its full two-row shape
];

let fails = 0, rows = 0;
if (SHOTS) await mkdir(SHOTS, { recursive: true });
for (const engine of ENGINES) {
  let browser;
  try { browser = await pw[engine].launch(); }
  catch (e) { console.error(`cannot launch ${engine}: ${String(e && e.message || e).slice(0, 160)} — skipping`); continue; }
  for (const variant of ['heart', 'setup']) {
    for (const [W, Hh, kb] of VPS) {
      const ctx = await browser.newContext({ viewport: { width: W, height: Hh }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      let tag = `${engine} ${String(W + 'x' + Hh).padEnd(9)} kb=${String(kb).padEnd(6)} ${variant.padEnd(5)}`;
      let shown = false;
      try { shown = await toMiss(page, variant === 'setup'); }
      catch (e) { console.error(`  ${tag} prepare threw: ${String(e.message).slice(0, 90)}`); }
      // The state pins data-kb only at phone widths (see audit-states.mjs); force it where we asked for it.
      if (kb) await page.evaluate(() => { document.documentElement.dataset.kb = 'open'; });
      await page.waitForTimeout(350);
      if (!shown) { console.log(`FAIL ${tag} — no miss strip rendered (the state did not reach a miss)`); fails++; await ctx.close(); continue; }
      const r = await page.evaluate(probe);
      tag = `${engine} ${String(W + 'x' + Hh).padEnd(9)} kb=${String(r.kb ?? kb).padEnd(6)} ${variant.padEnd(5)}`;
      const bad = r.btns.filter((b) => b.hit[0] < FLOOR || b.hit[1] < FLOOR);
      if (!r.btns.length) { console.log(`FAIL ${tag} — the strip has no link at all`); fails++; }
      if (bad.length || r.overflowX) fails++;
      rows++;
      console.log(`${bad.length || r.overflowX ? 'FAIL' : 'ok  '} ${tag} strip ${String(r.strip.h).padEnd(5)} (max-height ${r.strip.maxH}, overflow ${r.strip.of}) dock ${r.dockH} room ${r.room}${r.overflowX ? ' DOC OVERFLOWS' : ''}`);
      for (const b of r.btns) console.log(`       "${b.label}" box ${b.box.join('x')} hit ${b.hit.join('x')} clipped ${b.clipped.join('/')} ::before ${b.pseudo}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${TAG}-${engine}-${W}x${Hh}-kb${kb}-${variant}.png`) });
      await ctx.close();
    }
  }
  await browser.close();
}
server.close();
if (!rows) { console.error('\nNO MEASUREMENTS — nothing was proved'); process.exit(2); }
console.log(fails ? `\n${fails} FAILING combinations (S5 floor is 44x44)` : `\nALL PASS (${rows} combinations)`);
process.exit(fails ? 1 : 0);
