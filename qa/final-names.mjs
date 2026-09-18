// qa/final-names.mjs — ticket FINAL. Where does a long skill name actually BREAK?
// The audit's detectors measure whether text is collapsed, clipped or overlapping. None of them asks
// whether a break lands INSIDE A WORD, which is what Home's Skills rail was doing at every desktop
// width: "Always/Sometimes/Neve" / "r: Points, Lines, Planes". This prints one line per rendered line,
// per skill-name element, on Home / Stats / the Mock report, in both engines.
//
//   node qa/final-names.mjs [--w 1900] [--engines webkit,chromium]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const QA = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(QA, 'shot.mjs'));
const pw = require('playwright');
const SITE = path.resolve(QA, '..', 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, p); try { const st = await stat(f); if (!st.isFile()) throw 0; res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(await readFile(f)); } catch { res.writeHead(404); res.end('404'); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const save = await readFile(path.join(QA, 'fixtures', 'midweek.json'), 'utf8');

// Which characters may a line END on? A break after a space, a slash, a comma or a hyphen is
// typography; a break after any other letter is the word being cut in half.
const OK_END = /[\s/,\-–—:;.)\]]$/;
const W = +opt('w', 1900), Hh = +opt('h', 1200);
let bad = 0;
for (const engine of (opt('engines', 'webkit,chromium')).split(',')) {
  const b = await pw[engine].launch();
  for (const [label, hash, root, sel] of [
    ['home rail',   '#/today',  '.home',          '.skill-name'],
    ['home weak',   '#/today',  '.home',          '.weak-name'],
    ['stats rows',  '#/stats',  '.stats',         '.st-skill-name'],
    ['mock report', '#/report', '.report-screen, .screen', '.report-sk-n'],
  ]) {
    const ctx = await b.newContext({ viewport: { width: W, height: Hh }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(base + 'version.js', { waitUntil: 'load' });
    await page.evaluate(j => localStorage.setItem('u1a.save', j), save);
    await page.goto(base + hash, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector(root, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const rows = await page.evaluate((sel) => {
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        // One entry per rendered line: walk the element's own text nodes and group rects by their top.
        const lines = new Map();
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const s = n.nodeValue; if (!s.trim()) continue;
          for (let i = 0; i < s.length; i++) {
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
            const rect = r.getClientRects()[0]; if (!rect) continue;
            const key = Math.round(rect.top);
            if (!lines.has(key)) lines.set(key, '');
            lines.set(key, lines.get(key) + s[i]);
          }
        }
        if (!lines.size) continue;
        out.push({ text: el.textContent.trim().replace(/\s+/g, ' '), w: Math.round(el.getBoundingClientRect().width),
                   lines: [...lines.entries()].sort((a, c) => a[0] - c[0]).map(([, t]) => t) });
      }
      return out;
    }, sel);
    for (const r of rows) {
      if (r.lines.length < 2) continue;
      // A break is typography if the line ENDS on a space/slash/comma/etc OR the next line STARTS on
      // whitespace (the break was taken at that space). Anything else cut a word in half.
      const midWord = (i) => !OK_END.test(r.lines[i]) && !/^\s/.test(r.lines[i + 1] || '');
      const cuts = r.lines.slice(0, -1).map((_, i) => i).filter(midWord);
      if (!cuts.length) continue;
      bad++;
      console.log(`${engine} ${W}px  ${label}  [${sel}]  box ${r.w}px`);
      r.lines.forEach((l, i) => console.log(`    line ${i + 1}: "${l}"${cuts.includes(i) ? '   <-- BREAKS MID-WORD' : ''}`));
    }
    await ctx.close();
  }
  await b.close();
}
console.log(bad ? `\n${bad} name(s) break mid-word` : `\nno name breaks mid-word at ${W}px`);
server.close();
process.exit(bad ? 1 : 0);
