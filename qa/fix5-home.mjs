// qa/fix5-home.mjs — fix5 lane home checks (prelude copied from qa/s9-walk.mjs): S9 final-check walkthrough driver (dev only, not part of the artifact). See notes/S9-SCORECARD.md.
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
const OUT = path.join(REPO, 'qa', 'screenshots', 'fix5-home');
const SCRATCH = path.join(REPO, 'qa', 'screenshots', 'fix5-home');   // state json + logs land beside the PNGs (git-ignored)
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

/* ================================================================ fix5 home scenarios */
const homeText = (page) => page.evaluate(() => ({
  ring: document.querySelector('.rd-num')?.innerText, hero: document.querySelector('.hero-text')?.innerText.replace(/\s+/g, ' '),
  weak: document.querySelector('.home-weak')?.innerText.replace(/\s+/g, ' ').slice(0, 240), primary: document.querySelector('.home-primary')?.innerText,
  mockEntries: [...document.querySelectorAll('main a[href="#/mock"], main a[href^="#/mock?"]')].filter(a => a.getBoundingClientRect().height > 0).map(a => ({ t: a.innerText.replace(/\s+/g, ' '), h: Math.round(a.getBoundingClientRect().height), cls: a.className })),
}));

/** From after-ace: answer page items correctly until one on an UNTESTED skill takes a typed input; answer that one wrong, quit. */
async function wrongOnNewSkill() {
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page } = await open({ route: '#/today', state });
  await page.waitForSelector('.home-primary[data-kind="page"]', { timeout: 20000 });
  say('home before', await homeText(page));
  await tap(await page.$('.home-primary')); let mm = await mark(page); await page.waitForSelector('.run-screen', { timeout: 20000 });
  let wrongOn = null;
  for (let i = 1; i <= 13 && !wrongOn; i++) {
    const a = await armCard(page, mm);
    const cur = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); const ip = s.inProgress; const it = ip.queue[ip.idx]; return { id: it.id, skills: it.skills, ns: it.skills.map(k => s.skills[k]?.n ?? 0) }; });
    if (cur.ns.every(n => n === 0)) {
      // turn the forced-correct raw into a well-formed WRONG one (a number + 7, another mc option)
      const w = await page.evaluate((mark) => {
        const out = {}; const info = [];
        for (const { part } of (window.__mounted || []).slice(mark)) {
          const r = window.__force?.[part.id];
          info.push({ type: part.type, keys: Object.keys(part), r });
          if (typeof r === 'number') out[part.id] = r + 7;
          else if (typeof r === 'string' && /^-?\d+(\.\d+)?$/.test(r)) out[part.id] = String(Number(r) + 7);
          else if (part.type === 'mc') {
            const opts = part.distractors || part.choices || part.options || [];
            const vals = opts.map((x, i) => (x && typeof x === 'object' ? (x.id ?? x.key ?? x.value ?? i) : x));
            const o = vals.find(v => JSON.stringify(v) !== JSON.stringify(r));
            if (o !== undefined) out[part.id] = o;
          }
        }
        if (Object.keys(out).length) window.__force = { ...window.__force, ...out };
        return { out, info };
      }, mm);
      say('wrong attempt', cur, w);
      if (Object.keys(w.out).length) {
        await tap(await page.$('.card-submit:not([hidden])')); await page.waitForTimeout(700);
        say('WRONG on', cur, await text(page, '.card-result'));
        wrongOn = cur; break;
      }
    }
    say('clean on', cur, a.kinds);
    await submitUntilContinue(page); mm = await mark(page); await tap(await page.$('.card-continue:not([hidden])')); await page.waitForTimeout(500);
  }
  await page.goto(base + '#/today', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
  const h = await homeText(page);
  say('home after one wrong on a new skill', h, 'skills', await page.evaluate((ids) => { const s = JSON.parse(localStorage.getItem('u1a.save')); return Object.fromEntries(ids.map(k => [k, s.skills[k]])); }, wrongOn?.skills ?? []));
  const weakEl = await page.$('.home-weak');
  if (weakEl) await weakEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, 'after-wrong-new-skill-weak.png');
  await ctx.close();
}

async function mockCta(dark) {
  const state = await readFile(path.join(SCRATCH, 'mock-cta.json'), 'utf8');
  const { ctx, page, errors } = await open({ route: '#/today', state, dark });
  await page.waitForSelector('.home-primary[data-kind="mock"]', { timeout: 20000 });
  await page.waitForTimeout(700);
  say(`mock CTA ${dark ? 'dark' : 'light'}`, await homeText(page));
  await shot(page, `after-mock-cta-${dark ? 'dark' : 'light'}.png`);
  await probe(page, 'mockcta');
  say('errors', errors);
  await ctx.close();
}

async function settingsVsHome() {
  const state = await readFile(path.join(SCRATCH, 'after-dip.json'), 'utf8');
  const a = await open({ route: '#/today', state });
  await a.page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 });
  const home = (await homeText(a.page)).ring;
  await a.ctx.close();
  const b = await open({ route: '#/settings', state });
  await b.page.waitForSelector('.set-now', { timeout: 20000 });
  const card = await b.page.evaluate(() => { const n = document.querySelector('.set-now'); n.closest('section, .card')?.scrollIntoView(); return { now: n.innerText.replace(/\s+/g, ' '), card: n.closest('section, .card')?.innerText.replace(/\s+/g, ' ').slice(0, 900) }; });
  await b.page.waitForTimeout(300);
  say('settings readiness', card, 'home ring', home, 'MATCH', card.now.startsWith(String(home)));
  await shot(b.page, 'after-settings-readiness.png');
  await b.ctx.close();
}

async function dipSave() {
  // the dip mode's end state, saved for settingsVsHome
  const state = await readFile(path.join(SCRATCH, 'after-ace.json'), 'utf8');
  const { ctx, page } = await open({ route: '#/today', state });
  await page.waitForSelector('.home-primary[data-kind="page"]', { timeout: 20000 });
  await tap(await page.$('.home-primary')); let mm = await mark(page); await page.waitForSelector('.run-screen', { timeout: 20000 });
  for (let i = 1; i <= 4; i++) { await armCard(page, mm); await submitUntilContinue(page); mm = await mark(page); await tap(await page.$('.card-continue:not([hidden])')); await page.waitForTimeout(500); }
  await page.goto(base + '#/today', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  say('dip home', await homeText(page));
  await writeFile(path.join(SCRATCH, 'after-dip.json'), await page.evaluate(() => localStorage.getItem('u1a.save')));
  const weakEl = await page.$('.home-weak'); if (weakEl) await weakEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await shot(page, 'after-dip-weak.png');
  await ctx.close();
}

async function placeWalk() {
  const { ctx, page, errors } = await open({ route: '#/' });
  const t0 = Date.now();
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 });
  say('fresh primary', await page.evaluate(() => ({ t: document.querySelector('.home-primary')?.innerText, kind: document.querySelector('.home-primary')?.dataset.kind, href: document.querySelector('.home-primary')?.getAttribute('href') })));
  say('fresh visit landed on', page.url().replace(base, ''), 'in', Date.now() - t0, 'ms', 'title', await page.title());
  await page.waitForTimeout(500);
  await shot(page, 'place-p-01-fresh.png');
  await probe(page, 'fresh');
  say('fresh text', await text(page, 'main'));
  // onboarding step 1
  await tap(await page.$('.home-primary'));
  await page.waitForSelector('.ob-next', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  say('after CTA url', page.url().replace(base, ''));
  if (!(await page.$('.ob-next'))) { await page.goto(base + '#/onboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(400); }
  await shot(page, 'place-p-02-onboard1.png', true);
  await probe(page, 'onboard1');
  await tap(await page.$('.ob-next'));
  await page.waitForSelector('.card-screen, .ob-step', { timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, 'place-p-03-onboard2-sandbox.png', true);
  await probe(page, 'onboard2');
  say('step2 text', (await text(page, 'main'))?.slice(0, 300));
  // sandbox: answer it for real if it is a num input (first card answerable without instructions)
  const next2 = await page.$('text=Next: where are you now?');
  await tap(next2);
  await page.waitForSelector('text=Start ·', { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, 'place-p-04-onboard3-intro.png', true);
  say('intro text', (await text(page, 'main'))?.slice(0, 400));
  let m = await mark(page);
  await page.click('text=Start ·');
  const results = [];
  for (let i = 1; i <= 8; i++) {
    const a = await armCard(page, m);
    say(`placement item ${i}`, a);
    if (i === 1) { await shot(page, 'place-p-05-place-item1.png'); await probe(page, 'place1'); }
    if (i === 5) { await shot(page, 'place-p-06-place-item5.png'); }
    const ok = await submitUntilContinue(page);
    const res = await text(page, '.card-result');
    say(`  item ${i} result`, ok, res?.slice(0, 160));
    results.push({ ok, res });
    if (i === 1) { await shot(page, 'place-p-05b-place-item1-correct.png'); }
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
  await shot(page, 'place-p-07-place-summary.png', true);
  await probe(page, 'placeSummary');
  const lore = /Lexicon|Figure Recon|Comp\/Supp Sprint|Bisector Verdicts|ASN Arena|Factor Forge/g;
  const txt = await page.evaluate(() => document.body.innerText);
  say('LORE HITS in placement summary', (txt.match(lore) || []).length, txt.match(lore) || []);
  say('summary placed line', await page.evaluate(() => [...document.querySelectorAll('.ob-card p')].map(p => p.innerText.replace(/\s+/g, ' '))));
  await ctx.close();
}

try {
  if (mode === 'place') await placeWalk();
  else if (mode === 'wrong') await wrongOnNewSkill();
  else if (mode === 'mock-light') await mockCta(false);
  else if (mode === 'mock-dark') await mockCta(true);
  else if (mode === 'dipsave') await dipSave();
  else if (mode === 'settings') await settingsVsHome();
  else say('modes: wrong | mock-light | mock-dark | dipsave | settings');
} catch (e) { say('ERROR', e.stack); }
finally { await browser.close(); server.close(); }
