// qa/ship-sessions.mjs — THE SHIP PASS'S THREE REAL SESSIONS. Dev-only; never served.
//
//   node qa/ship-sessions.mjs [--only bank|streak|wrong] [--keep]
//
// Drives the SHIPPED game at 375×667 in chromium, three times, the way a student would:
//
//   A "bank early"  — take the first call, clear it, take the next, clear it, then BANK, then play on.
//   B "long streak" — never bank; push the multiplier as far as the queue allows.
//   C "two wrong"   — miss two questions on purpose and watch what the strip does.
//
// At every beat it screenshots the phone, and records three things that CUT-BRIEF's hard limits are
// about: the strip's three slots verbatim, every digit-run visible on screen with the layer that
// printed it, and the engine's own pile/streak off the save — so the screenshot can never certify
// itself from the thing under test.
//
// The helpers below are `qa/audit-states.mjs`'s, copied rather than imported (that file exports only
// its catalog). Keep them in step if the card widgets change.

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshen } from './fixtures/audit-build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const OUT = path.join(REPO, 'qa', 'screenshots', 'ship');
const require = createRequire(path.join(REPO, 'qa', 'package.json'));
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('--only', 'all');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE)) { res.writeHead(403); res.end('no'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------------------------------------------------------------- the fixture */
const FIX = ['fixtures/audit/midweek.json', 'fixtures/midweek.json']
  .map(f => path.join(REPO, 'qa', f)).find(existsSync);
if (!FIX) throw new Error('no midweek fixture');
const SAVE = JSON.stringify(freshen(JSON.parse(readFileSync(FIX, 'utf8'))));

/* ---------------------------------------------------------------- page driving */
const nap = (page, ms) => page.waitForTimeout(ms);
const has = async (page, sel) => !!(await page.$(sel));
async function tap(page, sel, { wait = 300 } = {}) {
  const el = await page.$(sel);
  if (!el) return false;
  await el.evaluate(e => e.click());
  if (wait) await nap(page, wait);
  return true;
}
const submit = (page) => tap(page, '.card-submit:not([hidden])', { wait: 700 });

async function killServiceWorkers(page) {
  await page.evaluate(async () => {
    if (!navigator.serviceWorker) return;
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister().catch(() => {});
  }).catch(() => {});
}

async function setSave(page) {
  await page.goto(BASE + 'version.js', { waitUntil: 'load' });
  await killServiceWorkers(page);
  await page.evaluate(j => localStorage.setItem('u1a.save', j), SAVE);
}

async function goJob(page) {
  await page.goto(BASE + '#/run/job', { waitUntil: 'networkidle' });
  await page.waitForSelector('.job-screen', { timeout: 20000 }).catch(() => {});
  await nap(page, 500);
}

async function cardLive(page, { timeout = 20000 } = {}) {
  await page.waitForSelector('.card-screen:not([data-state="loading"])', { timeout }).catch(() => {});
  await page.waitForSelector('.card-parts .w, .card-parts .w-field, .card-parts button', { timeout }).catch(() => {});
  await nap(page, 350);
}

const WRONG = ['999', '111', '7', '404'];

/** Every typed answer the live job target wants, read from the app's own card bank. */
function liveCard(page) {
  return page.evaluate(async () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return null; }
    const ip = s?.inProgress;
    const it = Array.isArray(ip?.queue) ? ip.queue[Math.max(0, ip.idx | 0)] : null;
    if (!it?.id) return null;
    let card = null;
    try { card = (await import('/data/cards.js')).byId[it.id] || null; } catch { return null; }
    return { id: it.id, banked: !!card };
  });
}

/** Fill every live text field with a well-formed WRONG value, or tap a wrong chip/option. */
async function attemptWrong(page, attempt = 0) {
  const typed = await page.evaluate((v) => {
    let n = 0;
    for (const inp of document.querySelectorAll('.card-parts .w-field input')) {
      if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
      inp.focus(); inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); n++;
    }
    return n;
  }, WRONG[attempt % WRONG.length]);
  if (typed) return true;
  return page.evaluate(({ i, wrong }) => {
    const q = (s) => [...document.querySelectorAll(`.card-parts ${s}`)].filter(b => !b.disabled && b.getClientRects().length);
    if (document.querySelector('.card-parts .w-nt, .card-parts .w-nt-letters')) {
      [...document.querySelectorAll('.card-parts .w-nt-edit')].find(b => /clear/i.test(b.textContent))?.click();
      const deco = q('.w-nt-deco-btn');
      (deco.find(b => /ray/i.test(b.textContent)) || deco.find(b => /line/i.test(b.textContent)) || deco[0])?.click();
      const ls = q('.w-nt-letter');
      if (!ls.length) return false;
      ls[i % ls.length]?.click(); ls[(i + 2) % ls.length]?.click();
      return true;
    }
    if (document.querySelector('.card-parts .w-cz-slot, .card-parts .w-cz-in')) {
      let filled = 0;
      for (const [k, slot] of [...document.querySelectorAll('.card-parts .w-cz-slot')].entries()) {
        if (slot.disabled || !slot.getClientRects().length) continue;
        slot.click();
        const chips = q('.w-cz-picker .wd-chip');
        if (!chips.length) continue;
        chips[(i + k + 1) % chips.length].click(); filled++;
      }
      for (const inp of document.querySelectorAll('.card-parts .w-cz-in')) {
        if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
        inp.focus(); inp.value = wrong; inp.dispatchEvent(new Event('input', { bubbles: true })); filled++;
      }
      if (filled) return true;
    }
    const pairs = document.querySelector('.card-parts .w-pairs');
    if (pairs) {
      const need = Math.max(1, Number(pairs.dataset.count) || 1);
      const btns = q('.w-pairs-angle');
      if (btns.length >= 2) {
        for (let k = 0; k < need; k++) { btns[(i + 2 * k) % btns.length]?.click(); btns[(i + 2 * k + 1) % btns.length]?.click(); }
        return true;
      }
    }
    for (const sel of ['.wd-opts button', '.w-cls-btn', '.w-asn-btn', '.w-tm-term', '.wd-chip', '.w-pairs-angle', '.w-segbtn']) {
      const btns = q(sel);
      if (btns.length) { btns[(btns.length - 1 - i + btns.length * 2) % btns.length].click(); return true; }
    }
    return false;
  }, { i: attempt, wrong: WRONG[attempt % WRONG.length] });
}

/** Miss the live card until it is finished (3 misses → forced worked solution). No Continue taken. */
async function missOn(page, { max = 5 } = {}) {
  for (let i = 0; i < max; i++) {
    if (await has(page, '.card-continue:not([hidden])')) break;
    if (!(await attemptWrong(page, i))) break;
    if (!(await submit(page))) break;
  }
  return has(page, '.card-continue:not([hidden])');
}

/** Answer the live job target correctly from the card bank. Returns true only if it really cleared. */
async function clearLive(page) {
  const filled = await page.evaluate(async () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return 0; }
    const ip = s?.inProgress;
    const it = Array.isArray(ip?.queue) ? ip.queue[Math.max(0, ip.idx | 0)] : null;
    if (!it?.id) return 0;
    let card = null;
    try { card = (await import('/data/cards.js')).byId[it.id] || null; } catch { return 0; }
    if (!card) return 0;
    let n = 0;
    const set = (inp, v) => { inp.focus(); inp.value = String(v); inp.dispatchEvent(new Event('input', { bubbles: true })); n++; };
    for (const p of card.parts || []) {
      if (p.type === 'num' && p.answer != null) {
        const inp = document.querySelector('.card-parts .w-field input');
        if (inp && !inp.disabled) set(inp, p.answer);
      } else if (p.type === 'multi') {
        for (const f of p.fields || []) {
          const inp = document.querySelector(`.card-parts .w-field[data-key="${f.key}"] input`);
          if (inp && !inp.disabled && f.answer != null) set(inp, f.answer);
        }
      } else if (p.type === 'cloze') {
        for (const [i, b] of (p.blanks || []).entries()) {
          const want = String((b.answers ? b.answers[0] : b.answer) ?? '').trim();
          if (!want) continue;
          const slot = document.querySelector(`.card-parts .w-cz-slot[data-i="${i}"]`);
          if (slot) {
            slot.click();
            const chip = [...document.querySelectorAll('.card-parts .w-cz-picker .wd-chip')]
              .find(c => ((c.dataset.text ?? c.textContent) || '').trim() === want);
            if (chip) { chip.click(); n++; }
            continue;
          }
          const inp = document.querySelector(`.card-parts .w-cz-in[data-i="${i}"]`);
          if (inp && !inp.disabled) set(inp, want);
        }
      } else if (p.type === 'mc' && p.answer != null) {
        const want = String(p.answer).trim();
        const btn = [...document.querySelectorAll('.card-parts .wd-opts button')]
          .find(b => ((b.dataset.value ?? b.textContent) || '').trim() === want);
        if (btn) { btn.click(); n++; }
      }
    }
    return n;
  });
  if (!filled) return false;
  await submit(page);
  return page.evaluate(() => !!document.querySelector('.card-continue:not([hidden])')
    && !!document.querySelector('.card-parts [data-state="ok"]')
    && !document.querySelector('.card-parts [data-state="revealed"]'));
}

/* ---------------------------------------------------------------- what the beat looked like */

const READ = () => {
  const root = document.querySelector('.job-screen');
  const phase = root?.dataset?.phase ?? null;
  const slots = [...document.querySelectorAll('.job-strip .job-slot')].map(s => s.textContent.trim());
  const say = document.querySelector('.job-say')?.textContent?.trim() || null;
  const calls = [...document.querySelectorAll('.job-call')].map(b => ({ label: b.textContent.trim(), off: !!b.disabled }));
  const bank = document.querySelector('.job-bank');
  const quit = document.querySelector('.job-quit');
  const marks = document.querySelector('.job-marks')?.getAttribute('aria-label') || null;
  const skill = document.querySelector('.job-skill')?.textContent?.trim() || null;
  // every digit-run inside a text node whose own rect is on screen, attributed to its layer
  const vw = innerWidth, vh = innerHeight;
  const layerOf = (el) => el.closest('.card-screen') ? 'study'
    : el.closest('#dock') ? (document.querySelector('.job-screen .card-screen') ? 'study' : 'game')
      : el.closest('.job-screen') ? 'game' : 'shell';
  const hidden = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return true;
      if (+cs.opacity === 0) return true;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return true;
      if (/inset\(\s*50%|rect\(0/.test(cs.clipPath || cs.clip || '')) return true;
      const r = n.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return true;
    }
    return false;
  };
  const nums = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const runs = (t.nodeValue || '').match(/\d+/g);
    if (!runs) continue;
    const el = t.parentElement;
    if (!el || hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    for (const run of runs) nums.push({ run, layer: layerOf(el), where: el.className || el.tagName });
  }
  let save = null;
  try { save = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { /* */ }
  const g = save?.inProgress?.game || null;
  return {
    phase, slots, say, calls, skill, marks,
    bank: bank ? { label: bank.textContent.trim(), off: !!bank.disabled } : null,
    quit: quit ? quit.textContent.trim() : null,
    engine: g ? { pile: g.pile ?? null, streak: g.streak ?? null, call: g.call?.id ?? null, answered: g.answered ?? null } : null,
    today: save?.game?.today ?? null,
    nums: { total: nums.length, game: nums.filter(n => n.layer === 'game').length, study: nums.filter(n => n.layer === 'study').length, shell: nums.filter(n => n.layer === 'shell').length, runs: nums.map(n => `${n.run}@${n.layer}`) },
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
};

let shots = 0;
const log = [];
async function beat(page, session, label) {
  const r = await page.evaluate(READ);
  const file = `${session}-${String(++shots).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  const line = { session, label, file, ...r };
  log.push(line);
  const gm = line.nums;
  console.log(`  ${label.padEnd(22)} phase=${String(r.phase).padEnd(7)} strip=[${r.slots.join(' | ')}]${r.say ? ` say="${r.say}"` : ''} engine=${r.engine ? `pile ${r.engine.pile} ×${r.engine.streak}` : '—'} nums ${gm.total} (game ${gm.game}/study ${gm.study}/shell ${gm.shell})${r.overflow ? '  ⚠ H-OVERFLOW' : ''}`);
  return r;
}

/** Lock a call by index among the ENABLED ones (0 = cheapest). Waits out the flip. */
async function call(page, which = 0, timeout = 20000) {
  await page.waitForSelector('.job-call:not([disabled])', { timeout }).catch(() => {});
  const btns = await page.$$('.job-call:not([disabled])');
  if (!btns.length) return null;
  const i = Math.min(which, btns.length - 1);
  const label = (await btns[i].textContent()).trim();
  await btns[i].evaluate(e => e.click());
  return label;
}

/* ---------------------------------------------------------------- the sessions */

async function session(browser, name, play) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 }, deviceScaleFactor: 2,
    colorScheme: 'light', reducedMotion: 'no-preference', serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  console.log(`\n=== SESSION ${name} ===`);
  await setSave(page);
  await goJob(page);
  await play(page);
  if (errors.length) console.log('  console errors:', errors.slice(0, 6));
  else console.log('  console errors: none');
  await ctx.close();
  return errors;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const allErrors = [];

/* --- A: bank early ------------------------------------------------------- */
if (ONLY === 'all' || ONLY === 'bank') {
  allErrors.push(...await session(browser, 'bank', async (page) => {
    await beat(page, 'bank', 'facedown-1');
    for (let q = 1; q <= 2; q++) {
      const c = await call(page);
      await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
      await beat(page, 'bank', `q${q}-question-${(c || '').replace(/\s+/g, '')}`);
      const ok = await clearLive(page);
      if (!ok) await missOn(page);
      await beat(page, 'bank', `q${q}-graded-${ok ? 'right' : 'wrong'}`);
      await tap(page, '.card-continue:not([hidden])', { wait: 900 });
      await beat(page, 'bank', `q${q}-after-continue`);
    }
    // THE BANK
    const banked = await tap(page, '.job-bank:not([disabled])', { wait: 400 });
    await beat(page, 'bank', banked ? 'banked-receipt' : 'bank-refused');
    await nap(page, 2600);
    await beat(page, 'bank', 'after-receipt');
    // play one more so the reset is visible on a real card
    const c = await call(page);
    await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
    await cardLive(page);
    await beat(page, 'bank', `q3-question-${(c || '').replace(/\s+/g, '')}`);
  }));
}

/* --- B: push to a long streak -------------------------------------------- */
if (ONLY === 'all' || ONLY === 'streak') {
  allErrors.push(...await session(browser, 'streak', async (page) => {
    await beat(page, 'streak', 'facedown-1');
    let best = 1;
    for (let q = 1; q <= 12; q++) {
      const phase = await page.evaluate(() => document.querySelector('.job-screen')?.dataset?.phase);
      if (phase === 'over' || phase == null) break;
      const info = await liveCard(page);
      const c = await call(page, 2);                 // the dearest call the pile covers
      await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
      const ok = info?.banked ? await clearLive(page) : false;
      if (!ok) await missOn(page);
      await tap(page, '.card-continue:not([hidden])', { wait: 900 });
      const r = await beat(page, 'streak', `q${q}-${ok ? 'right' : 'wrong'}-${c ? c.replace(/\s+/g, '') : 'nocall'}`);
      if (r.engine?.streak > best) best = r.engine.streak;
      if (r.phase === 'over') break;
    }
    console.log(`  best streak reached: ×${best}`);
  }));
}

/* --- C: two wrong answers ------------------------------------------------ */
if (ONLY === 'all' || ONLY === 'wrong') {
  allErrors.push(...await session(browser, 'wrong', async (page) => {
    await beat(page, 'wrong', 'facedown-1');
    // build a pile first so a miss has something to take
    for (let q = 1; q <= 3; q++) {
      const info = await liveCard(page);
      if (!info?.banked) { // skip past a question the harness cannot clear
        await call(page); await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
        await cardLive(page); await missOn(page); await tap(page, '.card-continue:not([hidden])', { wait: 900 });
        continue;
      }
      await call(page, 2);
      await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
      const ok = await clearLive(page);
      if (!ok) await missOn(page);
      await tap(page, '.card-continue:not([hidden])', { wait: 900 });
      await beat(page, 'wrong', `build-q${q}-${ok ? 'right' : 'wrong'}`);
    }
    for (let m = 1; m <= 2; m++) {
      const phase = await page.evaluate(() => document.querySelector('.job-screen')?.dataset?.phase);
      if (phase === 'over' || phase == null) break;
      await beat(page, 'wrong', `miss${m}-facedown`);
      const c = await call(page, 2);
      await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
      await beat(page, 'wrong', `miss${m}-question-${(c || '').replace(/\s+/g, '')}`);
      await missOn(page);
      await beat(page, 'wrong', `miss${m}-graded-wrong`);
      await tap(page, '.card-continue:not([hidden])', { wait: 1200 });
      await beat(page, 'wrong', `miss${m}-after-continue`);
    }
  }));
}

/* --- D: play a session to the END PANEL --------------------------------- */
/* The end panel is the only surface that prints the MEASURED split, and a full Today's Page is
   11 questions of which the harness can clear only the bank-backed ones. So the queue is trimmed to
   three bank-backed questions — the audit catalog's own `trimJob` trick — and played out. The
   questions are the composer's, in the composer's order; only the LENGTH is the harness's. */
if (ONLY === 'all' || ONLY === 'end') {
  allErrors.push(...await session(browser, 'end', async (page) => {
    await page.goto(BASE + 'version.js', { waitUntil: 'load' });
    await killServiceWorkers(page);
    const trimmed = await page.evaluate(async (k) => {
      let s = null;
      try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return false; }
      const q = s?.inProgress?.queue;
      if (!Array.isArray(q) || q.length <= k) return false;
      let byId = null;
      try { byId = (await import('/data/cards.js')).byId; } catch { byId = null; }
      const banked = byId ? q.filter(it => it && byId[it.id]) : [];
      const rest = byId ? q.filter(it => !(it && byId[it.id])) : q.slice();
      const kept = [...banked, ...rest].slice(0, k);
      if (kept.length < k) return false;
      s.inProgress.queue = kept;
      if (s.inProgress.idx != null) s.inProgress.idx = 0;
      localStorage.setItem('u1a.save', JSON.stringify(s));
      return { kept: kept.map(it => it.id), clearable: !!(byId && byId[kept[k - 1]?.id]) };
    }, 3);
    console.log('  trimmed queue:', JSON.stringify(trimmed));
    await goJob(page);
    for (let q = 1; q <= 4; q++) {
      const phase = await page.evaluate(() => document.querySelector('.job-screen')?.dataset?.phase);
      if (phase === 'over' || phase == null) break;
      await call(page, 2);
      await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
      const ok = await clearLive(page);
      if (!ok) await missOn(page);
      await tap(page, '.card-continue:not([hidden])', { wait: 1100 });
      await beat(page, 'end', `q${q}`);
    }
    await beat(page, 'end', 'panel');
    const text = await page.evaluate(() => document.querySelector('.job-over')?.innerText || null);
    console.log('  end panel text:', JSON.stringify(text));
  }));
}

/* --- E: COLD OPEN → FIRST ANSWERABLE QUESTION (COMPOSED S9 #1) ----------- */
/* `qa/job-walk.mjs` measured this and was deleted with the old layer, so S9 #1's headline clause had
   no measurement left. A fresh context, empty HTTP cache, service workers blocked: navigate to
   `#/today`, tap Home's own primary, and stop the clock when a widget on the first card is live.
   Machine time only — the budget in S9 #1 is 20 s for a human doing the same thing. */
if (ONLY === 'all' || ONLY === 'cold') {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 }, deviceScaleFactor: 2,
    colorScheme: 'light', reducedMotion: 'no-preference', serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  console.log('\n=== SESSION cold (S9 #1) ===');
  await setSave(page);                                   // a real student's save, not a fresh one
  const t0 = Date.now();
  await page.goto(BASE + '#/today', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home-primary:not([aria-busy="true"])', { timeout: 20000 })
    .catch(() => { throw new Error('Home never painted a ready primary in 20 s'); });
  const tHome = Date.now() - t0;
  const spinners = await page.evaluate(() => document.querySelectorAll('.spinner, [aria-busy="true"], .loading').length);
  const primary = await page.evaluate(() => {
    const el = document.querySelector('.home-primary');
    return el ? { text: el.textContent.trim().replace(/\s+/g, ' '), href: el.getAttribute('href') } : null;
  });
  await tap(page, '.home-primary', { wait: 0 });
  await page.waitForSelector('.job-screen .job-call:not([disabled]), .card-parts .w', { timeout: 20000 }).catch(() => {});
  const tDecision = Date.now() - t0;
  /* THE FIRST QUESTION OF A SESSION IS BIDLESS (`job/pay.js decides` is false at an empty pile —
     CUT-SPEC §1), so there is no call to lock and `call()`'s own 20 s wait WAS the whole reading:
     this printed `20 103 ms` on a cold open whose answerable question was already on screen at
     94 ms. Lock a call only if one is actually mounted — the wait above has already resolved on
     whichever of the two arrived, so the DOM is settled when this is read. */
  if (await page.$('.job-call:not([disabled])')) await call(page, 0, 2000);
  await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.card-parts .w, .card-parts .w-field, .card-parts button', { timeout: 20000 }).catch(() => {});
  const tAnswerable = Date.now() - t0;
  await page.screenshot({ path: path.join(OUT, 'cold-first-answerable.png') });
  console.log(`  home painted ${tHome} ms · spinners ${spinners} · primary ${JSON.stringify(primary)}`);
  console.log(`  first decision on screen ${tDecision} ms · first ANSWERABLE question ${tAnswerable} ms (budget 20 000)`);
  console.log(`  page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`);
  allErrors.push(...errors);
  await ctx.close();
}

await browser.close();
server.close();
await writeFile(path.join(OUT, 'sessions.json'), JSON.stringify(log, null, 1));
console.log(`\n${shots} screenshots → qa/screenshots/ship/`);
const over3 = log.filter(l => l.nums.game > 3 && l.phase !== 'over');
console.log(`beats where the GAME printed more than 3 numerals during play: ${over3.length}`);
for (const l of over3) console.log(`  ${l.file}: ${l.nums.runs.filter(r => r.endsWith('@game')).join(' ')}`);
const hOver = log.filter(l => l.overflow);
console.log(`beats with horizontal overflow: ${hOver.length}`);
console.log(`console errors across all sessions: ${allErrors.length}`);
