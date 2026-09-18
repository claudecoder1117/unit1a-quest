// qa/fixb6-sweep.mjs — ticket FIX:B6, finding 16. Dev tool, never part of site/.
//
// The audit saw the mc options graze each other at 844x390 in webkit ONLY on its resize sweep — a
// clean load at that size was silent ("unconfirmed"). That is a RESIZE bug, not a width bug: the
// page is prepared at 1280x800 and resized down through the viewport list, and on the landscape-phone
// step the option buttons do not re-take their intrinsic height. This reproduces exactly that path
// and prints, per option button, the button box against the ink of the text inside it.
//
//   node qa/fixb6-sweep.mjs [--engine webkit|chromium|both] [--card voc-09] [--tag before|after]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwright = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
// --path "/qa/widgets.html" serves the REPO ROOT instead of site/ (the dev page that mounts every
// widget type — the only place the termmatch definition list is guaranteed to be on screen).
const PATHNAME = opt('path', '');
const SITE = path.resolve(__dirname, '..', PATHNAME ? '.' : 'site');
const ENGINES = opt('engine', 'both') === 'both' ? ['chromium', 'webkit'] : [opt('engine', 'both')];
const CARD = opt('card', 'voc-09');
const TAG = opt('tag', '');
const SHOT = opt('shot', '');
// --css "<rules>" appends a stylesheet to every page (a candidate fix, tried before it is written to
// polish.css). Nothing on disk is touched.
const CSS = opt('css', '');
// A vocab card is `pick:'one'` — it shows ONE of its three parts (mc · term · termmatch), chosen from
// the seed `${id}|${history.length}`. --hist N plants N history rows on the card so a different part is
// picked, which is the only way to get the termmatch definition list on a real card screen.
const HIST = +opt('hist', '0') || 0;

// the auditor's own list, in its own order — the bug only appears on this path
const VP_ALL = [
  [320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932],
  [768, 1024], [834, 1112], [844, 390],
  [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1512, 982], [1728, 1117], [1900, 1200], [2560, 1440],
];
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
const SAVE = await readFile(path.resolve(__dirname, 'fixtures', 'midweek.json'), 'utf8');

/** every option/definition button on the card: its box vs the ink of the text inside it. */
const PROBE = () => {
  const px = (v) => Math.round(v * 10) / 10;
  const groups = [
    ['.w-mc .wd-opts > .wd-opt', '.wd-opt-t'],
    ['.w-tm .w-tm-defs > .w-tm-def', '.w-tm-def-t'],
    ['.w-tm .w-tm-terms > .w-tm-term', '.w-tm-term-t'],
  ];
  const res = [];
  for (const [sel, tsel] of groups) {
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) continue;
    const rows = els.map((b, i) => {
      const br = b.getBoundingClientRect();
      const t = b.querySelector(tsel);
      let lines = [];
      if (t) { const r = document.createRange(); r.selectNodeContents(t); lines = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0); }
      const ink = lines.length ? { top: Math.min(...lines.map((x) => x.top)), bottom: Math.max(...lines.map((x) => x.bottom)) } : null;
      return {
        i, w: px(br.width), h: px(br.height), top: px(br.top), bottom: px(br.bottom),
        lines: lines.length,
        inkH: ink ? px(ink.bottom - ink.top) : 0,
        spill: ink ? px(Math.max(0, ink.bottom - br.bottom) + Math.max(0, br.top - ink.top)) : 0,
        text: t ? t.textContent.trim().slice(0, 30) : '',
      };
    });
    // ink of one button landing inside another button's box
    let graze = 0;
    for (const a of rows) {
      for (const b of rows) {
        if (a.i === b.i || !a.lines) continue;
        const el = els[a.i], other = els[b.i].getBoundingClientRect();
        const r = document.createRange(); r.selectNodeContents(el.querySelector(tsel));
        for (const l of [...r.getClientRects()]) {
          const w = Math.min(l.right, other.right) - Math.max(l.left, other.left);
          const hh = Math.min(l.bottom, other.bottom) - Math.max(l.top, other.top);
          if (w > 0 && hh > 0) graze += w * hh;
        }
      }
    }
    res.push({ sel, rows, graze: px(graze), worstSpill: px(Math.max(0, ...rows.map((r) => r.spill))) });
  }
  return res;
};

console.log(`\n=== FIX:B6 resize sweep ${TAG ? `(${TAG})` : ''} — #/card/${CARD}, prepared at 1280x800 then resized like the auditor ===`);
let worst = 0;
for (const name of ENGINES) {
  const browser = await playwright[name].launch();
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/${PATHNAME ? 'site/' : ''}version.js`, { waitUntil: 'load' });
    await page.evaluate(([j, card, n]) => {
      const s = JSON.parse(j);
      if (n > 0) {
        const rec = s.cards[card] || (s.cards[card] = { attempts: 0, cleared: false, rarity: '', foil: false, foilProgress: [], setupTried: false, bucket: 1, lastAt: 0, due: 0, hintsUsed: 0, solutionShown: false, bestMs: 0, placed: false, work: '', history: [] });
        rec.history = Array.from({ length: n }, () => [1789333800000, 1, 1, 0, 60000]);
      }
      localStorage.setItem('u1a.save', JSON.stringify(s));
    }, [SAVE, CARD, HIST]);
    await page.goto(`http://127.0.0.1:${PORT}${PATHNAME || `/#/card/${CARD}`}`, { waitUntil: 'networkidle' });
    await page.waitForSelector(PATHNAME ? '.w' : '.card-screen', { timeout: 15000 }).catch(() => {});
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.waitForTimeout(600);
    console.log(`  [${name}/${theme}] widgets on screen (hist=${HIST}): ${await page.evaluate(() => [...document.querySelectorAll('.card-parts .w')].map((w) => w.className).join(', ') || 'none')}`);
    for (const vp of VP_ALL) {
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      await page.waitForTimeout(150);
      const label = `${vp[0]}x${vp[1]}`;
      const r = await page.evaluate(PROBE);
      if (SHOT && label === '844x390' && theme === 'light') await page.screenshot({ path: SHOT });
      for (const g of r) {
        if (g.graze > 0 || g.worstSpill > 0.5) {
          worst = Math.max(worst, g.graze);
          console.log(`  ${name}/${theme} ${label} ${g.sel}: graze ${g.graze}px² · worst spill ${g.worstSpill}px`);
          for (const row of g.rows) console.log(`      #${row.i} box ${row.w}x${row.h} top ${row.top} · ${row.lines} ink line(s) ${row.inkH}px · spill ${row.spill} · "${row.text}"`);
          if (SHOT && label === '844x390' && theme === 'light') await page.screenshot({ path: SHOT });
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
}
console.log(`\nVERDICT: worst graze on the resize path = ${worst}px²`);
await new Promise((r) => server.close(r));
