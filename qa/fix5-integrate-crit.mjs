// qa/crit-home-r3.mjs — critic r3 (lane home) independent scenarios; helpers copied from qa/fix5-home-r3b.mjs.
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
const OUT = path.join(REPO, 'qa', 'screenshots', 'fix5-integrate');
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
async function hdr(page) { return page.evaluate(() => document.querySelector('#hdr-readiness')?.innerText.trim()); }
/* A: wrong OPTIONAL setup then a correct first-try clear on ang-10 (FIG-ALG, untested after the ace) */
async function setupWrong(dark = false) {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state, dark });
  await page.waitForTimeout(1000);
  const r0 = await READ(page); say('START', r0, await HOME(page));
  let mk = await mark(page);
  await page.goto(base + '#/card/ang-10', { waitUntil: 'networkidle' });
  const a = await armCard(page, mk);
  say('kinds', a.kinds, 'force', a.force);
  await page.evaluate(() => { window.__force.setup = 'x + 3 = 7'; });
  const inp = await page.$('.card-part[data-optional="true"] input, .card-part[data-optional="true"] [contenteditable], .card-part[data-optional="true"] textarea');
  say('setup input found', !!inp);
  if (inp) { await inp.focus(); await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(700); }
  say('after setup submit', (await text(page, '.card-part[data-optional="true"]'))?.slice(0, 160));
  await shot(page, `setupwrong-graded${dark ? '-dark' : ''}.png`);
  await page.evaluate((f) => { window.__force.setup = f; const b = document.activeElement; if (b) b.blur(); }, a.force.setup);
  const ok = await submitUntilContinue(page);
  const res = (await text(page, '.card-result'))?.slice(0, 200);
  say('cleared?', ok, res, 'hdr', await hdr(page));
  const sv = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); return { card: s.cards['ang-10'], errors: s.errors, fig: s.skills['FIG-ALG'], qs: s.skills['QUAD-SOLVE'] }; });
  say('save', sv);
  await shot(page, `setupwrong-card${dark ? '-dark' : ''}.png`);
  const r1 = await READ(page); const hm = await HOME(page);
  say('AFTER', r1, hm, r1.r < r0.r || r1.M < r0.M ? 'DROP!!!' : 'no drop');
  const weakEl = await page.$('.home-weak'); if (weakEl) { await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  await shot(page, `setupwrong-home${dark ? '-dark' : ''}.png`);
  await writeFile(path.join(OUT, 'setupwrong.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  say('errors', errors);
  await ctx.close();
}
/* B: idle 5 days after the ace, open the Page directly (tab restored on #/run/page), answer one clean item */
async function idleDirect() {
  const s = JSON.parse(await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8'));
  const back = 5 * 86400000;
  for (const k of Object.keys(s.skills)) { s.skills[k].lastAt -= back; s.skills[k].placedAt -= back; }
  const { ctx, page, errors } = await open({ route: '#/run/page', state: JSON.stringify(s) });
  await page.waitForSelector('.run-screen', { timeout: 20000 }); await page.waitForTimeout(900);
  const r0 = await READ(page); const h0 = await hdr(page); say('START direct run/page', r0, 'hdr', h0);
  let mm = 0;
  await armCard(page, mm); const ok = await submitUntilContinue(page); await page.waitForTimeout(500);
  const r1 = await READ(page); const h1 = await hdr(page);
  say('after 1 clean item', ok, (await text(page, '.card-result'))?.slice(0, 90), r1, 'hdr', h1, (+h1 < +h0) ? 'HEADER DROP!!!' : 'no header drop');
  await shot(page, 'idle-direct-after1.png');
  say('errors', errors);
  await ctx.close();
}
/* C: wrong answer on a new skill (not asn-01, which the fixer used): voc-01 */
async function wrongOther(id = 'cls-01') {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForTimeout(1000);
  say('START', await READ(page));
  let mk = await mark(page);
  await page.goto(base + '#/card/' + id, { waitUntil: 'networkidle' });
  const a = await armCard(page, mk);
  say('kinds', a.kinds, a.force);
  await page.evaluate(() => { for (const k of Object.keys(window.__force)) { const v = window.__force[k]; if (typeof v === 'number') window.__force[k] = v + 7; else if (typeof v === 'string' && /^-?\d+$/.test(v)) window.__force[k] = String(+v + 7); else if (typeof v === 'string' && /^[ASN]$/.test(v)) window.__force[k] = v === 'A' ? 'N' : 'A'; else if (typeof v === 'string') window.__force[k] = v === 'acute' ? 'obtuse' : 'acute'; } });
  await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(700);
  say('wrong result', (await text(page, '.card-result'))?.slice(0, 120), (await text(page, '.card-parts'))?.slice(0, 120));
  const r = await READ(page); say('after wrong', r, await HOME(page));
  const weakEl = await page.$('.home-weak'); if (weakEl) { await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
  await shot(page, `wrong-${id}-weak.png`);
  say('errors', errors);
  await ctx.close();
}
async function mockOwn(dark) {
  const s = JSON.parse(await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8'));
  const today = await (async () => { const d = new Date(); return d.toISOString().slice(0, 10); })();
  const { ctx: c0, page: p0 } = await open({ route: 'version.js' });
  const iso = await p0.evaluate(async () => (await import('/js/days.js')).todayISO()); await c0.close();
  s.daily = s.daily || {}; s.daily[iso] = { xp: 520, clears: 12, goalMet: true, mockDone: false };
  const state = JSON.stringify(s);
  await writeFile(path.join(OUT, 'mock-own.json'), state);
  const { ctx, page, errors } = await open({ route: '#/today', state, dark });
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 }); await page.waitForTimeout(900);
  const info = await page.evaluate(() => ({ kind: document.querySelector('.home-primary')?.dataset.kind,
    mocks: [...document.querySelectorAll('a, button')].filter(a => ((a.getAttribute('href') || '').startsWith('#/mock') || /mock/i.test(a.innerText))).filter(a => a.getBoundingClientRect().height > 0).map(a => ({ t: a.innerText.replace(/\s+/g, ' '), h: Math.round(a.getBoundingClientRect().height), w: Math.round(a.getBoundingClientRect().width), inMain: !!a.closest('main') })),
    small: [...document.querySelectorAll('main a, main button')].filter(a => { const r = a.getBoundingClientRect(); return r.height > 0 && (r.height < 44 || r.width < 44); }).map(a => a.innerText.replace(/\s+/g, ' ').slice(0, 30) + ' ' + Math.round(a.getBoundingClientRect().width) + 'x' + Math.round(a.getBoundingClientRect().height)),
    overflow: document.documentElement.scrollWidth > innerWidth,
    lore: (document.body.innerText.match(/Lexicon|Figure Recon|Comp\/Supp|Bisector Verdicts|ASN Arena|Factor Forge|Forge/g) || []) }));
  say(`MOCK OWN ${dark ? 'dark' : 'light'}`, info);
  await shot(page, `mock-own-${dark ? 'dark' : 'light'}-full.png`, true);
  say('errors', errors);
  await ctx.close();
}
try {
  if (mode === 'mockown') await mockOwn(process.argv[3] === 'dark');
  else if (mode === 'setupwrong') await setupWrong(process.argv[3] === 'dark');
  else if (mode === 'idle') await idleDirect();
  else if (mode === 'wrong') await wrongOther(process.argv[3]);
} catch (e) { say('FAIL', e.stack); }
await browser.close(); server.close();
