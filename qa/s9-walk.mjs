// qa/s9-walk.mjs — S9 final-check walkthrough driver (dev only, not part of the artifact). See notes/S9-SCORECARD.md.
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
const OUT = path.join(REPO, 'qa', 'screenshots', 's9');
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
  await page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w, .mock-parts .w', { timeout: 20000 });   // fix5 integrate: the Mock mounts its widgets under .mock-parts (walk mode crashed here)
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

/* ================================================================ walk */
async function walk() {
  const { ctx, page, errors } = await open({ route: '#/' });
  const t0 = Date.now();
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 });
  say('fresh primary', await page.evaluate(() => ({ t: document.querySelector('.home-primary')?.innerText, kind: document.querySelector('.home-primary')?.dataset.kind, href: document.querySelector('.home-primary')?.getAttribute('href') })));
  say('fresh visit landed on', page.url().replace(base, ''), 'in', Date.now() - t0, 'ms', 'title', await page.title());
  await page.waitForTimeout(500);
  await shot(page, 'p-01-fresh.png');
  await probe(page, 'fresh');
  say('fresh text', await text(page, 'main'));
  // onboarding step 1
  await tap(await page.$('.home-primary'));
  await page.waitForSelector('.ob-next', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  say('after CTA url', page.url().replace(base, ''));
  if (!(await page.$('.ob-next'))) { await page.goto(base + '#/onboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(400); }
  await shot(page, 'p-02-onboard1.png', true);
  await probe(page, 'onboard1');
  await tap(await page.$('.ob-next'));
  await page.waitForSelector('.card-screen, .ob-step', { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, 'p-03-onboard2-sandbox.png', true);
  await probe(page, 'onboard2');
  say('step2 text', (await text(page, 'main'))?.slice(0, 300));
  // sandbox: answer it for real if it is a num input (first card answerable without instructions)
  const next2 = await page.$('text=Next: where are you now?');
  await tap(next2);
  await page.waitForSelector('text=Start ·', { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, 'p-04-onboard3-intro.png', true);
  say('intro text', (await text(page, 'main'))?.slice(0, 400));
  let m = await mark(page);
  await page.click('text=Start ·');
  const results = [];
  for (let i = 1; i <= 8; i++) {
    const a = await armCard(page, m);
    say(`placement item ${i}`, a);
    if (i === 1) { await shot(page, 'p-05-place-item1.png'); await probe(page, 'place1'); }
    if (i === 5) { await shot(page, 'p-06-place-item5.png'); }
    const ok = await submitUntilContinue(page);
    const res = await text(page, '.card-result');
    say(`  item ${i} result`, ok, res?.slice(0, 160));
    results.push({ ok, res });
    if (i === 1) { await shot(page, 'p-05b-place-item1-correct.png'); }
    if (!ok) { say('STUCK', await text(page, '.card-parts')); await shot(page, `p-stuck-${i}.png`, true); break; }
    m = await mark(page);
    const cont = await page.$('.card-continue:not([hidden])');
    await tap(cont);
    await page.waitForTimeout(500);
    if (await page.$('text=Placement done')) { say('placement done after item', i); break; }
  }
  await page.waitForSelector('text=Placement done', { timeout: 15000 });
  await page.waitForTimeout(600);
  const sum = await page.evaluate(() => ({ text: document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 700), placement: JSON.parse(localStorage.getItem('u1a.save')).placement }));
  say('placement summary', sum);
  await shot(page, 'p-07-place-summary.png', true);
  await probe(page, 'placeSummary');
  // go to Today
  const today = await page.$('a[href="#/today"]');
  await tap(today);
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 });
  await page.waitForTimeout(700);
  const home = await page.evaluate(() => ({
    hero: document.querySelector('.hero-text')?.innerText.replace(/\s+/g, ' '),
    ring: document.querySelector('#hdr-readiness')?.getAttribute('aria-label'),
    primary: document.querySelector('.home-primary')?.innerText.replace(/\s+/g, ' '),
    primaryKind: document.querySelector('.home-primary')?.dataset.kind,
    weak: document.querySelector('.home-weak')?.innerText.replace(/\s+/g, ' ').slice(0, 300),
    warn: [...document.querySelectorAll('.plan-warn, .warn, [data-warn], .plan-strip')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 200)),
    main: document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 900),
  }));
  say('HOME after ace', home);
  await shot(page, 'p-08-home.png');
  await shot(page, 'p-08-home-full.png', true);
  await probe(page, 'home');
  const saved = await page.evaluate(() => localStorage.getItem('u1a.save'));
  await writeFile(path.join(SCRATCH, 'after-ace.json'), saved);
  await ctx.close();
}
async function walkB() {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state });
  await page.waitForSelector('.home-primary[data-kind="page"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  // Today's Page
  await tap(await page.$('.home-primary'));
  let mm = await mark(page);
  await page.waitForSelector('.run-screen', { timeout: 20000 });
  let item = 0; let summaryReached = false;
  for (let i = 1; i <= 30; i++) {
    if (await page.$('.run-summary')) { summaryReached = true; break; }
    const a = await armCard(page, mm);
    item = i;
    const prog = await text(page, '.run-progress');
    say(`page item ${i}`, prog, a.kinds, a.stem);
    if (i === 1) {
      // S9 #9 keyboard-open: focus the first input, shrink the viewport as an on-screen keyboard would, shoot
      const inp = await page.$('.card-parts input:not([disabled])');
      if (inp) {
        await inp.focus();
        await page.setViewportSize({ width: 375, height: 380 });
        await page.waitForTimeout(400);
        const kb = await page.evaluate(() => { const vis = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= innerHeight }; }; return { input: vis('.card-parts input:focus'), keys: vis('#dock .dock-keys, #dock [class*=keys]'), submit: vis('.card-submit'), kb: document.documentElement.dataset.kb, keyRow: document.querySelector('#dock')?.innerText.replace(/\s+/g, ' ').slice(0, 120) }; });
        say('keyboard-open geometry (375×380)', kb);
        await shot(page, 'p-09-page-item1-keyboard.png');
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
      }
      await shot(page, 'p-09-page-item1.png');
      await probe(page, 'pageItem1');
    }
    if (i === 3) { await shot(page, 'p-10-page-item3.png'); }
    // one deliberate wrong on item 2 to see the one-line teaching (S9 #4) — a num field only
    if (i === 2) {
      const inp = await page.$('.card-parts input:not([disabled])');
      if (inp) {
        await page.evaluate(() => { window.__force = {}; });
        await inp.fill('999'); await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(500);
        say('  wrong-answer line', await text(page, '.card-result'));
        await shot(page, 'p-10-page-item2-wrong.png');
        await armCard(page, mm);
      }
    }
    const ok = await submitUntilContinue(page);
    say(`  item ${i} →`, ok, (await text(page, '.card-result'))?.slice(0, 140));
    if (!ok) { say('STUCK page', await text(page, '.card-parts')); await shot(page, `p-stuck-page-${i}.png`, true); break; }
    mm = await mark(page);
    await tap(await page.$('.card-continue:not([hidden])'));
    await page.waitForTimeout(600);
  }
  if (!summaryReached) { await page.waitForSelector('.run-summary', { timeout: 15000 }).catch(() => {}); summaryReached = !!(await page.$('.run-summary')); }
  say('summary reached', summaryReached, 'after items', item);
  await page.waitForTimeout(300);
  await shot(page, 'p-11-summary-mid.png');
  await page.waitForTimeout(1600);
  const summ = await page.evaluate(() => ({ text: document.querySelector('.run-summary')?.innerText.replace(/\s+/g, ' ').slice(0, 800), tiles: [...document.querySelectorAll('.sum-tiles li')].map(li => ({ r: li.dataset.rarity, foil: li.dataset.foil, sheen: !!li.querySelector('.tile-sheen'), anim: getComputedStyle(li.querySelector('.sum-tile') || li).animationName })), fullscreen: [...document.querySelectorAll('body > *')].filter(e => getComputedStyle(e).position === 'fixed').map(e => e.className) }));
  say('SUMMARY', summ);
  await shot(page, 'p-11-summary.png');
  await shot(page, 'p-11-summary-full.png', true);
  await probe(page, 'summary');
  await writeFile(path.join(SCRATCH, 'after-page.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  // Binder
  await page.goto(base + '#/binder', { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  say('BINDER', (await text(page, 'main'))?.slice(0, 500));
  await shot(page, 'p-12-binder.png'); await shot(page, 'p-12-binder-full.png', true);
  await probe(page, 'binder');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.bnd-tabs button, .bnd-tabs a, [role=tab]')].map(b => b.innerText.replace(/\s+/g, ' ')));
  say('binder tabs', tabs);
  // Mock
  await page.goto(base + '#/mock', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  await shot(page, 'p-13-mock-rules.png', true);
  await probe(page, 'mockRules');
  let mk = await mark(page);
  await page.click('.mock-start'); await page.waitForTimeout(800);
  await page.waitForSelector('main .w', { timeout: 20000 }).catch(async () => say('mock: no .w; main =', (await text(page, 'main'))?.slice(0, 400)));
  say('mock dock', await page.evaluate(() => [...document.querySelectorAll('#dock button, #dock a, .mock-dock button, header button')].map(b => b.className + '|' + b.innerText.replace(/\s+/g, ' ')).slice(0, 12)));
  const mockA = await page.evaluate(() => ({ head: document.querySelector('.mock-head, .boss-head, header.run-head')?.innerText.replace(/\s+/g, ' ').slice(0, 200), clock: document.querySelector('.mock-clock, [class*=clock], [class*=timer]')?.innerText, clockState: document.querySelector('[class*=clock], [class*=timer]')?.dataset.state, stem: document.querySelector('.card-stem')?.innerText.replace(/\s+/g, ' ').slice(0, 100), left: JSON.parse(localStorage.getItem('u1a.save')).inProgress?.endsAt }));
  say('MOCK item 1', mockA);
  await shot(page, 'p-14-mock-item1.png');
  await probe(page, 'mockItem1');
  // answer one item for real via the forced raw + whatever the mock uses to move on
  await armCard(page, mk);
  const nextBtn = await page.$('.mock-next, button:has-text("Next"), .card-continue:not([hidden])');
  say('mock next control', nextBtn ? await nextBtn.evaluate(e => e.className + ' | ' + e.innerText) : null);
  if (nextBtn) { await tap(nextBtn); await page.waitForTimeout(600); say('mock after next', (await text(page, 'main'))?.slice(0, 200)); await shot(page, 'p-14b-mock-item2.png'); }
  // resume-after-kill: reload mid-mock
  const before = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); return { ip: s.inProgress && { kind: s.inProgress.kind, idx: s.inProgress.idx, endsAt: s.inProgress.endsAt, startedAt: s.inProgress.startedAt, deadline: s.inProgress.deadline }, now: Date.now() }; });
  say('mock inProgress before reload', before);
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  say('MOCK after reload', (await text(page, 'main'))?.slice(0, 300));
  await shot(page, 'p-15-mock-resume.png');
  // Settings
  await page.goto(base + '#/settings', { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  const set = await page.evaluate(() => ({ readinessSection: [...document.querySelectorAll('section, .card')].map(s => s.innerText).find(t => /Readiness/.test(t))?.replace(/\s+/g, ' ').slice(0, 600), exportLen: document.querySelector('#set-export')?.value.length, dl: document.querySelector('a[download]')?.getAttribute('download'), dlHref: document.querySelector('a[download]')?.href.slice(0, 30) }));
  say('SETTINGS', set);
  await shot(page, 'p-16-settings.png');
  await page.evaluate(() => document.querySelector('#set-export')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot(page, 'p-16-settings-export.png');
  await shot(page, 'p-16-settings-full.png', true);
  await probe(page, 'settings');
  say('CONSOLE ERRORS (walk)', errors);
  await ctx.close();
}

/* ================================================================ shots */
async function shots() {
  const state = await readFile(path.join(SCRATCH, 'after-page.json'), 'utf8');
  const routes = [['#/today', 'home'], ['#/run/page', 'page'], ['#/binder', 'binder'], ['#/mock', 'mock'], ['#/settings', 'settings'], ['#/card/ang-10', 'ang10'], ['#/card/wp-01', 'wp01'], ['#/stats', 'stats']];
  for (const [w, h, dark, tag] of [[375, 667, true, 'phone-dark'], [1280, 800, false, 'laptop-light'], [1280, 800, true, 'laptop-dark'], [390, 844, false, 'p390'], [768, 1024, false, 'tablet']]) {
    for (const [route, name] of routes) {
      const { ctx, page, errors } = await open({ w, h, dark, state, route, motion: 'reduce' });
      await page.waitForTimeout(800);
      await shot(page, `v-${tag}-${name}.png`);
      const r = await probe(page, `${tag}/${name}`);
      if (errors.length) say(`  errors ${tag}/${name}`, errors);
      await ctx.close();
    }
  }
}

/* ================================================================ offline */
async function offline() {
  const state = await readFile(path.join(SCRATCH, 'after-page.json'), 'utf8');
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + 'version.js'); await page.evaluate(j => localStorage.setItem('u1a.save', j), state);
  await page.goto(base + '#/today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await navigator.serviceWorker.ready; const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; return { active: !!r?.active, controlled: !!navigator.serviceWorker.controller, caches: keys, cached: n }; });
  say('SW', sw);
  await page.waitForTimeout(2500);
  const sw2 = await page.evaluate(async () => { const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; return { cached: n }; });
  say('SW after wait', sw2);
  await ctx.setOffline(true);
  for (const route of ['#/today', '#/binder', '#/card/ang-10', '#/mock', '#/settings', '#/stats', '#/run/page']) {
    await page.goto(base + route, { waitUntil: 'load' }).catch(e => say('nav error', route, e.message));
    await page.waitForTimeout(900);
    const t = await page.evaluate(() => ({ title: document.title, hasScreen: !!document.querySelector('.screen'), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 120) }));
    say('offline', route, t);
    await shot(page, `o-${route.replace(/[^a-z0-9]/gi, '')}.png`);
  }
  say('offline errors', errors.slice(0, 5));
  await ctx.close();
}

/* ================================================================ mock (from after-page.json) */
async function mockWalk() {
  const state = await readFile(path.join(SCRATCH, 'after-page.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/mock', state });
  await page.waitForSelector('.mock-start', { timeout: 20000 });
  let mk = await mark(page);
  await page.click('.mock-start'); await page.waitForTimeout(900);
  await page.waitForSelector('.mock-body .w', { timeout: 20000 });
  const info = async () => page.evaluate(() => ({ clock: document.querySelector('.mock-clock')?.textContent, t: document.querySelector('.mock-clock')?.dataset.t, fs: getComputedStyle(document.querySelector('.mock-clock')).fontSize, count: document.querySelector('.mock-count')?.textContent, label: document.querySelector('.mock-item-label')?.textContent, stem: document.querySelector('.mock-body')?.innerText.replace(/\s+/g, ' ').slice(0, 160), inputs: [...document.querySelectorAll('.mock-body input, .mock-body textarea')].map(i => i.className).slice(0, 6), navs: [...document.querySelectorAll('.mock-nav button')].map(b => b.innerText) }));
  say('MOCK item 1', await info());
  await shot(page, 'p-14-mock-item1.png');
  await probe(page, 'mockItem1');
  // answer item 1: forced-correct raw through the same grade path (the Mock grades on SUBMIT, so just mark it answered)
  const a = await armCard(page, mk).catch(async () => { const r = await page.evaluate((mk) => { const ms = (window.__mounted || []).slice(mk); const force = {}; const kinds = []; for (const { part } of ms) { const parts = part?.type === 'rootcase' ? part.parts : [part]; for (const p of parts) { kinds.push(p.type + ':' + p.id); const r = window.__correctRaw({}, p); if (r != null) force[p.id] = r; } } window.__force = force; return { kinds, force }; }, mk); return r; });
  say('mock item 1 parts', a);
  const inp = await page.$('.mock-body input:not([disabled])');
  if (inp) { await inp.fill('12'); await page.waitForTimeout(300); }
  await page.click('.mock-nav-btn.is-next'); await page.waitForTimeout(700);
  say('MOCK item 2', await info());
  await shot(page, 'p-14b-mock-item2.png');
  const map = await page.evaluate(() => [...document.querySelectorAll('.mock-map-list li')].slice(0, 5).map(li => li.className + '|' + (li.querySelector('.mock-dot')?.dataset.s ?? '') + '|' + li.innerText.replace(/\s+/g, ' ').slice(0, 30)));
  say('map', map);
  // kill the tab mid-mock: reload
  const before = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); const r = (s.runs || []).filter(r => r && !r.submittedAt).pop(); return { kind: r?.kind, idx: r?.idx, startedAt: r?.startedAt, limitMs: r?.limitMs, leftMs: r ? r.startedAt + r.limitMs - Date.now() : null, answers: Object.keys(r?.answers || r?.items || {}).length }; });
  say('inProgress before reload', before);
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  const resume = await page.evaluate(() => ({ text: document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 260), btn: document.querySelector('.mock-start')?.innerText }));
  say('MOCK after reload', resume);
  await shot(page, 'p-15-mock-resume.png');
  if (await page.$('.mock-start')) { await page.click('.mock-start'); await page.waitForTimeout(900); say('MOCK resumed', await info()); await shot(page, 'p-15b-mock-resumed.png'); }
  // timer states: amber ≤ 60 s, pulse ≤ 10 s (font-size must not change)
  for (const [left, name] of [[55000, 'amber'], [8000, 'pulse']]) {
    await page.evaluate((left) => { const s = JSON.parse(localStorage.getItem('u1a.save')); const r = (s.runs || []).filter(r => r && !r.submittedAt).pop(); r.startedAt = Date.now() + left - r.limitMs; localStorage.setItem('u1a.save', JSON.stringify(s)); }, left);
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
    if (await page.$('.mock-start')) { await page.click('.mock-start'); await page.waitForTimeout(1500); }
    const i = await info(); say(`timer ${name}`, i);
    await shot(page, `p-15c-mock-${name}.png`);
  }
  say('mock errors', errors);
  await ctx.close();
  // settings
  const s2 = await open({ route: '#/settings', state });
  await s2.page.waitForTimeout(700);
  const set = await s2.page.evaluate(() => ({ readiness: [...document.querySelectorAll('section, .card, details')].map(s => s.innerText).find(t => /Readiness/.test(t))?.replace(/\s+/g, ' ').slice(0, 700), exportLen: document.querySelector('#set-export')?.value.length, exportHead: document.querySelector('#set-export')?.value.slice(0, 80), dl: document.querySelector('a[download]')?.getAttribute('download'), dlHref: document.querySelector('a[download]')?.href.slice(0, 20), sizeLine: [...document.querySelectorAll('p, span')].map(e => e.innerText).find(t => /KB|bytes|chars/i.test(t || '')) }));
  say('SETTINGS', set);
  await shot(s2.page, 'p-16-settings.png');
  await s2.page.evaluate(() => document.querySelector('#set-export')?.scrollIntoView({ block: 'center' }));
  await s2.page.waitForTimeout(300);
  await shot(s2.page, 'p-16-settings-export.png');
  await shot(s2.page, 'p-16-settings-full.png', true);
  await probe(s2.page, 'settings');
  say('settings errors', s2.errors);
  await s2.ctx.close();
}
try {
  if (mode === 'walk') { await walk(); await walkB(); }
  else if (mode === 'page') await walkB();
  else if (mode === 'mock') await mockWalk();
  else if (mode === 'dip') {
    const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
    const { ctx, page } = await open({ route: '#/today', state });
    await page.waitForSelector('.home-primary[data-kind="page"]', { timeout: 20000 });
    say('home before', await page.evaluate(() => document.querySelector('.hero-text')?.innerText.replace(/\s+/g, ' ')));
    await tap(await page.$('.home-primary')); let mm = await mark(page); await page.waitForSelector('.run-screen', { timeout: 20000 });
    for (let i = 1; i <= 4; i++) { await armCard(page, mm); await submitUntilContinue(page); mm = await mark(page); await tap(await page.$('.card-continue:not([hidden])')); await page.waitForTimeout(500); }
    await page.goto(base + '#/today', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    say('home after 4 clean items, page quit', await page.evaluate(() => ({ hero: document.querySelector('.hero-text')?.innerText.replace(/\s+/g, ' '), weak: document.querySelector('.home-weak')?.innerText.replace(/\s+/g, ' ').slice(0, 200), primary: document.querySelector('.home-primary')?.innerText })));
    await shot(page, 'p-17-home-midpage-dip.png'); await ctx.close();
  }
  else if (mode === 'timer') {
    const state0 = await readFile(path.join(SCRATCH, 'after-page.json'), 'utf8');
    const a = await open({ route: '#/mock', state: state0 });
    await a.page.waitForSelector('.mock-start', { timeout: 20000 }); await a.page.click('.mock-start'); await a.page.waitForTimeout(1500);
    await a.page.click('.mock-nav-btn.is-next'); await a.page.waitForTimeout(1200);
    const mid = await a.page.evaluate(() => localStorage.getItem('u1a.save')); await a.ctx.close();
    await writeFile(path.join(SCRATCH, 'midmock.json'), mid);
    for (const [left, name] of [[55000, 'amber'], [8000, 'pulse']]) {
      const s2 = JSON.parse(mid); const r = (s2.runs || []).filter(r => r && !r.submittedAt).pop(); r.startedAt = Date.now() + left + 4000 - r.limitMs;
      const b = await open({ route: '#/mock', state: JSON.stringify(s2) });
      await b.page.waitForSelector('.mock-start', { timeout: 20000 }); say(name, 'resume btn', await text(b.page, '.mock-start')); await b.page.click('.mock-start'); await b.page.waitForTimeout(4500);
      const i = await b.page.evaluate(() => { const c = document.querySelector('.mock-clock'); const cs = getComputedStyle(c); return { clock: c.textContent, t: c.dataset.t, fs: cs.fontSize, color: cs.color, anim: cs.animationName, w: Math.round(c.getBoundingClientRect().width), count: document.querySelector('.mock-count')?.textContent, live: document.querySelector('.mock-screen [role=status]')?.textContent }; });
      say(`timer ${name}`, i); await shot(b.page, `p-15c-mock-${name}.png`); await b.ctx.close();
    }
  }
  else if (mode === 'contrast') { const state = await readFile(path.join(SCRATCH, 'after-page.json'), 'utf8'); for (const dark of [false, true]) for (const route of ['#/today', '#/card/ang-10', '#/binder', '#/mock', '#/settings', '#/stats', '#/run/page']) { const { ctx, page } = await open({ route, state, dark, motion: 'reduce' }); await page.waitForTimeout(700); const r = await page.evaluate(PROBE); say(`contrast ${dark ? 'dark' : 'light'} ${route}`, { low: r.lowCount, items: r.low.map(x => `${x.t} ${x.ratio} ${x.cls}`) }); await ctx.close(); } }
  else if (mode === 'debug') { const { ctx, page, errors } = await open({ route: '#/' }); await page.waitForTimeout(2500); say('url', page.url(), 'text', await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)), 'screens', await page.evaluate(() => [...document.querySelectorAll('main *')].slice(0,5).map(e => e.tagName + '.' + e.className))); say('errors', errors); await shot(page, 'debug.png'); await ctx.close(); }
  else if (mode === 'shots') await shots();
  else if (mode === 'offline') await offline();
} catch (e) { say('SCRIPT ERROR', String(e?.stack || e)); }
await writeFile(path.join(SCRATCH, `s9-${mode}.log`), log.join('\n'));
await browser.close();
server.close();

