// qa/crit-run-r2.mjs — critic (lane run, round 2) real-flow geometry check. Dev only.
// Usage: node qa/crit-run-r2.mjs W H [dark] [scrollbeforecontinue] [items]
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const SITE = path.join(REPO, 'site');
const OUT = path.join(REPO, 'qa', 'screenshots', 'crit-run-r2');
await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const PATCH = `
function __rec(api, part) {
  if (!api) return api;
  const orig = typeof api.raw === 'function' ? api.raw.bind(api) : () => null;
  const origEmpty = typeof api.isEmpty === 'function' ? api.isEmpty.bind(api) : () => true;
  const cur = () => (typeof api.activePart === 'function' ? api.activePart() : part) || part;
  const forced = () => { const f = window.__force; const p = cur(); return f && p && (p.id in f) ? f[p.id] : undefined; };
  try { Object.defineProperty(api, 'raw', { value: () => { const v = forced(); return v === undefined ? orig() : v; }, configurable: true, writable: true }); } catch (e) { console.warn('rec raw', e); }
  try { Object.defineProperty(api, 'isEmpty', { value: () => (forced() === undefined ? origEmpty() : false), configurable: true, writable: true }); } catch (e) { console.warn('rec isEmpty', e); }
  (window.__mounted = window.__mounted || []).push({ part, api });
  return api;
}
`;

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('dir');
    let body = await readFile(file);
    if (p === '/js/widgets/index.js') {
      let s = body.toString('utf8');
      const a = s.includes('if (mount) return mount(el, part, ctx);'), b = s.includes('live = fn(el, part, ctx);');
      if (!a || !b) console.error('PATCH ANCHORS MISSING', a, b);
      s = s.replace('if (mount) return mount(el, part, ctx);', 'if (mount) return __rec(mount(el, part, ctx), part);')
           .replace('live = fn(el, part, ctx);', 'live = __rec(fn(el, part, ctx), part);') + PATCH;
      body = Buffer.from(s);
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const CORRECT_RAW = `
window.__requiredChipIndexes = (slot) => slot.chips.map((ch, i) => [ch, i]).filter(([ch]) => ch.role === 'required').map(([, i]) => i);
window.__correctRaw = function (card, p) {
  switch (p.type) {
    case 'num': return Array.isArray(p.bonus) && p.bonus.length ? { value: p.answer, ...Object.fromEntries(p.bonus.map((b) => [b.key, b.answer])) } : p.answer;
    case 'multi': return Object.fromEntries(p.fields.map((f) => [f.key, f.answer]));
    case 'roots': return p.answer;
    case 'reject': return { keep: p.valid ?? [], reject: p.rejected ?? [], reason: p.reason ?? p.reasonKey };
    case 'cases': return p.rows;
    case 'ratio': return p.answer;
    case 'factored': return p.answer;
    case 'equation': if (p.text) return p.text; if (p.canonical) return p.canonical + ' = 0'; if (Array.isArray(p.system)) return p.system.map((s) => s + ' = 0').join(', '); return null;
    case 'mc': return p.answer;
    case 'term': return (p.answers ?? [p.answer])[0];
    case 'asn': return p.answer;
    case 'classify': return p.answer;
    case 'notation': return p.sides ? { kind: p.kind, sides: p.sides } : { kind: p.kind, pts: p.pts };
    case 'cloze': return p.blanks.map((b) => (b.answers ? b.answers[0] : b.answer));
    case 'termmatch': return Object.fromEntries(p.pairs.map((x) => [x.term, x.def]));
    case 'pairs': return (card?.teacherPairs ?? []).map((pair) => pair.map((n) => '∠' + n));
    case 'strip': { const raw = {}; for (const s of p.slots) { if (s.type === 'chips') raw[s.id] = window.__requiredChipIndexes(s); else if (s.type === 'multi') raw[s.id] = Object.fromEntries(s.fields.map((f) => [f.key, f.answer])); else raw[s.id] = s.answer; } return raw; }
    default: return undefined;
  }
};`;

/** Wait for a card to be ready, compute the forced-correct map from the widgets mounted after `mark`. */
async function armCard(page, mark) {
  await page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w', { timeout: 20000 });
  await page.waitForTimeout(350);
  return page.evaluate(async (mark) => {
    const ms = (window.__mounted || []).slice(mark);
    const force = {}; const kinds = [];
    let card = {};
    if (ms.some(({ part }) => part?.type === 'pairs')) {
      const m = await import('/data/cards.js');
      const strip = (t) => String(t || '').replace(/\{\w+\s+([^}]*)\}/g, '$1').replace(/[^A-Za-z]/g, '').slice(0, 140);
      const dom = strip(document.querySelector('.card-stem')?.innerText);
      card = Object.values(m.byId).find(c => Array.isArray(c.teacherPairs) && strip(c.stem) === dom) || Object.values(m.byId).find(c => Array.isArray(c.teacherPairs) && strip(c.stem).slice(0, 20) === dom.slice(0, 20)) || {};
      kinds.push('card:' + (card.id || '?'));
    }
    for (const { part } of ms) {
      const parts = part?.type === 'rootcase' && Array.isArray(part.parts) ? part.parts : [part];
      for (const p of parts) { if (!p) continue; kinds.push(p.type + ':' + p.id); const r = window.__correctRaw(card, p); if (r !== undefined && r !== null) force[p.id] = r; }
    }
    window.__force = force;
    return { kinds, force, stem: document.querySelector('.card-stem')?.innerText.replace(/\s+/g, ' ').slice(0, 90) };
  }, mark);
}
/** Submit until Continue shows. Rootcase: feed found roots into the widget between stages. */
async function submitUntilContinue(page, maxSubmits = 8) {
  for (let i = 0; i < maxSubmits; i++) {
    if (await page.$('.card-continue:not([hidden])')) return true;
    await page.evaluate(() => { for (const { part, api } of window.__mounted || []) { if (part?.type === 'rootcase' && api.setFound) { const rp = part.parts.find(p => p.type === 'roots'); const v = rp && window.__force?.[rp.id]; if (v) try { api.setFound(v); } catch {} } } });
    const submit = await page.$('.card-submit:not([hidden])');
    if (!submit) { await page.waitForTimeout(300); continue; }
    await tap(submit);
    await page.waitForTimeout(450);
  }
  return !!(await page.$('.card-continue:not([hidden])'));
}
const mark = (page) => page.evaluate(() => (window.__mounted || []).length);

const browser = await chromium.launch();
const [W, H] = [+(process.argv[2]||375), +(process.argv[3]||667)];
const DARK = process.argv.includes('dark');
const SCROLL = process.argv.includes('scroll');
const MOTION = process.argv.includes('reduce') ? 'reduce' : 'no-preference';
const NITEMS = +(process.env.ITEMS || 6);
const tag = `${W}x${H}${DARK?'-dark':''}${SCROLL?'-scroll':''}${MOTION==='reduce'?'-reduce':''}`;
const tap = (el) => el.evaluate(e => e.click());
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: DARK ? 'dark' : 'light', reducedMotion: MOTION, serviceWorkers: 'block', hasTouch: W < 1024 });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
await page.addInitScript(CORRECT_RAW);
const state = await readFile(process.env.STATE || path.join(REPO, 'qa/screenshots/s9/after-ace.json'), 'utf8');
await page.goto(base + 'version.js');
await page.evaluate(j => { localStorage.clear(); localStorage.setItem('u1a.save', j); }, state);
await page.goto(base + '#/today', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-primary[data-kind="page"]', { timeout: 20000 });
await page.waitForTimeout(400);
let mm = await mark(page);
await tap(await page.$('.home-primary'));
await page.waitForSelector('.run-screen', { timeout: 20000 });
const MEAS = () => page.evaluate(() => {
  const SEL = 'input:not([disabled]):not([type=hidden]), textarea, select, button:not([disabled]), [role="button"]:not(output), [tabindex="0"]:not(output)';
  const parts = document.querySelector('.card-parts');
  const ctl = [...parts.querySelectorAll(SEL)].find(e => e.getClientRects().length && !e.closest('[hidden]'));
  const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
  const dock = document.querySelector('#dock'); const hdr = document.querySelector('.hdr'); const stem = document.querySelector('.card-stem');
  const lh = parseFloat(getComputedStyle(stem).lineHeight) || 24;
  const c = R(ctl), d = R(dock)[0], hb = R(hdr)[1], s = R(stem)[0];
  // is the dock actually overlapping? check elementFromPoint at control top+2
  let hit = null; if (ctl) { const b = ctl.getBoundingClientRect(); const el = document.elementFromPoint(b.left + Math.min(10, b.width/2), b.top + 3); hit = el ? (ctl.contains(el) || el===ctl) : false; }
  return { scrollY: Math.round(scrollY), ctl: c, ctlDesc: ctl && (ctl.tagName + '.' + String(ctl.className).split(' ')[0] + ' ' + (ctl.getAttribute('aria-label')||ctl.textContent||'').trim().slice(0,20)), dockTop: d, hdrBottom: hb, stemTop: s, runHead: R(document.querySelector('.run-head')), cardHead: R(document.querySelector('.card-head')),
    ctlOK: !!c && c[0] >= hb && c[0] < d, ctlHittableTop: hit, stemOK: s >= hb - 1 && s + lh <= d, overflow: document.documentElement.scrollWidth > innerWidth, stem: stem.innerText.replace(/\s+/g,' ').slice(0,50) };
});
let fails = 0;
for (let i = 1; i <= NITEMS; i++) {
  const a = await armCard(page, mm);
  await page.waitForTimeout(1300);
  const m = await MEAS();
  const ok = m.ctlOK && m.stemOK && !m.overflow;
  if (!ok) fails++;
  console.log(`${ok?'ok  ':'FAIL'} item ${i}`, JSON.stringify(m));
  if (i <= 6 && !process.env.NOSHOT) await page.screenshot({ path: path.join(OUT, `item${i}-${tag}.png`) });
  const done = await submitUntilContinue(page);
  if (!done) { console.log('STUCK', i); break; }
  if (SCROLL) { await page.mouse.wheel(0, 2000); await page.waitForTimeout(300); }
  mm = await mark(page);
  await tap(await page.$('.card-continue:not([hidden])'));
  await page.waitForTimeout(500);
}
if (NITEMS >= 13) {
  await page.waitForSelector('.run-summary', { timeout: 20000 });
  await page.waitForTimeout(2500);
  const fam = await page.evaluate(() => [...document.querySelectorAll('.sum-tiles > li[data-fam="true"]')].map(li => {
    const cap = li.querySelector('.sum-tile-cap');
    const lines = []; const walker = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT); let n;
    const rng = document.createRange(); const tops = new Map();
    while ((n = walker.nextNode())) { for (let i = 0; i < n.length; i++) { rng.setStart(n, i); rng.setEnd(n, i + 1); const r = rng.getClientRects()[0]; if (!r) continue; const t = Math.round(r.top); tops.set(t, (tops.get(t) || '') + n.data[i]); } }
    const tile = li.querySelector('.sum-tile') || li;
    return { lines: [...tops.values()], aria: tile.getAttribute('aria-label') || li.getAttribute('aria-label'), op: getComputedStyle(tile).opacity, tr: getComputedStyle(tile).transform, rarity: li.dataset.rarity };
  }));
  console.log('FAM', JSON.stringify(fam, null, 1));
  console.log('legend', await page.evaluate(() => document.querySelector('.sum-fam-legend')?.innerText));
  const el = await page.$('.sum-tiles'); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `summary-${tag}.png`) });
}
console.log('errors', JSON.stringify(errors));
await browser.close(); server.close();
process.exit(fails ? 1 : 0);
