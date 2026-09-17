// qa/crit-home-r2.mjs — critic r2 (lane home) independent scenarios. Harness copied from qa/fix5-home-r2.mjs. Output qa/screenshots/crit-home/r2/
// Serves site/ the way qa/shot.mjs does, but with an IN-MEMORY patch of js/widgets/index.js that records every
// mounted widget on window.__mounted and lets window.__force[partId] override raw()/isEmpty() — so a placement
// can be ACED from the part's own stored answer (the golden round-trip builder from tests/_helpers.mjs).
// Usage: node s9walk.mjs walk        — fresh visit → onboarding → ace placement → Home → Page → Summary → Binder → Mock → Settings (375×667 light)
//        node s9walk.mjs shots       — re-shoot the key screens from the walk's saved state at 375 dark + 1280×800 light/dark
//        node s9walk.mjs offline     — SW: load once online, go offline, open routes
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const SITE = path.join(REPO, 'site');
const OUT = path.join(REPO, 'qa', 'screenshots', 'crit-home', 'r2');
const SCRATCH = path.join(REPO, 'qa', 'screenshots', 's9');   // state json + logs land beside the PNGs (git-ignored)
await mkdir(OUT, { recursive: true });
const mode = process.argv[2] || 'walk';
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
const browser = await chromium.launch();
const log = [];
const say = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); log.push(s); };
const check = (ok, msg) => say(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);

// the golden round-trip builder (tests/_helpers.mjs correctRaw), as a string for the page
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

const PROBE = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const small = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input, select, textarea, [tabindex="0"]')) {
    if (el.hidden || el.closest('[hidden]')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (r.bottom < 0 || r.top > vh) continue;
    if (r.height < 44 || r.width < 44) small.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), cls: el.className?.baseVal ?? String(el.className).slice(0, 40) });
  }
  // contrast: visible text nodes' element color vs first opaque ancestor background
  const lum = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return null; let [r, g, b, a = 1] = m.map(Number); if (/^color\\(srgb/.test(c)) { r *= 255; g *= 255; b *= 255; } if (a === 0) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { let e = el; while (e) { const bg = getComputedStyle(e).backgroundColor; const l = lum(bg); if (l !== null && !/rgba\\(\\d+, \\d+, \\d+, 0/.test(bg)) return bg; e = e.parentElement; } return getComputedStyle(document.documentElement).backgroundColor; };
  const low = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) {
    const txt = n.nodeValue.trim(); if (!txt) continue; const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('[hidden], script, style, [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.bottom < 0 || r.top > vh) continue;
    const lf = lum(cs.color), lb = lum(bgOf(el)); if (lf === null || lb === null) continue;
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5)) low.push({ t: txt.slice(0, 30), ratio: +ratio.toFixed(2), fg: cs.color, bg: bgOf(el), cls: String(el.className).slice(0, 40) });
  }
  return { overflow: document.documentElement.scrollWidth > innerWidth, scrollW: document.documentElement.scrollWidth, small: small.slice(0, 12), smallCount: small.length, low: low.slice(0, 12), lowCount: low.length };
})()`;

async function open({ w = 375, h = 667, dark = false, state = null, route = '#/', motion = 'no-preference', sw = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', reducedMotion: motion, serviceWorkers: sw ? 'allow' : 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => errors.push('[requestfailed] ' + r.url()));
  await page.addInitScript(CORRECT_RAW);
  await page.goto(base + 'version.js', { waitUntil: 'load' });
  if (state) await page.evaluate(j => localStorage.setItem('u1a.save', j), state);
  await page.goto(base + route, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}
const shot = async (page, name, full = false) => { const p = path.join(OUT, name); await page.screenshot({ path: p, fullPage: full }); say('shot', p); return p; };
const probe = async (page, tag) => { const r = await page.evaluate(PROBE); say(`probe ${tag}`, { overflow: r.overflow, scrollW: r.scrollW, small: r.smallCount, low: r.lowCount }); if (r.smallCount) say(`  small(${tag})`, r.small); if (r.lowCount) say(`  lowContrast(${tag})`, r.low); return r; };
const tap = (el) => el.evaluate(e => e.click());
const text = (page, sel) => page.evaluate(s => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null, sel);

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

/* ================================================================ critic scenarios (home r1) */
const READ = async (page) => page.evaluate(async () => {
  const R = await import('/js/readiness.js'); const s = JSON.parse(localStorage.getItem('u1a.save'));
  const rd = R.readiness(s);
  return { r: rd.r, M: +(rd.M * 100).toFixed(2), prov: rd.provisional, tested: rd.tested, weak: R.weakSpots(s).map(w => w.id + ':' + Math.round(w.mShown)), started: R.startedSkills(s).map(w => w.id + ':' + Math.round(w.mShown)) };
});
const HOME = async (page) => { await page.goto(base + '#/today', { waitUntil: 'networkidle' }); await page.waitForTimeout(900); return page.evaluate(() => ({ hero: document.querySelector('.hero-text')?.innerText.replace(/\s+/g, ' '), ring: document.querySelector('#hdr-readiness')?.getAttribute('aria-label'), weak: document.querySelector('.home-weak')?.innerText.replace(/\s+/g, ' ').slice(0, 220) })); };
async function cardAnswer(page, id, how) {
  let mk = await mark(page);
  await page.goto(base + '#/card/' + id, { waitUntil: 'networkidle' });
  const a = await armCard(page, mk);
  if (how === 'hint') { const b = await page.$('.card-hint-btn:not([hidden]), .card-dock-hint:not([hidden])'); if (b) { await tap(b); await page.waitForTimeout(300); } else say('NO HINT BTN', id); }
  if (how === 'wrong') {
    await page.evaluate(() => { for (const k of Object.keys(window.__force)) { const v = window.__force[k]; window.__force[k] = typeof v === 'string' && /^[ASN]$/.test(v) ? (v === 'A' ? 'N' : 'A') : v; } });
    await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(600);
    say('wrong result', id, (await text(page, '.card-result'))?.slice(0, 120));
    return a;
  }
  const ok = await submitUntilContinue(page);
  say('answered', id, how, ok, (await text(page, '.card-result'))?.slice(0, 80));
  return a;
}

/* ================================================================ critic r2 scenarios */
async function jump(mod = 'M1') {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1200);
  let prev = await READ(page); say('START', prev);
  let mm = await mark(page);
  await page.goto(base + '#/run/jump/' + mod, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  let minR = prev.r, maxR = prev.r, last = prev;
  for (let i = 1; i <= 10; i++) {
    const a = await armCard(page, mm).catch(e => ({ err: e.message }));
    if (a.err) { say('arm fail', i, a.err); await shot(page, `jump-stuck-${i}.png`); break; }
    const ok = await submitUntilContinue(page, 10);
    const res = (await text(page, '.card-result'))?.slice(0, 60);
    const cur = await READ(page);
    say(`jump item ${i}`, a.kinds, ok, res, cur.r, cur.M, cur.started, cur.weak);
    if (!ok) { await shot(page, `jump-stuck-${i}.png`); break; }
    maxR = Math.max(maxR, cur.r); last = cur;
    mm = await mark(page);
    await tap(await page.$('.card-continue:not([hidden])')); await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1200);
  const fin = await READ(page);
  say('JUMP FINISH', fin, 'screen', (await text(page, 'main'))?.slice(0, 300));
  say('JUMP verdict', `R before finish ${last.r} (M ${last.M}) -> after ${fin.r} (M ${fin.M})`, fin.r < last.r || fin.M < last.M ? 'DROP ON FINISH SAVE' : 'no drop');
  await shot(page, `jump-${mod}-finish.png`);
  await writeFile(path.join(OUT, `jump-${mod}.json`), await page.evaluate(() => localStorage.getItem('u1a.save')));
  const hm = await HOME(page); say('HOME', hm);
  await shot(page, `jump-${mod}-home.png`);
  say('skills', await page.evaluate(() => Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('u1a.save')).skills).map(([k, v]) => [k, [Math.round(v.m), v.n, !!v.placedAt, v.misses, v.helped]]))));
  say('errors', errors);
  await ctx.close();
}
async function retryNew(id = 'cls-01') {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1000);
  say('START', await READ(page));
  const mk = await mark(page);
  await page.goto(base + '#/card/' + id, { waitUntil: 'networkidle' });
  const a = await armCard(page, mk);
  say('kinds', a.kinds, a.force);
  const good = a.force;
  await page.evaluate(() => { for (const k of Object.keys(window.__force)) { const v = window.__force[k]; window.__force[k] = typeof v === 'number' ? v + 7 : typeof v === 'string' ? ({ acute: 'obtuse', obtuse: 'acute', right: 'straight', straight: 'right' }[v] ?? (v + 'zz')) : Array.isArray(v) ? [] : { }; } });
  await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(700);
  say('after wrong submit', (await text(page, '.card-result, .card-parts'))?.slice(0, 120), await READ(page));
  await page.evaluate((f) => { window.__force = f; }, good);
  const ok = await submitUntilContinue(page, 6);
  say('then correct', ok, (await text(page, '.card-result'))?.slice(0, 100), await READ(page));
  say('HOME', await HOME(page));
  const weakEl = await page.$('.home-weak'); if (weakEl) { await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  await shot(page, `retry-${id}-weak.png`);
  await writeFile(path.join(OUT, `retry-${id}.json`), await page.evaluate(() => localStorage.getItem('u1a.save')));
  say('errors', errors);
  await ctx.close();
}
async function cleanMany() {
  // clean answers across a mix the fixer did not use: voc x3, cls x3, not x2, fac, ang-wu (pairs)
  const state = await readFile(path.join(OUT, 'retry-cls-01.json'), 'utf8').catch(() => readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8'));
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1000);
  let prev = await READ(page); say('START', prev);
  for (const id of ['voc-02', 'voc-03', 'cls-02', 'cls-03', 'voc-04', 'cls-04', 'not-02', 'wp-12', 'cls-05', 'voc-05']) {
    await cardAnswer(page, id, 'clean');
    const cur = await READ(page);
    say(`after ${id}`, cur, cur.r < prev.r || cur.M < prev.M - 1e-9 ? 'DROP!!!' : '');
    prev = cur;
  }
  const hm = await HOME(page); say('HOME', hm);
  await shot(page, 'cleanmany-home.png');
  await writeFile(path.join(OUT, 'cleanmany.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  say('errors', errors);
  await ctx.close();
}
async function homeMock(file, dark) {
  const state = await readFile(file, 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state, dark });
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 }); await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    kind: document.querySelector('.home-primary')?.dataset.kind,
    mockLinks: [...document.querySelectorAll('main a, main button')].filter(a => ((a.getAttribute('href') || '').startsWith('#/mock') || /mock/i.test(a.innerText)) && a.getBoundingClientRect().height > 0).map(a => ({ t: a.innerText.replace(/\s+/g, ' '), href: a.getAttribute('href'), h: Math.round(a.getBoundingClientRect().height), w: Math.round(a.getBoundingClientRect().width) })),
    mockText: (document.querySelector('main')?.innerText.match(/.*Mock.*/g) || []),
  }));
  say(`home ${dark ? 'dark' : 'light'} ${path.basename(file)}`, info);
  await probe(page, 'home');
  await shot(page, `home-${path.basename(file, '.json')}-${dark ? 'dark' : 'light'}.png`);
  await shot(page, `home-${path.basename(file, '.json')}-${dark ? 'dark' : 'light'}-full.png`, true);
  say('errors', errors);
  await ctx.close();
}
async function zeroPage() {
  const state = await readFile(path.join(OUT, 'zero.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 }); await page.waitForTimeout(600);
  say('home kind', await page.evaluate(() => document.querySelector('.home-primary')?.dataset.kind), await READ(page));
  await tap(await page.$('.home-primary')); let mm = await mark(page); await page.waitForSelector('.run-screen', { timeout: 20000 });
  let prev = await READ(page);
  for (let i = 1; i <= 14; i++) {
    const a = await armCard(page, mm).catch(e => ({ err: e.message }));
    if (a.err) { say('arm end', i, a.err); break; }
    const ok = await submitUntilContinue(page, 10);
    const cur = await READ(page);
    say(`item ${i}`, a.kinds.slice(0, 2), ok, (await text(page, '.card-result'))?.slice(0, 30), 'R', cur.r, 'M', cur.M, 'tested', cur.tested, cur.started.join(' '), cur.r < prev.r ? 'DROP' : '');
    prev = cur;
    if (!ok) { await shot(page, `zero-stuck-${i}.png`); break; }
    mm = await mark(page);
    const c = await page.$('.card-continue:not([hidden])'); if (!c) break; await tap(c); await page.waitForTimeout(600);
  }
  const hm = await HOME(page); say('HOME', hm);
  await shot(page, 'zero-page-home.png');
  await writeFile(path.join(OUT, 'zero-after-page.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  say('skills', await page.evaluate(() => Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('u1a.save')).skills).map(([k, v]) => [k, [Math.round(v.m), v.n, v.misses, v.helped]]))));
  say('errors', errors);
  await ctx.close();
}
const LORE = /Lexicon|Figure Recon|Comp\/Supp|Bisector|Arena|Forge|Sprint|Recon|Verdicts/;
async function placemix() {
  const { ctx, page, errors } = await open({ route: '#/' });
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 });
  await tap(await page.$('.home-primary'));
  await page.waitForSelector('.ob-next', { timeout: 15000 }).catch(() => {});
  if (!(await page.$('.ob-next'))) { await page.goto(base + '#/onboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(400); }
  await tap(await page.$('.ob-next'));
  await page.waitForSelector('.card-screen, .ob-step', { timeout: 15000 }); await page.waitForTimeout(500);
  await tap(await page.$('text=Next: where are you now?'));
  await page.waitForSelector('text=Start ·', { timeout: 15000 }); await page.waitForTimeout(400);
  say('intro lore hits', ((await text(page, 'main')) || '').match(new RegExp(LORE, 'g')));
  let m = await mark(page);
  await page.click('text=Start ·');
  for (let i = 1; i <= 8; i++) {
    const a = await armCard(page, m);
    let wrong = false;
    if (i === 2 || i === 5 || i === 6) wrong = await page.evaluate(() => { let ch = false; for (const k of Object.keys(window.__force)) { const v = window.__force[k]; if (typeof v === 'number') { window.__force[k] = v + 7; ch = true; } else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) { window.__force[k] = String(+v + 7); ch = true; } else if (typeof v === 'string' && /^[ASN]$/.test(v)) { window.__force[k] = v === 'A' ? 'N' : 'A'; ch = true; } } return ch; });
    if (wrong) { await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(600); say('after wrong submit', (await text(page, '.card-parts'))?.slice(0, 80)); await page.evaluate((f) => { window.__force = f; }, a.force); }
    const ok = await submitUntilContinue(page, 12);
    say(`place ${i}`, a.kinds, 'forcedWrong', wrong, ok, (await text(page, '.card-result'))?.slice(0, 80));
    if (!ok) { await shot(page, `place-stuck-${i}.png`); break; }
    m = await mark(page);
    await tap(await page.$('.card-continue:not([hidden])')); await page.waitForTimeout(500);
    if (await page.$('text=Placement done')) break;
  }
  await page.waitForSelector('text=Placement done', { timeout: 15000 }); await page.waitForTimeout(600);
  const main = await text(page, 'main');
  say('SUMMARY', main); say('SUMMARY lore hits', main.match(new RegExp(LORE, 'g')));
  await shot(page, 'placemix-summary.png', true);
  const sk = await page.evaluate(() => JSON.parse(localStorage.getItem('u1a.save')).skills);
  say('skills', sk);
  say('READ', await READ(page));
  const hm = await HOME(page); say('HOME', hm);
  await writeFile(path.join(OUT, 'placemix.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  const bodyText = await page.evaluate(() => document.body.innerText); say('home lore hits', bodyText.match(new RegExp(LORE, 'g')));
  say('errors', errors);
  await ctx.close();
}


try {
  if (mode === 'placemix') await placemix();
  else if (mode === 'zeropage') await zeroPage();
  else if (mode === 'jump') await jump(process.argv[3] || 'M1');
  else if (mode === 'retry') await retryNew(process.argv[3] || 'cls-01');
  else if (mode === 'cleanmany') await cleanMany();
  else if (mode === 'homemock') await homeMock(process.argv[3], process.argv[4] === 'dark');
} catch (e) { say('FAIL', e.stack); }
await writeFile(path.join(OUT, `${mode}.log`), log.join('\n'));
await browser.close(); server.close();
