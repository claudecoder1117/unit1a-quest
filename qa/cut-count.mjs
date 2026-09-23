// qa/cut-count.mjs — THE INTEGRATOR'S COUNT (round 2 of THE CUT). Dev-only; never served.
//
//   node qa/cut-count.mjs                → both halves, chromium, 375x667
//   node qa/cut-count.mjs --only numbers → the numbers half alone
//   node qa/cut-count.mjs --only taps    → the taps half alone
//   node qa/cut-count.mjs --json out.json
//
// CUT-BRIEF's two hard limits are about what a human SEES and what a human TAPS. Both are therefore
// measured off the rendered page in a real browser — never off `viewModel`, which is the thing under
// test — and both are attributed to the LAYER that owns the element, because the limits govern what
// THE GAME adds to a screen COMPOSED already ships.
//
// HALF 1 — NUMBERS. Every digit-run inside a TEXT NODE whose own rect is on screen (`×2` is one run,
// `2 of 3` is two), at each of the five shipped job states. The state setups are `qa/audit-states.mjs`'s
// own, so this counts the same screens the layout audit gates, driven by code that is already proven
// to reach them. Text that is `aria-hidden`, clipped to a screen-reader box, invisible, zero-area or
// outside the visual viewport is not on screen; it is reported separately so nothing can hide here.
//
// HALF 2 — TAPS. Real `mouse.click()`s at real coordinates, counted and attributed, over the same
// queue on BOTH routes: `#/run/job` and `#/run/page`. One answering strategy drives both, so the
// DIFFERENCE is exactly what the game adds. That difference is the number CUT-BRIEF's "two taps per
// question" limit is about; the absolute count is COMPOSED's and is reported beside it.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './node_modules/playwright/index.mjs';
import { freshen } from './fixtures/audit-build.mjs';
import states from './audit-states.mjs';

const QA = dirname(fileURLToPath(import.meta.url));
const REPO = join(QA, '..');
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}/`;

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ONLY = opt('only', 'both');
const JSON_OUT = opt('json', null);
const QUESTIONS = Math.max(1, +opt('questions', 3));

/* `job-widest` is the strip at its widest — a three-digit pile, the cap streak and `pays 50`. The
   numeral budget is three at every state, so it has to be counted where the strings are longest and
   not only where the fixture happens to land (notes/cut-screen.md Requests 8). */
const JOB_STATES = ['job-facedown', 'job-streak', 'job-widest', 'job-answer', 'job-answer-kb', 'job-over'];

/* ================================================================= the in-page counter */

/** Injected. Every digit-run on screen with its owner, plus the ones deliberately not counted. */
const COUNT_FN = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  /* `#dock` is the app's ONE sticky dock and it lives outside both screens in the DOM, but its
     contents belong to whatever screen filled it: on a question that is `screens/card.js`'s Answer
     Dock (Submit, the hint ladder's `1/3`), which is COMPOSED's and identical on `#/run/page`.
     Attributing it to the shell would have charged the game for the study layer's hint counter. */
  const layerOf = (el) => {
    if (el.closest('.card-screen')) return 'study';
    if (el.closest('#dock')) return document.querySelector('.job-screen .card-screen') ? 'study'
      : document.querySelector('.job-screen') ? 'game' : 'study';
    if (el.closest('.job-screen')) return 'game';
    return 'shell';
  };
  const invisible = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 'hidden';
      if (+cs.opacity === 0) return 'transparent';
      if (n.hasAttribute('hidden')) return 'hidden-attr';
      if (n.getAttribute('aria-hidden') === 'true') return 'aria-hidden';
      if (/inset\(\s*50%|rect\(0/.test(cs.clipPath || cs.clip || '')) return 'sr-only';
      const r = n.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return 'clipped';
    }
    return null;
  };
  const on = [], off = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const runs = (t.nodeValue || '').match(/\d+/g);
    if (!runs) continue;
    const el = t.parentElement;
    if (!el) continue;
    const why = invisible(el);
    const range = document.createRange(); range.selectNodeContents(t);
    const r = range.getBoundingClientRect();
    const inVP = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    const sel = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    const rec = { runs, text: (t.nodeValue || '').trim().slice(0, 56), sel, layer: layerOf(el), why: why || (inVP ? null : 'offscreen') };
    (!why && inVP ? on : off).push(rec);
  }
  const byLayer = {};
  for (const r of on) byLayer[r.layer] = (byLayer[r.layer] || 0) + r.runs.length;
  return {
    phase: document.querySelector('.job-screen')?.dataset?.phase ?? null,
    strip: [...document.querySelectorAll('.job-slot')].map((s) => ({
      slot: s.dataset.slot,
      value: s.querySelector('.job-slot-v')?.textContent ?? '',
      caption: s.querySelector('.job-slot-k')?.textContent ?? '',
    })),
    onScreen: on.reduce((n, r) => n + r.runs.length, 0),
    byLayer, items: on,
    notCounted: off.filter((r) => r.layer !== 'shell'),
  };
};

/* ================================================================= harness / server */

const nap = (p, ms) => p.waitForTimeout(ms);

function makeHarness() {
  return {
    base: BASE,
    gotoRoute: (page, hash) => page.goto(BASE + hash, { waitUntil: 'networkidle' }),
    setSave: async (page, json) => { await page.evaluate((j) => localStorage.setItem('u1a.save', j), json); },
    waitReady: (page) => page.waitForTimeout(450),
    readFixture: null,
  };
}

/* ================================================================= half 2: taps */

const CLICK_LAYER = (sel) => (/job-call|job-bank/.test(sel) ? 'game' : 'study');

/**
 * A REAL tap: the control is scrolled into view and the mouse is clicked at its centre — SCROLLING
 * IS NOT A TAP, so bringing a control into reach costs nothing here, which is the same accounting a
 * student uses. When the point is covered (the sticky dock overlaps a control below it) the click is
 * delivered to the element directly and the tap is still counted as one; a covered control is a
 * LAYOUT finding and `qa/layout-audit.mjs` is the net that owns it, not this counter.
 */
async function tapHandle(page, handle, what, log, layer = 'study') {
  await handle.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
  const box = await handle.boundingBox();
  let via = 'mouse';
  if (box && box.width > 0 && box.height > 0) {
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const vh = page.viewportSize()?.height ?? 667, vw = page.viewportSize()?.width ?? 375;
    const hits = x >= 0 && y >= 0 && x < vw && y < vh
      && await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return !!e; }, [x, y])
      && await handle.evaluate((el, [px, py]) => { const e = document.elementFromPoint(px, py); return !!e && (e === el || el.contains(e) || e.contains(el)); }, [x, y]);
    if (hits) await page.mouse.click(x, y); else { via = 'covered'; await handle.evaluate((e) => e.click()); }
  } else { via = 'no-box'; await handle.evaluate((e) => e.click()); }
  log.push({ what, layer, via });
  return true;
}

/** A REAL tap by selector. Returns false when the control is not there. */
async function tap(page, sel, log, what) {
  const el = await page.$(sel);
  if (!el) return false;
  return tapHandle(page, el, what, log, CLICK_LAYER(sel));
}

/** The card the run is on, with its parts, read from the app's own data module. */
const liveCard = (page) => page.evaluate(async () => {
  let s = null; try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return null; }
  const ip = s?.inProgress;
  const it = Array.isArray(ip?.queue) ? ip.queue[Math.max(0, ip.idx | 0)] : null;
  if (!it?.id) return null;
  try {
    const m = await import('/data/cards.js'); const c = m.byId[it.id];
    return c ? { id: it.id, parts: (c.parts || []).map((p) => ({
      type: p.type, answer: p.answer ?? null, kind: p.kind ?? null, pts: p.pts ?? null,
      fields: (p.fields || []).map((f) => ({ key: f.key, answer: f.answer })),
      blanks: (p.blanks || []).map((b) => (b.answers ? b.answers[0] : b.answer) ?? null),
    })) } : null;
  } catch { return null; }
});

/**
 * ANSWER THE LIVE CARD, counting every tap. Typed fields are filled with the card's own answer and
 * cost NO tap beyond the one Submit (a student types; typing is not a tap and the limit is about
 * taps). Tap-only widgets cost the taps they cost, and they cost the SAME on both routes.
 */
async function answerCard(page, log) {
  await page.waitForSelector('.card-parts .w, .card-parts button, .card-parts .w-field', { timeout: 20000 }).catch(() => {});
  await nap(page, 350);
  const info = await liveCard(page);
  const typed = await page.evaluate((card) => {
    let n = 0;
    const set = (inp, v) => { inp.focus(); inp.value = String(v); inp.dispatchEvent(new Event('input', { bubbles: true })); n++; };
    for (const p of card?.parts || []) {
      if (p.answer != null && p.type !== 'mc') { const i = document.querySelector('.card-parts .w-field input:not([disabled]), .card-parts input[type="text"]:not([disabled])'); if (i && !i.disabled) set(i, p.answer); }
      if (p.type === 'multi') for (const f of p.fields || []) { const i = document.querySelector(`.card-parts .w-field[data-key="${f.key}"] input`); if (i && !i.disabled && f.answer != null) set(i, f.answer); }
    }
    return n;
  }, info);
  if (!typed) {
    // A tap widget. Take the cheapest complete-looking submission; the same code runs on both routes.
    /* `card.js` does not charge the SAME wrong answer twice (`isRepeatWrong`), so a fixed pick
       stalls the card at attempt 2 and the walk never reaches the next question: vary every
       attempt. */
    const attempt = await page.evaluate(() => (window.__cutPick = (window.__cutPick | 0) + 1));
    const clozeSlots = await page.$$('.card-parts .w-cz-slot');
    if (clozeSlots.length) {
      for (const [i, slot] of clozeSlots.entries()) {
        await tapHandle(page, slot, `cloze blank ${i + 1}`, log);
        await nap(page, 160);
        const chips = await page.$$('.card-parts .w-cz-picker .wd-chip:not([disabled])');
        if (chips.length) { await tapHandle(page, chips[(attempt + i) % chips.length], `cloze pick ${i + 1}`, log); await nap(page, 160); }
      }
    } else {
      const nt = await page.$('.card-parts .w-nt');
      if (nt) {
        // the notation builder: the card's OWN kind and points, so the card actually grades
        const p = (info?.parts || []).find((x) => x.type === 'notation') || {};
        const kb = p.kind ? await page.$(`.card-parts .w-nt-deco-btn[data-kind="${p.kind}"]:not([disabled])`) : null;
        const deco = kb ? [kb] : await page.$$('.card-parts .w-nt-deco-btn:not([disabled])');
        if (deco.length) { await tapHandle(page, deco[0], `notation kind ${p.kind || '?'}`, log); await nap(page, 180); }
        const want = Array.isArray(p.pts) && p.pts.length ? p.pts : null;
        if (want) {
          for (const L of want) {
            const b = (await page.$$('.card-parts .w-nt-letter:not([disabled])'));
            const texts = await Promise.all(b.map((h) => h.evaluate((e) => e.textContent.trim())));
            const i = texts.indexOf(L);
            if (i >= 0) { await tapHandle(page, b[i], `notation letter ${L}`, log); await nap(page, 160); }
          }
        } else {
          const letters = await page.$$('.card-parts .w-nt-letter:not([disabled])');
          for (const l of letters.slice(0, 2)) { await tapHandle(page, l, 'notation letter', log); await nap(page, 140); }
        }
      } else if (await page.$('.card-parts .w-pairs')) {
        /* PAIRS: one angle is not an answer — a pair is two, and the part wants `data-count` of
           them. A single tap leaves the submission incomplete, which grades `almost` and is free, so
           the card never finishes and the walk never reaches the next question. */
        const need = await page.$eval('.card-parts .w-pairs', (w) => Math.max(1, Number(w.dataset.count) || 1));
        const btns = await page.$$('.card-parts .w-pairs-angle:not([disabled])');
        for (let k = 0; k < need && btns.length >= 2; k++) {
          await tapHandle(page, btns[(attempt + 2 * k) % btns.length], `pair ${k + 1} angle a`, log); await nap(page, 140);
          await tapHandle(page, btns[(attempt + 2 * k + 1) % btns.length], `pair ${k + 1} angle b`, log); await nap(page, 140);
        }
      } else {
        for (const sel of ['.card-parts .wd-opts button:not([disabled])', '.card-parts .w-cls-btn:not([disabled])', '.card-parts .w-asn-btn:not([disabled])', '.card-parts .wd-chip:not([disabled])', '.card-parts .w-segbtn:not([disabled])', '.card-parts .w-tm-term:not([disabled])']) {
          const btns = await page.$$(sel);
          if (btns.length) { await tapHandle(page, btns[0], 'widget choice', log); await nap(page, 160); break; }
        }
        /* LAST RESORT — a GENERATED VARIANT, which has no entry in `data/cards.js` and so no answer
           to read. Fill every live field with a well-formed WRONG value: an EMPTY submit grades
           "malformed", which is free, and the card would never finish. It is tried only after every
           widget branch has declined, because several widgets (pairs among them) own a text field
           that is not the answer, and filling it skips the taps the widget actually wants. */
        await page.evaluate((v) => {
          for (const i of document.querySelectorAll('.card-parts .w-field input:not([disabled])')) {
            if (i.readOnly || !i.getClientRects().length) continue;
            i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, ['999', '111', '7', '404'][(await page.evaluate(() => (window.__cutPick | 0))) % 4]);
      }
    }
  }
  await tap(page, '.card-submit:not([hidden]):not([disabled])', log, 'Submit');
  await nap(page, 650);
}

const phaseOf = (page) => page.evaluate(() => document.querySelector('.job-screen')?.dataset?.phase ?? null);
const cardId = (page) => page.evaluate(() => {
  try { const s = JSON.parse(localStorage.getItem('u1a.save')); const ip = s?.inProgress; return `${ip?.idx}:${ip?.queue?.[ip.idx | 0]?.id ?? '?'}`; } catch { return '?'; }
});

/** One question end to end on whichever route is mounted. Returns the tap log for that question. */
async function oneQuestion(page, { game }) {
  const log = [];
  const at = await cardId(page);
  if (game) {
    if ((await phaseOf(page)) === 'over') return { log, at, stopped: 'phase=over' };
    /* A QUESTION THE GAME WILL NOT PRICE COSTS NO GAME TAP, AND IT IS NOT THE END OF THE SESSION —
       an empty pile (question 1 always) and a repeat the game seals bidless both arrive with no
       call on screen. Stopping here ended the walk at question 1 and made the taps comparison
       vacuous; answering it is the measurement ("the game adds 0 taps to this question"). */
    if (await page.$('.job-screen .job-call:not([disabled])')) {
      await tap(page, '.job-screen .job-call:not([disabled])', log, 'call');
    }
    await page.waitForSelector('.job-screen .card-screen', { timeout: 20000 }).catch(() => {});
    if (!(await page.$('.job-screen .card-screen'))) return { log, at, stopped: `phase=${await phaseOf(page)}` };
  }
  await answerCard(page, log);
  // three misses force the worked solution; keep answering until the card offers Continue
  for (let i = 0; i < 4 && !(await page.$('.card-continue:not([hidden])')); i++) await answerCard(page, log);
  const done = !!(await page.$('.card-continue:not([hidden])'));
  if (done) await tap(page, '.card-continue:not([hidden])', log, 'Continue');
  await nap(page, 900);
  return { log, at, stopped: done ? null : 'the card never offered Continue' };
}

/**
 * ONE WALK, IN A CONTEXT OF ITS OWN — and the context is the point, not tidiness. A live app flushes
 * its in-memory state to `localStorage` as the document goes away, so writing the fixture into a
 * page that has already played a session and then reloading hands the app back the state it just
 * wrote, not the fixture: the second route then resumed where the first one stopped and the two
 * were never compared on the same queue at all. A fresh context has no save to flush.
 */
async function walk(browser, report, { game, save }) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'light', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(`taps: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`taps: ${m.text()}`); });
  try { return await walkIn(page, { game, save }); } finally { await ctx.close(); }
}

async function walkIn(page, { game, save }) {
  /* `qa/audit-states.mjs go()`'s own opening, and it is not ceremony. Landing on the app and THEN
     writing the save leaves the app live with the state it booted with; it flushes that state back
     over the fixture as the document goes away, so the walk runs on whatever the app made up rather
     than on the fixture. `version.js` is a real document that is NOT the app: nothing boots, nothing
     flushes, and the `goto` below is a genuine document load that reads the save at boot. */
  await page.goto(BASE + 'version.js', { waitUntil: 'load' });
  await page.evaluate((j) => localStorage.setItem('u1a.save', j), save);
  await page.goto(BASE + (game ? '#/run/job' : '#/run/page'), { waitUntil: 'networkidle' });
  await page.waitForSelector(game ? '.job-screen' : '.run-screen, .card-screen', { timeout: 20000 });
  const seen = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('u1a.save'))?.profileId ?? null; } catch { return null; } });
  if (seen !== 'midweek-fixture') throw new Error(`the walk is not on the fixture (profileId=${seen})`);
  /* ROUND 4 MOVED THE OPENING (`job/pay.js decides`, CUT-SPEC §1): at an empty pile nothing can be
     lost, so question 1 of every session draws NO face-down card and there is no call to wait for.
     This line waited 20 s for one and threw, which took the whole taps half with it. Wait for
     whichever of the two the game actually gives — the card, or the question itself. */
  if (game) await page.waitForSelector('.job-screen .job-face-down .job-call, .job-screen .card-screen', { timeout: 20000 });
  await nap(page, 700);
  const out = [];
  for (let q = 1; q <= QUESTIONS; q++) {
    const r = await oneQuestion(page, { game });
    out.push(r);
    if (r.stopped) break;
    if (game && (await phaseOf(page)) === 'over') break;
  }
  return out;
}

/* ================================================================= main */

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', join(REPO, 'site'), '--bind', '127.0.0.1'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch();
  const report = { numbers: [], taps: null, errors: [] };

  try {
    /* ---------------- half 1: numbers, on the shipped job states ---------------- */
    if (ONLY !== 'taps') {
      const H = makeHarness();
      const all = states(H);
      for (const id of JOB_STATES) {
        const st = all.find((s) => s.id === id);
        if (!st) { report.numbers.push({ id, error: 'no such state' }); continue; }
        const vp = (st.vps && st.vps[0]) || [375, 667];
        const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'light', hasTouch: true, isMobile: true });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => report.errors.push(`${id}: ${e}`));
        page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${id}: ${m.text()}`); });
        try {
          await page.goto(BASE, { waitUntil: 'networkidle' });
          await st.prepare(page);
          await nap(page, 400);
          report.numbers.push({ id, vp, describe: st.describe, ...(await page.evaluate(COUNT_FN)) });
        } catch (e) {
          report.numbers.push({ id, vp, error: String(e).split('\n')[0] });
        }
        await ctx.close();
      }
    }

    /* ---------------- half 2: taps, both routes, same queue ---------------- */
    if (ONLY !== 'numbers') {
      const save = JSON.stringify(freshen(JSON.parse(readFileSync(join(QA, 'fixtures', 'midweek.json'), 'utf8'))));
      report.taps = {
        game: await walk(browser, report, { game: true, save }),
        page: await walk(browser, report, { game: false, save }),
      };
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  /* ---------------- report ---------------- */
  const line = '='.repeat(88);
  console.log(`\n${line}\nCUT COUNT — chromium · the shipped job states and both routes\n${line}`);
  for (const n of report.numbers) {
    if (n.error) { console.log(`\n${n.id}: ERROR ${n.error}`); continue; }
    const g = n.byLayer.game || 0, s = n.byLayer.study || 0, sh = n.byLayer.shell || 0;
    console.log(`\n${n.id}  [${n.vp.join('x')}, phase=${n.phase}]`);
    if (n.strip.length) console.log(`  strip: ${n.strip.map((x) => `${x.slot}="${x.value}" (${x.caption})`).join(' | ')}`);
    console.log(`  ON SCREEN ${n.onScreen}   game ${g} · study ${s} · shell ${sh}`);
    for (const it of n.items) console.log(`    ${it.layer.padEnd(5)} ${it.runs.join(',').padEnd(9)} "${it.text}"   ${it.sel}`);
    if (n.notCounted.length) { console.log('  not on screen:'); for (const it of n.notCounted) console.log(`    ${String(it.why).padEnd(11)} ${it.layer.padEnd(5)} "${it.text}"   ${it.sel}`); }
  }
  if (report.taps) {
    console.log(`\n${'-'.repeat(88)}\nTAPS — the same queue on both routes, one answering strategy\n${'-'.repeat(88)}`);
    const show = (name, walkOut) => {
      walkOut.forEach((r, i) => {
        const g = r.log.filter((t) => t.layer === 'game').length;
        console.log(`  ${name} Q${i + 1} [${r.at}]: ${r.log.length} taps (game ${g}) — ${r.log.map((t) => t.what).join(' → ')}${r.stopped ? `   STOPPED: ${r.stopped}` : ''}`);
      });
    };
    show('#/run/job ', report.taps.game);
    show('#/run/page', report.taps.page);
    const tot = (w) => w.filter((r) => !r.stopped).map((r) => r.log.length);
    const gameOnly = (w) => w.filter((r) => !r.stopped).map((r) => r.log.filter((t) => t.layer === 'game').length);
    console.log(`\n  taps per completed question   job [${tot(report.taps.game).join(', ')}]   page [${tot(report.taps.page).join(', ')}]`);
    console.log(`  GAME-OWNED taps per question  [${gameOnly(report.taps.game).join(', ')}]   (the call; bank was never needed)`);
  }
  console.log('\nconsole/page errors: ' + (report.errors.length ? '\n  ' + report.errors.join('\n  ') : 'none'));
  console.log(line + '\n');
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
