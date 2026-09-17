// qa/fix5-home-r2.mjs — fix5 lane home r2 checks: the critic r1 scenarios (qa/crit-home-r1.mjs, copied) + resume header, Mock CTA, Settings-vs-Home. Output: qa/screenshots/fix5-home/r2/
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
const OUT = path.join(REPO, 'qa', 'screenshots', 'fix5-home', 'r2');
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
async function multi() {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1200);
  const seq = [['cls-01', 'clean'], ['asn-01', 'clean'], ['voc-01', 'clean'], ['cls-02', 'clean'], ['asn-02', 'clean'], ['fac-01', 'clean'], ['quad-01', 'clean'], ['asn-06', 'clean'], ['not-01', 'clean']];
  let prev = await READ(page); say('START', prev, await HOME(page));
  for (const [id, how] of seq) {
    await cardAnswer(page, id, how);
    const cur = await READ(page); const hm = await HOME(page);
    say(`after ${id} ${how}`, cur, hm, cur.r < prev.r || cur.M < prev.M - 1e-9 ? 'DROP!!!' : '');
    prev = cur;
  }
  await shot(page, 'multi-home.png');
  const weakEl = await page.$('.home-weak'); if (weakEl) { await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await shot(page, 'multi-weak.png'); }
  await writeFile(path.join(OUT, 'multi.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  // now a genuine miss on a just-started skill
  await cardAnswer(page, 'asn-10', 'wrong');
  const w = await READ(page); say('after asn-10 WRONG', w, await HOME(page));
  const weakEl2 = await page.$('.home-weak'); if (weakEl2) { await weakEl2.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  await shot(page, 'multi-after-wrong-weak.png');
  say('errors', errors);
  await ctx.close();
}
async function wrongNew() {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1000);
  say('START', await READ(page));
  await cardAnswer(page, 'asn-01', 'wrong');
  say('after wrong asn-01', await READ(page), await HOME(page));
  const weakEl = await page.$('.home-weak'); if (weakEl) { await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  await shot(page, 'wrong-new-weak.png');
  say('errors', errors);
  await ctx.close();
}
async function hinty() {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1000);
  for (const id of ['asn-01', 'asn-02', 'asn-06', 'asn-10', 'asn-12', 'asn-13']) { await cardAnswer(page, id, 'hint'); say('after hinted', id, await READ(page)); }
  say('HOME', await HOME(page));
  const weakEl = await page.$('.home-weak'); if (weakEl) { await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  await shot(page, 'hinty-weak.png');
  say('errors', errors);
  await ctx.close();
}

const LORE = /Lexicon|Figure Recon|Comp\/Supp|Bisector Verdicts|ASN Arena|Factor Forge|Forge/;
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

/* ================================================================ fix5 home r2 additions */
const HDR = (page) => page.evaluate(() => ({ hdr: document.querySelector('#hdr-readiness')?.getAttribute('aria-label'), num: document.querySelector('#hdr-readiness')?.innerText.trim() }));
async function resumeHeader() {
  const state = await readFile(path.join(REPO, 'qa', 'screenshots', 'fix5-home', 'after-dip.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForSelector('.home-primary[data-kind="resume"]', { timeout: 20000 }); await page.waitForTimeout(700);
  const home = await page.evaluate(() => document.querySelector('.rd-num')?.innerText);
  say('home ring', home, await HDR(page));
  await tap(await page.$('.home-primary'));
  await page.waitForSelector('.run-screen', { timeout: 20000 }); await page.waitForTimeout(900);
  const h1 = await HDR(page); say('run/page header on resume', h1, 'MATCH', h1.num === home);
  await shot(page, 'resume-page-header.png');
  let mm = await mark(page);
  await armCard(page, mm); await submitUntilContinue(page); await page.waitForTimeout(400);
  say('header after one more clean item', await HDR(page), await READ(page));
  say('errors', errors);
  await ctx.close();
}
async function mockcta(dark) {
  const state = await readFile(path.join(REPO, 'qa', 'screenshots', 'crit-home', 'mockcta-own.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state, dark });
  await page.waitForSelector('.home-primary[data-kind="mock"]', { timeout: 20000 }); await page.waitForTimeout(800);
  const mocks = await page.evaluate(() => [...document.querySelectorAll('a[href="#/mock"], a[href^="#/mock?"], button')].filter(a => (a.getAttribute('href') || '').startsWith('#/mock') || /mock/i.test(a.innerText)).filter(a => a.getBoundingClientRect().height > 0).map(a => ({ t: a.innerText.replace(/\s+/g, ' '), h: Math.round(a.getBoundingClientRect().height) })));
  say(`mock entries (${dark ? 'dark' : 'light'})`, mocks, 'weak', await page.evaluate(() => document.querySelector('.home-weak')?.innerText.replace(/\s+/g, ' ')));
  await shot(page, `mockcta-${dark ? 'dark' : 'light'}-full.png`, true);
  say('errors', errors);
  await ctx.close();
}
async function settingsCmp(file) {
  const state = await readFile(file, 'utf8');
  const a = await open({ route: '#/today', state });
  await a.page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 }); await a.page.waitForTimeout(500);
  const home = await a.page.evaluate(() => document.querySelector('.rd-num')?.innerText);
  await a.ctx.close();
  const b = await open({ route: '#/settings', state });
  await b.page.waitForSelector('.set-now', { timeout: 20000 });
  const card = await b.page.evaluate(() => { const n = document.querySelector('.set-now'); const c = n.closest('section, .card'); c?.scrollIntoView(); return { now: n.innerText.replace(/\s+/g, ' '), text: c?.innerText.replace(/\s+/g, ' ') }; });
  await b.page.waitForTimeout(300);
  say('SETTINGS', card.now, '| HOME', home, '| MATCH', card.now.startsWith(String(home)));
  say('SETTINGS TEXT', card.text);
  await shot(b.page, 'settings-readiness-' + path.basename(file, '.json') + '.png', true);
  await b.ctx.close();
}
try {
  if (mode === 'resume') await resumeHeader();
  else if (mode === 'mockcta-light') await mockcta(false);
  else if (mode === 'mockcta-dark') await mockcta(true);
  else if (mode === 'settings') await settingsCmp(process.argv[3]);
  else if (mode === 'placemix') await placemix();
  else if (mode === 'multi') await multi();
  else if (mode === 'wrongnew') await wrongNew();
  else if (mode === 'hinty') await hinty();
} catch (e) { say('FAIL', e.stack); }
await browser.close(); server.close();
