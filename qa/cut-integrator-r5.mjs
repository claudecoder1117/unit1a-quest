// qa/cut-integrator-r5.mjs — THE INTEGRATOR'S TWO COUNTS, round 5. Dev-only, never served.
//
//   node qa/cut-integrator-r5.mjs
//
// Round 4's probe (`qa/cut-integrator.mjs`) reads ONE PAINT per state, on saves seeded with the
// engine's verbs. Round 5 added four beats that live BETWEEN paints — the settle's two halves, the
// loss hold, the withdrawn third slot and the bank receipt — so a per-state reading can no longer
// see the worst frame. This probe does the other half:
//
//   * ONE REAL SESSION, played by clicking what a student clicks (call → Submit → Continue), on the
//     shipped build, at 390×844. Nothing is seeded except the fixture save itself.
//   * A SAMPLER INSIDE THE PAGE, every 40 ms, that records the count of visible digit-runs
//     ATTRIBUTED TO THE LAYER THAT DREW THEM. It keeps a row whenever the signature changes, so
//     every distinct frame the session painted is in the log — flips, holds, receipts and all.
//   * EVERY CLICK IS COUNTED AND ATTRIBUTED, so "taps per question" is a measurement, not a reading
//     of the source.
//
// THE COUNTING CONVENTION, stated so it can be argued with. CUT-BRIEF's limit is on the GAME:
// "at most three numbers on screen at once during play: the pile, the streak multiplier, and what
// the current question pays". A geometry question has numerals in its stem, the grader prints
// `+19 XP`, and both are there byte-identically on `#/run/page` with the game switched off — so the
// game's limit is measured on the game's own surfaces, and the study layer's numerals are reported
// beside them rather than hidden. `layerOf` is `qa/ship-sessions.mjs`'s, copied verbatim.
//
// TAPS. The game's own tap is the call. The study card's Submit and its Continue are COMPOSED's,
// unchanged and present on `#/run/page`; the probe prints all three counts and lets the reader see
// which layer charged them.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshen } from './fixtures/audit-build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const require = createRequire(path.join(REPO, 'qa', 'package.json'));
const { chromium } = require('playwright');

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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const FIX = ['fixtures/audit/midweek.json', 'fixtures/midweek.json']
  .map((f) => path.join(REPO, 'qa', f)).find(existsSync);
if (!FIX) throw new Error('no midweek fixture');
const SAVE = JSON.stringify(freshen(JSON.parse(readFileSync(FIX, 'utf8'))));

/* ------------------------------------------------------------------ the in-page sampler */

const SAMPLER = () => {
  if (window.__r5) return;
  const vis = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (+cs.opacity === 0) return false;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return false;
      if (/inset\(\s*50%|rect\(0/.test(cs.clipPath || cs.clip || '')) return false;
      const r = n.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
    }
    return true;
  };
  /* qa/ship-sessions.mjs's attribution, verbatim: the dock belongs to whichever layer is using it. */
  const layerOf = (el) => (el.closest('.card-screen') ? 'study'
    : el.closest('#dock') ? (document.querySelector('.job-screen .card-screen') ? 'study' : 'game')
      : el.closest('.job-screen') ? 'game' : 'shell');
  const read = () => {
    const root = document.querySelector('.job-screen');
    const vw = innerWidth; const vh = innerHeight;
    const game = []; const study = []; const shell = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const runs = (t.nodeValue || '').match(/\d+/g);
      if (!runs) continue;
      const el = t.parentElement;
      if (!el || !vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      const bag = { game, study, shell }[layerOf(el)];
      for (const run of runs) bag.push(run);
    }
    const strip = [...document.querySelectorAll('.job-strip .job-slot')]
      .map((s) => `${(s.querySelector('.job-slot-v')?.textContent || '').trim()}${(s.querySelector('.job-slot-k')?.textContent || '').trim()}`);
    const liveCalls = [...document.querySelectorAll('.job-call')].filter((b) => !b.disabled).length;
    const bankEl = document.querySelector('.job-bank');
    return {
      t: Math.round(performance.now()),
      phase: root?.dataset?.phase ?? (root ? '?' : 'none'),
      game, study, shell,
      strip,
      say: document.querySelector('.job-say')?.textContent?.trim() || '',
      card: !!document.querySelector('.job-face-down'),
      question: !!document.querySelector('.job-screen .card-screen'),
      calls: document.querySelectorAll('.job-call').length,
      liveCalls,
      bank: bankEl ? (bankEl.disabled ? 'greyed' : 'live') : 'absent',
      levelup: !!document.querySelector('.levelup-card'),
    };
  };
  window.__r5 = { rows: [], last: '' };
  const tick = () => {
    let r = null;
    try { r = read(); } catch { return; }
    const sig = `${r.phase}|${r.game.join(',')}|${r.study.length}|${r.shell.join(',')}|${r.strip.join('|')}|${r.say}|${r.card}|${r.liveCalls}|${r.bank}|${r.levelup}`;
    if (sig === window.__r5.last) return;
    window.__r5.last = sig;
    window.__r5.rows.push(r);
  };
  setInterval(tick, 40);
};

/* ------------------------------------------------------------------ driving, and counting taps */

const TAPS = [];
const nap = (page, ms) => page.waitForTimeout(ms);
const has = async (page, sel) => !!(await page.$(sel));

async function click(page, sel, { label = sel, owner = null, wait = 250 } = {}) {
  const el = await page.$(sel);
  if (!el) return false;
  await el.evaluate((e) => e.click());
  TAPS.push({ q: QN, owner: owner || (sel.startsWith('.job-') ? 'game' : 'study'), label });
  if (wait) await nap(page, wait);
  return true;
}

let QN = 0;

/** The three calls, cheapest first among the ENABLED ones. */
async function call(page, which = 0) {
  const btns = await page.$$('.job-call:not([disabled])');
  if (!btns.length) return null;
  const i = Math.min(which, btns.length - 1);
  const label = (await btns[i].textContent()).trim();
  await btns[i].evaluate((e) => e.click());
  TAPS.push({ q: QN, owner: 'game', label: `call:${label}` });
  return label;
}

const cardLive = async (page, { timeout = 20_000 } = {}) => {
  await page.waitForSelector('.job-screen .card-screen:not([data-state="loading"])', { timeout }).catch(() => {});
  await page.waitForSelector('.card-submit:not([hidden])', { timeout: 6000 }).catch(() => {});
  await nap(page, 250);
};

/** qa/ship-sessions.mjs's answer-from-the-bank, copied. Returns true only if it really cleared. */
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
              .find((c) => ((c.dataset.text ?? c.textContent) || '').trim() === want);
            if (chip) { chip.click(); n++; }
            continue;
          }
          const inp = document.querySelector(`.card-parts .w-cz-in[data-i="${i}"]`);
          if (inp && !inp.disabled) set(inp, want);
        }
      } else if (p.type === 'mc' && p.answer != null) {
        const want = String(p.answer).trim();
        const btn = [...document.querySelectorAll('.card-parts .wd-opts button')]
          .find((b) => ((b.dataset.value ?? b.textContent) || '').trim() === want);
        if (btn) { btn.click(); n++; }
      }
    }
    return n;
  });
  if (!filled) return false;
  await click(page, '.card-submit:not([hidden])', { label: 'Submit', owner: 'study', wait: 800 });
  return page.evaluate(() => !!document.querySelector('.card-continue:not([hidden])')
    && !!document.querySelector('.card-parts [data-state="ok"]')
    && !document.querySelector('.card-parts [data-state="revealed"]'));
}

/* `qa/ship-sessions.mjs`'s wrong-attempt driver, copied verbatim. THE VALUE MUST CHANGE BETWEEN
   ATTEMPTS: `screens/card.js` treats a re-submitted identical answer as no new attempt, so a probe
   that types 999 four times never reaches the worked solution and the session stalls. */
const WRONG = ['999', '111', '7', '404'];

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


/** Submit whatever `attemptWrong` filled in. */
async function submitWrong(page, attempt) {
  if (!(await attemptWrong(page, attempt))) return false;
  return click(page, '.card-submit:not([hidden])', { label: 'Submit', owner: 'study', wait: 800 });
}

/* ------------------------------------------------------------------ the session */

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'block',
});
await ctx.addInitScript(SAMPLER);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message.slice(0, 160)));

await page.goto(BASE + 'version.js', { waitUntil: 'load' });
await page.evaluate((j) => localStorage.setItem('u1a.save', j), SAVE);

/* The session has to EXIST before its queue can be trimmed: `inProgress.queue` is written by the
   composer when `#/run/job` mounts, not by the fixture. */
await page.goto(BASE + '#/run/job', { waitUntil: 'load' });
await page.waitForSelector('.job-screen', { timeout: 20_000 }).catch(() => {});
await nap(page, 600);
await page.goto(BASE + 'version.js', { waitUntil: 'load' });

/* THE QUEUE IS TRIMMED TO QUESTIONS THIS HARNESS CAN ANSWER CORRECTLY — `qa/ship-sessions.mjs`'s
   own `trimJob` trick, widened. Only `mc`, `num`, `multi` and `cloze` parts have an answer the probe
   can read out of the card bank; a `pairs` or `asn` card can only ever be MISSED by a script, and a
   session that can only be missed never builds a pile, so the game never draws a card and the two
   counts measure nothing (that is exactly what the first run of this file did). What is fictional
   here is WHICH questions the composer chose — not one thing about the game: the items are real
   cards, in the composer's own item shape, and every game decision below is the shipped engine's. */
const trimmed = await page.evaluate(async (want) => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return null; }
  const q = s?.inProgress?.queue;
  if (!Array.isArray(q)) return null;
  const { byId, cards } = await import('/data/cards.js');
  const OK = new Set(['mc', 'num', 'multi', 'cloze']);
  const clearable = (c) => !!c && (c.parts || []).length > 0 && (c.parts || []).every((p) => OK.has(p.type));
  const kept = q.filter((it) => clearable(byId[it.id]));
  const shape = kept[0] || q[0];
  for (const c of cards) {
    if (kept.length >= want) break;
    if (!clearable(c) || kept.some((it) => it.id === c.id)) continue;
    kept.push({
      ...shape, id: c.id, kind: 'card', template: undefined, seed: undefined, forCard: undefined,
      skill: (c.skills || [])[0] ?? shape.skill, skills: c.skills || shape.skills,
      tier: c.tier ?? shape.tier, module: c.module ?? shape.module, sheet: c.sheet ?? shape.sheet,
      done: false, result: null,
    });
  }
  kept.forEach((it, i) => { it.n = i + 1; });
  s.inProgress.queue = kept.slice(0, want);
  s.inProgress.idx = 0;
  /* AND THE SESSION GOES BACK TO ITS FIRST INSTANT. The mount that wrote the queue also sealed a
     call on its first question (at an empty pile the engine locks the one call there is), and a
     standing call is what `screens/job.js settleAbandonedBid` charges on the next mount — so
     without this the probe's own question 1 arrives already settled, bidless, paying nothing, and
     every reading after it is a question behind. The keys are `job/state.js freshState`'s. */
  if (s.inProgress.game) {
    Object.assign(s.inProgress.game, {
      pile: 0, streak: 1, call: null, answered: 0, tGame: 0, tAnswer: 0, tAway: 0, away: 0,
    });
  }
  localStorage.setItem('u1a.save', JSON.stringify(s));
  return s.inProgress.queue.map((it) => it.id);
}, 10);
console.log(`queue (trimmed to what a script can answer): ${JSON.stringify(trimmed)}\n`);

await page.goto(BASE + '#/run/job', { waitUntil: 'load' });
await page.waitForSelector('.job-screen', { timeout: 20_000 }).catch(() => {});
await cardLive(page);

const ROWS = [];
async function harvest(tag) {
  const rows = await page.evaluate(() => {
    const r = window.__r5 ? window.__r5.rows : [];
    if (window.__r5) window.__r5.rows = [];
    return r;
  });
  for (const r of rows) ROWS.push({ ...r, tag, q: QN });
  return rows;
}

const say = (s) => console.log(s);

/* --- the loop, played the way a student plays it -------------------------------------------- */

/** Wait — SAMPLING ALL THE WHILE — until the screen offers something to do. */
async function settle(tag, { ms = 12_000 } = {}) {
  const t0 = Date.now();
  let last = null;
  for (;;) {
    await nap(page, 120);
    await harvest(tag);
    last = await page.evaluate(() => ({
      phase: document.querySelector('.job-screen')?.dataset?.phase ?? null,
      card: !!document.querySelector('.job-face-down'),
      liveCall: !!document.querySelector('.job-call:not([disabled])'),
      bank: !!document.querySelector('.job-bank:not([disabled])'),
      submit: !!document.querySelector('.card-submit:not([hidden])'),
      cont: !!document.querySelector('.card-continue:not([hidden])'),
      over: !!document.querySelector('.job-over'),
      live: document.querySelector('.job-screen .card-screen')?.dataset?.state === 'live',
    }));
    if (last.over) return last;
    if (last.card && (last.liveCall || last.bank)) return last;
    if (last.live && (last.submit || last.cont)) return last;
    if (Date.now() - t0 > ms) return last;
  }
}

let banked = false; let hinted = false; let missed = false; let abandoned = false;
for (QN = 1; QN <= 12; QN++) {
  const st = await settle(`q${QN}:idle`);
  if (!st || st.over) { say(`  q${QN}: the session is over`); break; }

  /* 1. the face-down card, when the game draws one */
  if (st.card) {
    /* bank is the third control — always available, never required. Taken once, late. */
    if (!banked && QN >= 5 && st.bank) {
      await click(page, '.job-bank:not([disabled])', { label: 'bank', owner: 'game', wait: 500 });
      banked = true;
      say(`  q${QN}: BANKED`);
      await settle(`q${QN}:receipt`, { ms: 4000 });
    }
    if (await has(page, '.job-call:not([disabled])')) {
      const c = await call(page, QN % 3 === 0 ? 9 : 0);      // sometimes the dearest call
      say(`  q${QN}: card → call "${c}"`);
    } else {
      say(`  q${QN}: card, no live call (a question the game will not price)`);
    }
  } else {
    say(`  q${QN}: NO CARD — the game priced nothing on this question`);
  }

  /* 2. the flip, sampled while it happens, then the question */
  const q = await settle(`q${QN}:flip`);
  if (q.over) break;

  /* 2b. ONE abandoned bid: leave by the screen's own way out and come back (the settle beat) */
  if (!abandoned && st.card && q.live) {
    abandoned = true;
    say(`  q${QN}: leaving with the bid standing → the settle beat`);
    await page.goto(BASE + '#/today', { waitUntil: 'load' });
    await nap(page, 500);
    await page.goto(BASE + '#/run/job', { waitUntil: 'load' });
    await page.waitForSelector('.job-screen', { timeout: 20_000 }).catch(() => {});
    await settle(`q${QN}:settle`, { ms: 9000 });
    continue;
  }

  /* 3. one hint, on one question, to watch the third slot withdraw */
  if (!hinted && QN >= 3 && await has(page, '.card-hint-btn:not([disabled])')) {
    await click(page, '.card-hint-btn:not([disabled])', { label: 'Hint', owner: 'study', wait: 800 });
    hinted = true;
    await harvest(`q${QN}:after-hint`);
    say(`  q${QN}: took a hint`);
  }

  /* 4. the answer */
  let ok = false;
  if (!missed && QN >= 4) { missed = true; await submitWrong(page, 0); say(`  q${QN}: missed on purpose`); }
  else ok = await clearLive(page);
  await harvest(`q${QN}:graded`);

  /* 5. however it went, get to Continue and take it */
  for (let a = 1; a <= 4 && !(await has(page, '.card-continue:not([hidden])')); a++) {
    if (!(await has(page, '.card-submit:not([hidden])'))) break;
    if (!(await submitWrong(page, a))) break;
  }
  if (await has(page, '.card-continue:not([hidden])')) {
    await click(page, '.card-continue:not([hidden])', { label: 'Continue', owner: 'study', wait: 250 });
  }
  await settle(`q${QN}:beat`, { ms: 6000 });
  say(`  q${QN}: ${ok ? 'cleared' : 'not cleared'}`);
}

QN = 0;
await nap(page, 1500);
await harvest('end');

/* ------------------------------------------------------------------ the report */

const during = ROWS.filter((r) => r.phase !== 'over' && r.phase !== 'none');
const worstGame = during.reduce((a, r) => Math.max(a, r.game.length), 0);
const worstAll = during.reduce((a, r) => Math.max(a, r.game.length + r.shell.length), 0);

console.log('\n--------------------------------------------------------------- every distinct frame');
const seen = new Set();
for (const r of during) {
  const key = `${r.phase}|${r.game.join(',')}|${r.strip.join('|')}|${r.say}|${r.shell.join(',')}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${String(r.tag).padEnd(18)} phase=${String(r.phase).padEnd(6)} GAME ${r.game.length} [${r.game.join(' ')}]`
    + ` study ${String(r.study.length).padStart(2)} shell ${r.shell.length}${r.shell.length ? ` [${r.shell.join(' ')}]` : ''}`
    + `  strip=[${r.strip.join(' | ')}]${r.say ? ` say="${r.say}"` : ''}${r.levelup ? '  +LEVEL-UP' : ''}`);
}

const perQ = new Map();
for (const t of TAPS) {
  if (!t.q) continue;
  const e = perQ.get(t.q) || { game: [], study: [] };
  e[t.owner].push(t.label);
  perQ.set(t.q, e);
}
console.log('\n--------------------------------------------------------------- taps, by question');
let worstGameTaps = 0; let worstCall = 0;
for (const [q, e] of [...perQ.entries()].sort((a, b) => a[0] - b[0])) {
  const calls = e.game.filter((l) => l.startsWith('call:')).length;
  worstGameTaps = Math.max(worstGameTaps, e.game.length);
  worstCall = Math.max(worstCall, calls);
  console.log(`  q${String(q).padStart(2)}  game ${e.game.length} [${e.game.join(', ')}]   study ${e.study.length} [${e.study.join(', ')}]`);
}

console.log('\n==============================================================================');
console.log(`NUMBERS ON SCREEN during play (limit 3)`);
console.log(`  the GAME's own surfaces, worst frame of the session : ${worstGame}`);
console.log(`  + the app shell (header, toasts) in the same frame  : ${worstAll}`);
console.log(`  frames sampled: ${ROWS.length} distinct, ${during.length} during play`);
console.log(`TAPS PER QUESTION (limit 2)`);
console.log(`  the GAME's own, worst question    : ${worstGameTaps}  (calls: ${worstCall})`);
console.log(`  the study card's own (Submit, Continue, Hint) is COMPOSED's and unchanged`);
console.log(`console errors: ${errors.length ? errors.slice(0, 5).join(' | ') : 'none'}`);
console.log('==============================================================================\n');

await browser.close();
server.close();
