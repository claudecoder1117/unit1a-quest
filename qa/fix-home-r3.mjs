// qa/fix-home-r3.mjs — ticket fix:home r3. Measures Home's "Weak spots" rows (and the skill rail's
// twin) at phone widths under text zoom, in both engines and both themes. Dev-only.
//
//   node qa/fix-home-r3.mjs [--engines chromium,webkit] [--zooms 16,20,24] [--vps 320x568,375x667]
//                           [--states home-midweek,home-mock-cta,home-post-test] [--shots dir --tag t]
//
// Prints, per (state, vp, theme, engine, zoom): the row's resolved grid tracks, the widest name's box,
// the number's box, the overlap in px^2 between them, and the Drill button's hit height. Exits non-zero
// if any pair of in-flow row cells shares pixels, if any text-bearing track resolves under 8 px, or if
// the document scrolls horizontally.

import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { states } from './audit-states.mjs';

const require = createRequire(import.meta.url);
const playwright = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const ENGINES = opt('engines', 'chromium,webkit').split(',');
const ZOOMS = opt('zooms', '16,20,24').split(',').map(Number);
const VPS = opt('vps', '320x568,375x667').split(',').map(s => s.split('x').map(Number));
const WANT = opt('states', 'home-midweek,home-mock-cta,home-post-test').split(',');
const SHOTS = opt('shots', null);
const TAG = opt('tag', 'x');
// mutation test: put a piece of the defect back and prove the check still fails (notes/FIX-home.md
// §negative controls). Nothing on disk is touched.
const INJECT = opt('inject', null);

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
  } catch { res.writeHead(404); res.end('404 ' + p); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const CATALOG = states({ base }).filter(s => WANT.includes(s.id));
if (CATALOG.length !== WANT.length) { console.error('missing states:', WANT.filter(w => !CATALOG.some(s => s.id === w))); process.exit(2); }

/** Measure every .weak-row / .skill-row: tracks, cell boxes, pairwise overlap, tap heights. */
const PROBE = () => {
  const rows = [];
  const area = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0.5 && h > 0.5 ? Math.round(w * h) : 0;
  };
  for (const sel of ['.weak-row', '.skill-row']) {
    for (const row of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(row);
      const cells = [];
      for (const el of row.children) {
        // the text leaves, not the grid wrappers: measure the ink
        const leaves = el.matches('.weak-main') ? [...el.querySelectorAll('.weak-name')] : [el];
        for (const leaf of leaves) {
          const r = leaf.getBoundingClientRect();
          if (r.width < 0.5 || r.height < 0.5) continue;
          cells.push({ cls: leaf.className, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: Math.round(r.width), h: Math.round(r.height) }, txt: (leaf.textContent || '').trim().slice(0, 28) });
        }
      }
      const overlaps = [];
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
        const a = area(cells[i].r, cells[j].r);
        if (a) overlaps.push({ a: cells[i].cls, b: cells[j].cls, px2: a, pctOfSmaller: Math.round(100 * a / Math.min(cells[i].r.w * cells[i].r.h, cells[j].r.w * cells[j].r.h)), sample: cells[i].txt + ' | ' + cells[j].txt });
      }
      const tracks = cs.gridTemplateColumns;
      const zero = tracks.split(' ').map(parseFloat).filter(n => Number.isFinite(n) && n < 8);
      const drill = row.querySelector('.btn-drill, .st-skill-drill');
      rows.push({
        sel, rowW: Math.round(row.getBoundingClientRect().width), tracks,
        rows_: cs.gridTemplateRows, areas: cs.gridTemplateAreas,
        name: cells.find(c => /weak-name|skill-name/.test(c.cls))?.r || null,
        nameTxt: cells.find(c => /weak-name|skill-name/.test(c.cls))?.txt || '',
        num: cells.find(c => /weak-m|skill-m/.test(c.cls))?.r || null,
        drillH: drill ? Math.round(drill.getBoundingClientRect().height) : null,
        zeroTracks: zero, overlaps,
      });
    }
  }
  // hidden ink: a name whose box shows fewer lines than it has. Both cards promise the student the
  // FULL skill name (screens.css:221 "never an ellipsis that hides which ASN skill this is"), so a
  // clip here is a defect of the same family as the overlap — the cell cannot hold its content.
  const clipped = [...document.querySelectorAll('.weak-name, .skill-name')]
    .filter(el => el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1)
    .map(el => ({ cls: el.className.split(' ')[0], txt: (el.textContent || '').trim().slice(0, 40), shown: el.clientHeight, needs: el.scrollHeight }));
  const de = document.documentElement;
  return { rows, clipped, hscroll: Math.max(0, de.scrollWidth - de.clientWidth), fs: getComputedStyle(de).fontSize };
};

let fails = 0, checked = 0;
const lines = [];
for (const engineName of ENGINES) {
  const browser = await playwright[engineName].launch();
  for (const theme of ['light', 'dark']) {
    for (const st of CATALOG) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      try {
        await st.prepare(page);
        for (const [w, h] of VPS) {
          await page.setViewportSize({ width: w, height: h });
          for (const fs of ZOOMS) {
            const handle = await page.addStyleTag({ content: `html{font-size:${fs}px !important}` + (INJECT ? '\n' + INJECT : '') });
            await page.waitForTimeout(180);
            const m = await page.evaluate(PROBE);
            const bad = [];
            if (m.hscroll > 1) bad.push(`hscroll ${m.hscroll}`);
            for (const c of m.clipped) bad.push(`clipped ${c.cls} shows ${c.shown} of ${c.needs}px "${c.txt}"`);
            let worst = 0, worstRow = null;
            for (const r of m.rows) {
              if (r.zeroTracks.length) bad.push(`${r.sel} 0-track [${r.tracks}]`);
              for (const o of r.overlaps) if (o.px2 > worst) { worst = o.px2; worstRow = { ...o, r }; }
              if (r.overlaps.length) bad.push(`${r.sel} overlap ${r.overlaps.map(o => `${o.a}x${o.b} ${o.px2}px2 ${o.pctOfSmaller}%`).join(', ')}`);
              if (r.drillH != null && r.drillH < 44) bad.push(`${r.sel} drill ${r.drillH}px < 44`);
            }
            checked++;
            const wk = m.rows.find(r => r.sel === '.weak-row');
            const tag = `${st.id.padEnd(15)} ${String(w).padStart(4)}x${h} ${theme.padEnd(5)} ${engineName.padEnd(8)} fs=${String(fs).padStart(2)}`;
            const desc = wk ? `weak tracks [${wk.tracks}] areas=${wk.areas} name=${wk.name ? wk.name.w + 'x' + wk.name.h : '-'} num=${wk.num ? wk.num.w + 'x' + wk.num.h : '-'} drill=${wk.drillH}` : 'no .weak-row';
            if (bad.length) { fails++; lines.push(`FAIL ${tag} | ${bad.join(' | ')}`); if (worstRow) lines.push(`       worst: ${worstRow.sample}`); }
            else lines.push(`ok   ${tag} | ${desc}`);
            if (SHOTS && (bad.length || fs === 20)) {
              await mkdir(SHOTS, { recursive: true });
              const card = await page.$('.home-weak');
              const f = path.join(SHOTS, `${TAG}-${st.id}-${w}-${theme}-${engineName}-fs${fs}.png`);
              if (card) await card.screenshot({ path: f }); else await page.screenshot({ path: f });
            }
            await handle.evaluate(el => el.remove()).catch(() => {});
            await page.waitForTimeout(80);
          }
        }
      } catch (e) { fails++; lines.push(`ERROR ${st.id} ${theme} ${engineName}: ${e.message}`); }
      await ctx.close();
    }
  }
  await browser.close();
}
console.log(lines.join('\n'));
console.log(`\n${checked} measurements, ${fails} failures`);
await new Promise(r => server.close(r));
process.exit(fails ? 1 : 0);
