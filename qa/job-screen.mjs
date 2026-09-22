// qa/job-screen.mjs — J6's measured acceptance. Dev-only; nothing under site/ imports it.
//
//   node qa/job-screen.mjs                       # both engines, both themes, table + PASS/FAIL
//   node qa/job-screen.mjs --engines chromium    # one engine
//   node qa/job-screen.mjs --keep                # leave the browser open on a failure
//
// What it measures, straight off COMPOSED-GAME G8's J6 row:
//
//   1. A FULL job at 375x667 **with the keyboard open** — modelled the way a keyboard actually
//      works: the LAYOUT viewport stays 375x667 and only the VISUAL viewport shrinks, so
//      `window.innerHeight` is unchanged and `visualViewport.height` falls by KB_PX. That is what
//      `site/js/widgets/base.js keyboardInset()` reads to publish `--kb` and `data-kb`, and what
//      `site/index.html`'s viewport meta leaves as the default on both engines (no
//      `interactive-widget`, so Chrome resizes-visual too). Shrinking the Playwright viewport — this
//      file's model until round 3 — shrinks the LAYOUT viewport, which no keyboard does: it moved
//      every sticky element up with the fold and hid nothing, so every "keyboard open" claim in the
//      layer passed on a keyboard that does not exist. Everything reachability-shaped is therefore
//      measured against `visualViewport.offsetTop + visualViewport.height`, never `innerHeight`.
//      No horizontal scroll at any beat.
//   2. **The board is <= LAYOUT.boardCollapsedPx (36 px) whenever a stem is in the DOM** — measured
//      on every single target, in BOTH engines (webkit is iOS Safari; chromium is Android Chrome).
//   3. **The header carries exactly five items during a job and six outside one.**
//   4. **The sealed envelope never renders the stem before call-lock**, and **no pre-call node
//      contains the EV-max rung** — the second one structurally: the four call buttons are compared
//      attribute for attribute, so a mark on the argmax rung is a diff, not a judgement call.
//   5. **Keyboard-complete**: one target is played with nothing but keys (1-4 call, B/Enter,
//      arrows/C on the board, K/W at the getaway), and every focused control paints a focus ring.
//   6. **THE DECISION IS ON SCREEN.** At every payout beat, at 375x667 AND 375x812, with NO
//      scrolling: the payout line and `.job-bag` are both inside the viewport. G1 counts BAG / PUSH
//      nine times a job; round 1's player-feel critic measured the payout line at y = 1016 and BAG
//      at y = 1100 in an 812 px viewport, which left the dock's full-width PUSH as the only control
//      a student could see. This file could not catch it: it checked that `.job-bag` EXISTED and
//      then pressed `B`. Existence is not reachability, so the rule is now a rectangle.
//   7. **The brief is reachable too**: its primary is inside the fold at rest, and the board is the
//      same one 36 px line it is during a stem (it used to spring back to ~280 px between targets,
//      which put "Skip" ~680 px down).
//   8. **The rail**: past `LAYOUT.railMinWidthPx` the board sits BESIDE the reading column at
//      `LAYOUT.railPx` ± 7.5 % and NOT collapsed — G6's *"≥ 1024 px: the board lives in the 320 px
//      right rail, permanently visible"* — and BELOW that threshold there is no rail at all.
//   9. **The OPEN board is `LAYOUT.boardSheetPx` (264 px) during the decision phases** at
//      `LAYOUT.phoneWidthPx`x667 — G6's sticky sheet, G12 #22 (round 2, layout-safari). Every one
//      of the four px constants in `LAYOUT` is now read from `site/data/job.js` and compared with a
//      rendered box; none of them is re-typed here.
//
// It drives the app exactly as a student does: nothing is written to the save by this file, and no
// grade is synthesised — a target is either answered from the card's own data or missed to the
// worked solution, both through `screens/card.js`.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDERS, FIX_DIR, buildAll, freshen } from './fixtures/audit-build.mjs';
import { existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const ENGINES_BY_NAME = { chromium, webkit };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const ENGINES = opt('engines', 'chromium,webkit').split(',').filter(Boolean);
const THEMES = opt('themes', 'light,dark').split(',').filter(Boolean);

/** data/job.js LAYOUT.boardCollapsedPx / boardSheetPx — read from the shipped table, never re-typed. */
const JOB_DATA_SRC = readFileSync(path.join(SITE, 'data', 'job.js'), 'utf8');
const BOARD_COLLAPSED = Number(/boardCollapsedPx:\s*(\d+)/.exec(JOB_DATA_SRC)?.[1] ?? 36);
const BOARD_SHEET = Number(/boardSheetPx:\s*(\d+)/.exec(JOB_DATA_SRC)?.[1] ?? 264);

/**
 * G6: *"Board sheet 264 px sticky during the decision phases"* (`LAYOUT.boardSheetPx`, G12 #22).
 *
 * ROUND 2 (layout-safari). Before this round the only check on that number in the whole tree was
 * `tests/job-juice.test.mjs` asserting `LAYOUT.boardSheetPx === 264` against the literal 264 in
 * `site/data/job.js` — a constant compared with itself. Nothing measured it, `site/css/` contained
 * no `264` at all, and the board renders at ~477 px during the decision phases at 375x667. This
 * file now MEASURES it on every decision-phase beat and prints it in the table.
 *
 * It is a `warn` until `site/css/job.css` publishes `--job-board-sheet` and constrains the open
 * board with it — the way the 36 px half already works — and a hard `fail` the moment it does. That
 * is the self-arming form: the day the rule ships, this check starts defending it, with no second
 * edit here. See notes/tests-fix.md "Requests".
 */
const JOB_CSS_SRC = readFileSync(path.join(SITE, 'css', 'job.css'), 'utf8');
const SHEET_RULE_SHIPPED = new RegExp(`--job-board-sheet:\\s*${BOARD_SHEET}px`).test(JOB_CSS_SRC)
  && /var\(\s*--job-board-sheet\s*\)/.test(JOB_CSS_SRC);

/* The other three `LAYOUT` px constants, read from the same table rather than re-typed. Round 2
   found `railPx` (320), `railMinWidthPx` (1024) and `phoneWidthPx` (375) written out as literals
   here and in the audit — the same "a constant compared with itself" shape as `boardSheetPx`, one
   step further along: the number was not compared with anything at all. */
const px = (k, d) => Number(new RegExp(`${k}:\\s*(\\d+)`).exec(JOB_DATA_SRC)?.[1] ?? d);
const RAIL_PX = px('railPx', 320);
const RAIL_MIN_WIDTH = px('railMinWidthPx', 1024);
const PHONE_W = px('phoneWidthPx', 375);
/** The rail is measured at the first width past G6's threshold that clears `--col` + rail + gutter. */
const RAIL_VP = [Math.max(1280, RAIL_MIN_WIDTH + 256), 900];
const HEADER_IN_JOB = 5;
/** The height an open phone keyboard takes off the VISUAL viewport (iOS 15/Android ≈ 290–340 px).
 *  336 leaves 331 px of a 667 px screen, which is the band this file used to model as a LAYOUT
 *  viewport of 375x331 — the same visible band, and the reason the two are easy to confuse. */
const KB_PX = 336;
const HEADER_OUT = 6;

/* ---------------------------------------------------------------- the server */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  try {
    const st = await stat(f); if (!st.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('nf ' + p); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------------------------------------------------------------- the fixture */
if (Object.keys(BUILDERS).some((n) => !existsSync(path.join(FIX_DIR, n)))) await buildAll();
const SAVE = JSON.stringify(freshen(JSON.parse(readFileSync(path.join(FIX_DIR, 'midweek.json'), 'utf8'))));

/* ---------------------------------------------------------------- probes (run in the page) */

const PROBE_BOARD = () => {
  const board = document.querySelector('.job-board');
  const stem = document.querySelector('.card-stem, .card-screen');
  const de = document.documentElement;
  return {
    hasStem: !!stem,
    boardH: board ? +board.getBoundingClientRect().height.toFixed(2) : null,
    overflow: de.scrollWidth - window.innerWidth,
    phase: document.querySelector('.job-screen')?.dataset.phase ?? null,
    q: (() => { try { const j = JSON.parse(localStorage.getItem('u1a.save')).inProgress; return j ? `${j.idx}/${j.queue.length}` : 'none'; } catch { return '?'; } })(),
  };
};

/** The header items app.js says are on screen, counted from the DOM rather than from its own list. */
const PROBE_HEADER = () => {
  const ids = ['hdr-readiness', 'hdr-tminus', 'hdr-level', 'hdr-xp', 'hdr-combo', 'hdr-streak', 'hdr-loose', 'hdr-bag', 'hdr-chain'];
  const on = ids.filter((id) => { const el = document.getElementById(id); return !!el && !el.hidden && el.getClientRects().length > 0; });
  return { on, n: on.length };
};

/**
 * The seal + the EV-max ban, both structural.
 *  · `stem` — any node that could carry the question, anywhere in the document.
 *  · `calls` — every call button's full attribute set MINUS the two that legitimately differ
 *    (`data-call`, the key badge). If the four sets are not identical, one rung is marked.
 *  · `words` — the pre-call text, for the copy half of the ban.
 */
const PROBE_SEAL = () => {
  const screen = document.querySelector('.job-screen');
  const calls = [...document.querySelectorAll('.job-call')];
  const sig = (b) => [...b.attributes]
    .filter((a) => a.name !== 'data-call')
    .map((a) => `${a.name}=${a.value}`).sort().join('|');
  return {
    stem: !!document.querySelector('.card-stem, .card-screen, .card-paper, .card-parts'),
    stemRef: !!document.querySelector('[data-card-id], [data-template]'),
    calls: calls.map((b) => b.dataset.call),
    sigs: [...new Set(calls.map(sig))],
    text: (screen?.textContent ?? '').replace(/\s+/g, ' '),
  };
};

/**
 * THE FOLD — the bottom of what the student can actually see, inlined into every probe because
 * these functions are serialised into the page and close over nothing.
 *
 * `window.innerHeight` is the LAYOUT viewport and does not move when a keyboard opens; the visual
 * viewport is the one that shrinks (`site/js/widgets/base.js:234`: *"iOS Safari and Android Chrome
 * both shrink the VISUAL viewport only"*). Every rule in this file used `innerHeight`, so with the
 * keyboard open it was measuring a fold 336 px below the one the student has.
 */
/**
 * Open / close the on-screen keyboard the way the platform does: shrink the VISUAL viewport, fire
 * its `resize`, and let the app's own `keyboardInset()` publish `--kb` and `data-kb` from it. The
 * harness never writes either one itself — if the publisher stops running, these rules must see it.
 */
async function openKeyboard(page, px = KB_PX) {
  const ok = await page.evaluate((kb) => {
    const vv = window.visualViewport;
    if (!vv) return false;
    const h = Math.max(120, window.innerHeight - kb);
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 });
    vv.dispatchEvent(new Event('resize'));
    return true;
  }, px);
  await nap(page, 360);                        // keyboardInset() applies on a rAF
  return ok;
}

async function closeKeyboard(page) {
  await page.evaluate(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    delete vv.height;
    delete vv.offsetTop;
    vv.dispatchEvent(new Event('resize'));
  });
  await nap(page, 360);
}

/** What the app has published about the keyboard, and what the dock did with it. */
const PROBE_KB = () => {
  const de = document.documentElement;
  const vv = window.visualViewport;
  const dock = document.querySelector('#dock, .w-dock-own, .job-beat');
  return {
    innerH: window.innerHeight,
    visualH: vv ? Math.round(vv.height) : null,
    offsetTop: vv ? Math.round(vv.offsetTop) : null,
    fold: vv ? Math.round(vv.offsetTop + vv.height) : window.innerHeight,
    kb: getComputedStyle(de).getPropertyValue('--kb').trim() || null,
    dataKb: de.dataset.kb ?? null,
    dockTransform: dock ? getComputedStyle(dock).transform : null,
  };
};

/**
 * Is the decision ON SCREEN — the rectangle test, at rest. `inView` is the whole of it: a control
 * whose bottom is past the fold is a control the student has to go looking for, and G1 budgets
 * no scroll for a beat it counts nine times. Nothing here scrolls; the numbers are read where the
 * walk left the page.
 */
const PROBE_DOCK = () => {
  const vvD = window.visualViewport;
  const H = vvD ? Math.round(vvD.offsetTop + vvD.height) : window.innerHeight;
  const one = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { y: Math.round(r.top), b: Math.round(r.bottom), inView: r.top >= -0.5 && r.bottom <= H + 0.5 };
  };
  return {
    H, scrollY: Math.round(window.scrollY),
    bagpush: !!document.querySelector('.job-bag'),
    beatPos: (() => { const b = document.querySelector('.job-beat'); return b ? getComputedStyle(b).position : null; })(),
    rects: {
      'the payout line': one('.job-beat .job-payout'),
      'the q* line': one('.job-beat .job-qstar'),
      'the BAG button': one('.job-beat .job-bag'),
    },
  };
};

/**
 * The DECISION controls of a phase that is not the payout beat — the call row and the getaway's two
 * buttons — measured where the walk left the page, with no scrolling of any kind (round 2,
 * layout-safari). `.job-call` is checked as the LAST rung, because a row whose first rung is on
 * screen and whose last is not is still a row the student cannot use.
 */
const PROBE_REACH = () => {
  const vvR = window.visualViewport;
  const H = vvR ? Math.round(vvR.offsetTop + vvR.height) : window.innerHeight;
  const box = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { y: Math.round(r.top), b: Math.round(r.bottom), inView: r.top >= -0.5 && r.bottom <= H + 0.5 };
  };
  const calls = [...document.querySelectorAll('.job-call')];
  const board = document.querySelector('.job-board');
  return {
    H, scrollY: Math.round(window.scrollY),
    boardH: board ? +board.getBoundingClientRect().height.toFixed(2) : null,
    rects: {
      'the first call rung': box(calls[0]),
      'the last call rung': box(calls[calls.length - 1]),
      'CRACK': box(document.querySelector('.job-crack')),
      'WALK': box(document.querySelector('.job-getaway .job-walk')),
      'the no-stakes door': box(document.querySelector('.job-nostakes .btn-primary')),
    },
  };
};

/** The brief: its primary inside the fold, and the board still one collapsed line. */
const PROBE_BRIEF = () => {
  const vvB = window.visualViewport;
  const H = vvB ? Math.round(vvB.offsetTop + vvB.height) : window.innerHeight;
  const board = document.querySelector('.job-board');
  const skip = document.querySelector('.job-brief > .run-actions .btn-primary');
  const r = skip ? skip.getBoundingClientRect() : null;
  return {
    H,
    boardH: board ? +board.getBoundingClientRect().height.toFixed(2) : null,
    skip: r ? { y: Math.round(r.top), b: Math.round(r.bottom), inView: r.top >= -0.5 && r.bottom <= H + 0.5 } : null,
  };
};

/** The rail: the board BESIDE the reading column, at its own width, uncollapsed. */
const PROBE_RAIL = () => {
  const b = document.querySelector('.job-board');
  const m = document.querySelector('.job-main');
  const de = document.documentElement;
  if (!b || !m) return { beside: false, boardW: 0, boardH: 0, overflow: de.scrollWidth - window.innerWidth, why: 'no .job-board / .job-main' };
  const rb = b.getBoundingClientRect();
  const rm = m.getBoundingClientRect();
  return {
    beside: rb.left >= rm.right - 1 && rb.top < rm.bottom,
    boardW: Math.round(rb.width), boardH: Math.round(rb.height), mainW: Math.round(rm.width),
    pos: getComputedStyle(b).position,
    overflow: de.scrollWidth - window.innerWidth,
  };
};

/* ---------------------------------------------------------------- driving */

const nap = (page, ms) => page.waitForTimeout(ms);
const has = async (page, sel) => !!(await page.$(sel));
async function tap(page, sel, wait = 320) {
  const el = await page.$(sel);
  if (!el) return false;
  await el.evaluate((e) => e.click());
  if (wait) await nap(page, wait);
  return true;
}

async function goJob(page, { theme }) {
  await page.goto(BASE + 'version.js', { waitUntil: 'load' });
  await page.evaluate(async () => {
    try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister(); } catch { /* blocked */ }
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { /* none */ }
  });
  await page.evaluate(([json, t]) => {
    const s = JSON.parse(json);
    s.settings = { ...(s.settings || {}), theme: t };
    localStorage.setItem('u1a.save', JSON.stringify(s));
  }, [SAVE, theme]);
  await page.goto(BASE + '#/run/job', { waitUntil: 'networkidle' });
  await page.waitForSelector('.job-screen', { timeout: 20000 });
  await page.waitForSelector('.job-screen .job-primary', { timeout: 20000 });
  await nap(page, 250);
}

/** Answer the live card from its OWN data when the widget takes typed fields; otherwise miss it. */
async function answerOne(page) {
  const filled = await page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('u1a.save') || 'null');
    const ip = s?.inProgress;
    const it = ip?.queue?.[ip?.idx ?? 0];
    if (!it) return 0;
    let item = null;
    try {
      if (it.kind === 'variant') { const T = await import('/data/templates.js'); item = T.generate(it.template, it.seed, it.params ?? {}); }
      else { const C = await import('/data/cards.js'); item = C.byId[it.id]; }
    } catch { return 0; }
    const want = {};
    for (const p of item?.parts ?? []) {
      if (p.type === 'num' && p.answer != null) want.value = p.answer;
      if (p.type === 'multi') for (const f of (p.fields ?? [])) if (f.answer != null) want[f.key] = f.answer;
    }
    let n = 0;
    for (const [key, val] of Object.entries(want)) {
      const inp = document.querySelector(`.card-parts .w-field[data-key="${key}"] input`);
      if (!inp || inp.disabled || inp.readOnly) continue;
      inp.focus(); inp.value = String(val); inp.dispatchEvent(new Event('input', { bubbles: true })); n++;
    }
    return n;
  });
  if (filled) { await tap(page, '.card-submit:not([hidden])', 650); }
  if (await has(page, '.card-continue:not([hidden])')) return filled ? 'clear' : 'done';
  // fall back to the honest miss: a WELL-FORMED wrong answer until card.js's own third-miss path
  // forces the worked solution. (A blank or half-built answer grades `malformed`, which is free and
  // never charges an attempt — a filler that produces one would loop for ever.)
  for (let i = 0; i < 6; i++) {
    if (await has(page, '.card-continue:not([hidden])')) break;
    await page.evaluate((k) => {
      const live = (sel) => [...document.querySelectorAll('.card-parts ' + sel)].filter((b) => !b.disabled && b.getClientRects().length);
      const WRONG = ['1', '2', '3', '4', '5', '6'];
      let typed = 0;
      for (const inp of document.querySelectorAll('.card-parts .w-field input, .card-parts textarea.w-field-t')) {
        if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
        inp.focus(); inp.value = WRONG[k % WRONG.length]; inp.dispatchEvent(new Event('input', { bubbles: true })); typed++;
      }
      if (typed) return;
      // cloze / strip: every slot must be filled or the submit is malformed
      const slots = live('.w-cz-slot, .w-strip-slot');
      if (slots.length) {
        slots.forEach((slot, i) => {
          slot.click();
          const chips = live('.wd-chip, .w-cz-opt, .w-strip-opt');
          if (chips.length) chips[(i + k + 1) % chips.length].click();
        });
        return;
      }
      // the notation builder: clear, take a two-letter kind, then two letters
      if (document.querySelector('.card-parts .w-nt, .card-parts .w-nt-letters')) {
        live('.w-nt-edit').find((b) => /clear/i.test(b.textContent))?.click();
        const deco = live('.w-nt-deco-btn');
        (deco.find((b) => /ray/i.test(b.textContent)) || deco.find((b) => /line/i.test(b.textContent)) || deco[0])?.click();
        const ls = live('.w-nt-letter');
        if (ls.length) { ls[k % ls.length]?.click(); ls[(k + 2) % ls.length]?.click(); }
        return;
      }
      for (const sel of ['.wd-opts button', '.w-cls-btn', '.w-asn-btn', '.w-tm-term', '.wd-chip', '.w-pairs-angle', '.w-segbtn', '.w-rc-btn', '.w-ratio-btn']) {
        const b = live(sel);
        if (b.length) { b[(b.length - 1 - k + b.length * 2) % b.length].click(); return; }
      }
    }, i);
    if (!(await tap(page, '.card-submit:not([hidden])', 700))) break;
    if (await has(page, '.card-showsol:not([hidden])')) await tap(page, '.card-showsol:not([hidden])', 800);
  }
  if (!(await has(page, '.card-continue:not([hidden])'))) {
    const why = await page.evaluate(() => ({
      msg: document.querySelector('.card-parts .w-msg-text')?.textContent?.slice(0, 80) ?? null,
      widgets: [...new Set([...document.querySelectorAll('.card-parts [class^="w-"], .card-parts [class*=" w-"]')].map((e) => String(e.className).split(/\s+/)[0]))].slice(0, 8).join(' '),
    }));
    console.log(`  [stuck] ${why.widgets} — ${why.msg ?? 'no message'}`);
  }
  return has(page, '.card-continue:not([hidden])') ? 'miss' : 'stuck';
}

/* ---------------------------------------------------------------- one full walk */

async function walk(engineName, theme, out) {
  const browser = await ENGINES_BY_NAME[engineName].launch();
  const ctx = await browser.newContext({ viewport: { width: PHONE_W, height: 667 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const fail = (what, detail) => out.fails.push(`${engineName}/${theme}: ${what} — ${detail}`);
  const warn = (what, detail) => out.warns.push(`${engineName}/${theme}: ${what} — ${detail}`);
  /** The OPEN board, during a decision phase: G6's 264 px sticky sheet, measured. */
  const sheetCheck = async (beat) => {
    const m = await page.evaluate(() => {
      const b = document.querySelector('.job-board');
      const s = document.querySelector('.job-screen');
      return b ? { h: +b.getBoundingClientRect().height.toFixed(2), phase: s?.dataset.phase ?? null, vh: innerHeight } : null;
    });
    if (!m || m.h == null) return null;
    out.worstOpenBoard = Math.max(out.worstOpenBoard ?? 0, m.h);
    if (m.h > BOARD_SHEET + 0.5) {
      const line = `the board is ${m.h}px at ${beat} (phase "${m.phase}") on a ${m.vh}px screen; `
        + `G6 says a ${BOARD_SHEET}px sticky sheet (LAYOUT.boardSheetPx)`;
      if (SHEET_RULE_SHIPPED) fail('board sheet', line);
      else warn('board sheet', `${line} — NOT FATAL YET: job.css publishes no --job-board-sheet rule to defend`);
    }
    return m.h;
  };
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  try {
    await goJob(page, { theme });

    /* ---- 3. the header: five items during a job ---- */
    const boardHdr = await page.evaluate(PROBE_HEADER);
    /* ---- 9. G6's 264 px sticky sheet, MEASURED during a decision phase (G12 #22) ---- */
    const boardOpenH = await sheetCheck('the board phase');
    out.rows.push({ engine: engineName, theme, beat: 'board', boardH: boardOpenH, hdr: boardHdr.n, note: boardHdr.on.join(' ') });

    /* ---- the board phase is keyboard-driven (DRAFT 1-5, PRESS arrows, COMMIT c) ---- */
    await page.keyboard.press('Digit1'); await nap(page, 120);
    await page.keyboard.press('Digit1'); await nap(page, 120);     // toggled off again: the draft is a choice
    await page.keyboard.press('ArrowDown'); await nap(page, 80);
    await page.keyboard.press('ArrowRight'); await nap(page, 120);
    await page.keyboard.press('ArrowLeft'); await nap(page, 120);
    await page.keyboard.press('KeyC'); await nap(page, 150);
    const commitOpen = await has(page, '.job-commit-open');
    if (!commitOpen) fail('keyboard', 'C did not open the COMMIT row on the board');
    await page.keyboard.press('KeyC'); await nap(page, 150);
    await tap(page, '.job-primary', 800);

    /* ---- every target ---- */
    let target = 0;
    const MAX = 48;   // a missed review is re-queued once (page.MAX_REQUEUE), so a 12-target job can run 24
    let sawSealCheck = false;
    while (target < MAX) {
      const ph = await page.evaluate(() => document.querySelector('.job-screen')?.dataset.phase ?? null);
      if (ph === 'debrief' || ph == null) break;

      if (ph === 'getaway') {
        const hdrG = await page.evaluate(PROBE_HEADER);
        if (hdrG.n !== HEADER_IN_JOB) fail('header', `getaway shows ${hdrG.n} items (${hdrG.on.join(' ')}), want ${HEADER_IN_JOB}`);
        await sheetCheck('the getaway');          // the other pre-stem phase the sheet is open in
        /* ---- 10b. CRACK and WALK on screen at rest, portrait and landscape (round 2) ---- */
        for (const [vw, vh] of [[PHONE_W, 667], [844, 390]]) {
          if (vh !== 667) { await page.setViewportSize({ width: vw, height: vh }); await nap(page, 300); }
          const r = await page.evaluate(PROBE_REACH);
          for (const [what, box] of Object.entries(r.rects)) {
            if (!box || !box.inView) {
              if (box) fail('reach', `${what} is outside a ${vw}x${vh} viewport at the getaway `
                + `(top ${box.y}, bottom ${box.b}, scrollY ${r.scrollY}, board ${r.boardH}px)`);
            }
          }
        }
        await page.setViewportSize({ width: PHONE_W, height: 667 });
        await nap(page, 280);
        await page.keyboard.press('KeyK'); await nap(page, 600);     // CRACK, by key
        continue;
      }
      if (ph === 'brief') {
        /* ---- 11. THE CREW GRID PRICES **THIS** BOARD (round 3, crew-alignment) ----
           `tests/job-screen.test.mjs` covered this with four regexes over the source — one of them
           `/state\.crew\.alignmentFor\(/`, which matches the supply-BLIND call
           `alignmentFor(s, {shape, of})` exactly as well as the correct
           `alignmentFor(s, {shape, of, queue})`. That is how a blocker shipped under a green suite.
           So the sentence is RENDERED here and read back against `crew.supplyGapFor(save, queue)`
           computed from the same save: the only check that can tell the two call sites apart. */
        const crewM = await page.evaluate(async () => {
          const out2 = { ok: false, why: null };
          try {
            const crew = await import('/js/job/crew.js');
            const s = JSON.parse(localStorage.getItem('u1a.save') || 'null');
            const ip = s?.inProgress;
            if (!ip || !Array.isArray(ip.queue)) return { ...out2, why: 'no page in the save' };
            const queue = ip.queue.slice(ip.idx ?? 0);
            const onBoard = [...new Set(queue.map((it) => crew.makeOf(it)).filter(Boolean))];
            if (!onBoard.length) return { ...out2, why: 'no make left on the board' };
            const shape = ip.game?.shape ?? crew.DEFAULT_SHAPE;
            const gap = crew.supplyGapFor(s, queue, { shape, of: onBoard });
            const blind = crew.supplyGapFor(s, [], { shape, of: onBoard });
            const align = crew.alignmentFor(s, { shape, of: onBoard, queue });
            const counts = {};
            for (const it of queue) {
              const mk = crew.makeOf(it);
              if (!mk) continue;
              const c = counts[mk] ?? (counts[mk] = { left: 0, live: 0 });
              c.left += 1;
              const own = crew.ownDueReviewKey(s, mk, { queue });
              const idle = crew.isDueReview(it) && (own == null || crew.keyOf(it) === own);
              if (!idle) c.live += 1;
            }
            const rows = [...document.querySelectorAll('.job-crew-row')].map((r) => ({
              make: r.querySelector('.job-crew-make')?.textContent?.trim() ?? null,
              board: r.querySelector('.job-crew-board')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
            }));
            return {
              ok: true, why: null, gap, blind, counts, rows,
              held: align?.held ?? null,
              threshold: align?.threshold ?? null,
              holds: align?.holds ?? null,
              supplyText: document.querySelector('.job-crew-supply')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
              alignText: document.querySelector('.job-crew-align')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
              hasGrid: !!document.querySelector('.job-brief-crew'),
            };
          } catch (e) { return { ...out2, why: String(e?.message ?? e) }; }
        });
        if (!crewM.ok) warn('crew grid', `not measured — ${crewM.why}`);
        else {
          if (!crewM.hasGrid) fail('crew grid', 'the brief rendered no .job-brief-crew block');
          /* (a) the per-row board counts are THIS board's, not the shape's mean encounters */
          for (const row of crewM.rows) {
            const c = crewM.counts[row.make];
            if (!c) { fail('crew grid', `row "${row.make}" is not a make on the board`); continue; }
            const want = `${c.left} left · forgives ${c.live}`;
            if (row.board !== want) fail('crew grid', `row ${row.make} prints "${row.board}", the board says "${want}"`);
          }
          /* (b) the supply sentence is the QUEUE-AWARE gap, number for number */
          const g2 = crewM.gap;
          if (g2 && g2.studyTop) {
            if (!crewM.supplyText) {
              fail('crew grid', `no .job-crew-supply line, but supplyGapFor names ${g2.studyTop} paying ${g2.studyPays.toFixed(2)}`);
            } else {
              const want = [g2.studyTop, `pays ${g2.studyPays.toFixed(2)}`,
                `over ${g2.studySupply} target${g2.studySupply === 1 ? '' : 's'}`];
              if (!g2.agrees) want.push(`${g2.gameTop} pays ${g2.gameValue.toFixed(2)}`);
              for (const frag of want) {
                if (!crewM.supplyText.includes(frag)) {
                  fail('crew grid', `the grid prints "${crewM.supplyText}" — it does not carry "${frag}" from supplyGapFor(save, queue)`);
                }
              }
              /* …and it is NOT the supply-blind reading, which is what the old regex could not tell
                 apart. `supplyGapFor(save, [])` is `alignmentFor(s, {shape, of})`'s own domain. */
              const blindFrag = `over ${crewM.blind.studySupply} target${crewM.blind.studySupply === 1 ? '' : 's'}`;
              if (crewM.blind.studySupply !== g2.studySupply && crewM.supplyText.includes(blindFrag)) {
                fail('crew grid', `the grid prints the SUPPLY-BLIND count (${crewM.blind.studySupply}) where this board has ${g2.studySupply}`);
              }
              out.crewSeen = (out.crewSeen ?? 0) + 1;
              if (crewM.blind.studySupply !== g2.studySupply || crewM.blind.studyPays !== g2.studyPays) {
                out.crewDiscriminating = (out.crewDiscriminating ?? 0) + 1;
              }
            }
          }
          /* (c) the alignment threshold line is the theorem's own number */
          if (crewM.held && crewM.alignText) {
            const n2w = Number(crewM.threshold).toFixed(2);
            if (!crewM.alignText.includes(n2w)) {
              fail('crew grid', `the alignment line prints "${crewM.alignText}" — alignmentFor says the HELD threshold is ${n2w}`);
            }
            const claim = crewM.holds ? 'leads it' : 'is outbid by it';
            if (!crewM.alignText.includes(claim)) {
              fail('crew grid', `the alignment line says the opposite of alignmentFor.holds = ${crewM.holds}`);
            }
          }
        }

        /* ---- 7. the brief is reachable at rest ---- */
        const br = await page.evaluate(PROBE_BRIEF);
        if (br.boardH != null && br.boardH > BOARD_COLLAPSED + 0.5) {
          fail('brief', `the board is ${br.boardH}px at the brief (max ${BOARD_COLLAPSED}) — 280px of contracts above the panel`);
        }
        if (!br.skip) fail('brief', 'the brief has no primary control');
        else if (!br.skip.inView) fail('brief', `the brief's primary is ${br.skip.b - br.H}px below the fold at rest (375x${br.H})`);
        await page.keyboard.press('Enter'); await nap(page, 500); continue;
      }

      if (ph === 'envelope' || ph === 'call') {
        /* ---- 4. the seal + the EV-max ban, measured BEFORE the call ---- */
        const seal = await page.evaluate(PROBE_SEAL);
        if (seal.stem) fail('seal', 'a card body is in the DOM before the call is locked');
        if (seal.stemRef) fail('seal', 'a card id / template is addressable before the call is locked');
        if (seal.calls.length && seal.sigs.length !== 1) fail('ev-max', `the call buttons are not identical: ${seal.sigs.length} attribute signatures`);
        if (/EV[-\s]?max|argmax|recommend|best call|optimal call/i.test(seal.text)) fail('ev-max', 'a pre-call surface names the recommended rung');
        sawSealCheck = true;

        const bBoard = await page.evaluate(PROBE_BOARD);
        if (bBoard.overflow > 1) fail('overflow', `envelope scrolls ${bBoard.overflow}px sideways`);
        if (bBoard.hasStem) fail('seal', 'PROBE_BOARD saw a stem at the envelope');

        /* ---- 10. THE CALL ROW IS ON SCREEN AT REST, at both phone orientations ----
           Round 2 (layout-safari): the board sheet ran to its content — 477 px at 375x667 — so the
           four rungs the student is asked to choose between sat at y 809–869, and after every PUSH
           the screen FOCUSED `.job-call` and then scrolled it 142 px below the fold. Existence was
           never the question; this is the same rectangle test rule 6 makes of BAG, at the beat
           that carries the other half of G1's decisions. 844x390 is the same phone turned
           sideways, where the whole sheet has to give way to the decision. */
        if (target === 0 || target === 3) {
          for (const [vw, vh] of [[375, 667], [844, 390]]) {
            if (vw !== PHONE_W || vh !== 667) { await page.setViewportSize({ width: vw, height: vh }); await nap(page, 300); }
            const r = await page.evaluate(PROBE_REACH);
            for (const [what, box] of Object.entries(r.rects)) {
              if (!box) continue;
              if (!box.inView) fail('reach', `${what} is outside a ${vw}x${vh} viewport at rest `
                + `(top ${box.y}, bottom ${box.b}, scrollY ${r.scrollY}, board ${r.boardH}px)`);
            }
            if (r.boardH != null && r.boardH > BOARD_SHEET + 0.5) {
              fail('board sheet', `the board is ${r.boardH}px at the envelope on a ${vh}px screen (G6: ${BOARD_SHEET}px)`);
            }
          }
          await page.setViewportSize({ width: PHONE_W, height: 667 });
          await nap(page, 280);
        }

        // the CALL, by key on the first target and by tap after that (both are real paths)
        if (target === 0) { await page.keyboard.press('Digit2'); await nap(page, 500); }
        else if (await has(page, '.job-call')) await tap(page, '.job-call[data-call="70"], .job-call', 500);
        else await tap(page, '.job-envelope .btn-primary', 500);    // a no-stakes target
        continue;
      }

      if (ph === 'answer') {
        await page.waitForSelector('.card-screen:not([data-state="loading"])', { timeout: 20000 }).catch(() => {});
        await page.waitForSelector('.card-parts .w, .card-parts button', { timeout: 20000 }).catch(() => {});
        await nap(page, 200);

        /* ---- 2. THE BOARD IS <= 36 px WHENEVER A STEM IS IN THE DOM ---- */
        const b1 = await page.evaluate(PROBE_BOARD);
        if (!b1.hasStem) fail('answer', 'the answer phase has no stem');
        if (b1.boardH == null || b1.boardH > BOARD_COLLAPSED + 0.5) {
          fail('board-collapse', `board is ${b1.boardH}px with a stem in the DOM (max ${BOARD_COLLAPSED})`);
        }
        if (b1.overflow > 1) fail('overflow', `answer scrolls ${b1.overflow}px sideways at 375x667`);

        /* ---- 1. WITH THE KEYBOARD OPEN — the VISUAL viewport only (round 3, layout-safari) ----
           The layout viewport stays 375x667. `openKeyboard` shrinks `visualViewport` and fires its
           resize; `widgets/base.js keyboardInset()` (mounted by `card.js`'s dock) then publishes
           `--kb` and `data-kb` from it, exactly as on a phone. Nothing here writes either one, so
           if that publisher ever stops running these rules go red instead of quietly passing. */
        const kbOk = await openKeyboard(page);
        const kb = await page.evaluate(PROBE_KB);
        if (!kbOk) warn('keyboard', 'this engine exposes no window.visualViewport — rule 1 could not run');
        else {
          if (kb.innerH !== 667) fail('keyboard', `the LAYOUT viewport moved to ${kb.innerH}px — a keyboard does not do that`);
          if (kb.fold > kb.innerH - 80) fail('keyboard', `the visual fold is ${kb.fold} of ${kb.innerH} — the keyboard model did not take`);
          if (target === 0) {
            /* the app's own publisher, measured once per walk: `--kb` is what lifts every sticky
               dock (`css/widgets.css:477`), and a dock that does not lift is a dock under the keys */
            const kbPx = Number.parseFloat(kb.kb ?? '0') || 0;
            if (kb.dataKb !== 'open') fail('keyboard', `data-kb is "${kb.dataKb}" with ${KB_PX}px of keyboard open — widgets/base.js keyboardInset() is not running`);
            if (kbPx < 80) fail('keyboard', `--kb is "${kb.kb}" with ${KB_PX}px of keyboard open — the dock cannot lift above the keys`);
            out.kbRows.push({ engine: engineName, theme, fold: kb.fold, innerH: kb.innerH, kb: kb.kb, dataKb: kb.dataKb });
          }
        }
        const b2 = await page.evaluate(PROBE_BOARD);
        if (b2.boardH == null || b2.boardH > BOARD_COLLAPSED + 0.5) {
          fail('board-collapse', `board is ${b2.boardH}px with the keyboard open (max ${BOARD_COLLAPSED})`);
        }
        if (b2.overflow > 1) fail('overflow', `keyboard-open answer scrolls ${b2.overflow}px sideways`);
        /* ---- 1b. AND THE ANSWERING CONTROLS ARE ABOVE THE KEYS (round 3) ----
           The half of J6's acceptance nobody could measure: with the keyboard open, is the control
           that ENDS the target inside the visible band? `.card-submit` / `.card-continue` live in
           the dock, which `--kb` is supposed to lift. */
        const kbReach = await page.evaluate(() => {
          const vv = window.visualViewport;
          const H = vv ? Math.round(vv.offsetTop + vv.height) : window.innerHeight;
          const one = (sel) => {
            const e = document.querySelector(sel);
            if (!e || e.hidden) return null;
            const r = e.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return null;
            return { y: Math.round(r.top), b: Math.round(r.bottom), inView: r.top >= -0.5 && r.bottom <= H + 0.5 };
          };
          return { H, submit: one('.card-submit:not([hidden])'), cont: one('.card-continue:not([hidden])') };
        });
        for (const [what, box] of Object.entries({ 'the submit button': kbReach.submit, 'the continue button': kbReach.cont })) {
          if (box && !box.inView) {
            fail('keyboard-reach', `${what} is under the keyboard at 375x667 with ${KB_PX}px open `
              + `(top ${box.y}, bottom ${box.b}, visible band 0..${kbReach.H})`);
          }
        }
        const hdrA = await page.evaluate(PROBE_HEADER);
        if (hdrA.n !== HEADER_IN_JOB) fail('header', `answering shows ${hdrA.n} items (${hdrA.on.join(' ')}), want ${HEADER_IN_JOB}`);
        if (target < 3 || target % 4 === 3) out.rows.push({ engine: engineName, theme, beat: `target ${target + 1}`, boardH: b2.boardH, hdr: hdrA.n, note: `queue ${b2.q}` });
        out.worstBoard = Math.max(out.worstBoard ?? 0, b2.boardH ?? 0, b1.boardH ?? 0);

        const how = await answerOne(page);
        await closeKeyboard(page);
        if (how === 'stuck') { fail('answer', `target ${target + 1} could not be finished`); break; }
        target++;
        continue;
      }

      if (ph === 'payout' || ph === 'bagpush') {
        const b3 = await page.evaluate(PROBE_BOARD);
        if (b3.hasStem && (b3.boardH == null || b3.boardH > BOARD_COLLAPSED + 0.5)) {
          fail('board-collapse', `board is ${b3.boardH}px at the payout with the stem still in the DOM`);
        }
        if (b3.overflow > 1) fail('overflow', `payout scrolls ${b3.overflow}px sideways`);
        if (!(await has(page, '.job-beat:not([hidden])'))) fail('payout', 'no payout beat rendered');

        /* ---- 6. THE DECISION IS ON SCREEN, at both phone heights, with no scrolling ----
           ROUND 3: and with the KEYBOARD OPEN, which is the state the student is actually in when
           this beat arrives — tapping submit does not blur the field, so the keys are still up. That
           pass ran nowhere in the stack before, because the only keyboard this file modelled was a
           shrunken layout viewport, which moves the sticky dock up with the fold and can therefore
           never catch a dock sitting under the keys. */
        let dockVh = 667;
        for (const [vh, withKb] of [[667, false], [812, false], [667, true]]) {
          if (vh !== dockVh) { await page.setViewportSize({ width: 375, height: vh }); await nap(page, 280); dockVh = vh; }
          if (withKb) await openKeyboard(page);
          const where = withKb ? `375x${vh} with ${KB_PX}px of keyboard` : `375x${vh}`;
          const d = await page.evaluate(PROBE_DOCK);
          if (d.beatPos !== 'sticky') fail('payout-dock', `the payout beat is position: ${d.beatPos} — it has to ride the fold`);
          for (const [what, r] of Object.entries(d.rects)) {
            if (!r) continue;                              // a no-stakes beat prints no payout line
            if (!r.inView) {
              fail('payout-dock', `${what} is outside a ${where} viewport at rest (top ${r.y}, bottom ${r.b}, visible band 0..${d.H}, scrollY ${d.scrollY})`);
            }
          }
          if (d.bagpush && !d.rects['the BAG button']) fail('payout-dock', `.job-bag has no box at ${where}`);
          if (withKb) await closeKeyboard(page);
        }
        await page.setViewportSize({ width: 375, height: 667 });
        await nap(page, 280);

        // B bags on target 2, Enter pushes everywhere else — both by key (G6 keyboard-complete)
        if (target === 2 && await has(page, '.job-bag')) { await page.keyboard.press('KeyB'); }
        else { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Enter'); }
        await nap(page, 650);
        continue;
      }

      // any other phase: take the primary
      if (!(await tap(page, '.job-screen .btn-primary', 600))) break;
    }

    if (!sawSealCheck) fail('seal', 'never reached an envelope');
    if (!out.crewSeen) warn('crew grid', 'no brief printed a supply line — rule 11 measured nothing this walk');
    if (target < 1) fail('walk', 'no target was answered');

    const ph = await page.evaluate(() => document.querySelector('.job-screen')?.dataset.phase ?? null);
    if (ph !== 'debrief') fail('walk', `the job ended at phase "${ph}" after ${target} targets, not at the debrief`);
    const deb = await page.evaluate(PROBE_BOARD);
    if (deb.overflow > 1) fail('overflow', `the debrief scrolls ${deb.overflow}px sideways`);
    out.rows.push({ engine: engineName, theme, beat: 'debrief', boardH: null, hdr: (await page.evaluate(PROBE_HEADER)).n, note: `${target} targets` });

    /* ---- 3b. six items OUTSIDE a job ---- */
    await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
    await nap(page, 600);
    const hdrOut = await page.evaluate(PROBE_HEADER);
    if (hdrOut.n !== HEADER_OUT) fail('header', `outside a job the header shows ${hdrOut.n} items (${hdrOut.on.join(' ')}), want ${HEADER_OUT}`);
    out.rows.push({ engine: engineName, theme, beat: 'outside', boardH: null, hdr: hdrOut.n, note: hdrOut.on.join(' ') });

    /* ---- 8. THE RAIL. G6: "≥ 1024 px: the board lives in the 320 px right rail, permanently
       visible". `#view` caps at `--col` until a 1024 px window lifts it, so 1280x900 is the first
       size at which the promise is testable — and the one at which the shipped build drew a 36 px
       strip with ~780 px of empty page beside it (round 1, layout-safari). ---- */
    await page.setViewportSize({ width: RAIL_VP[0], height: RAIL_VP[1] });
    await goJob(page, { theme });
    const rail = await page.evaluate(PROBE_RAIL);
    const at = `${RAIL_VP[0]}x${RAIL_VP[1]}`;
    if (!rail.beside) fail('rail', `at ${at} the board is stacked above the card, not beside it (${JSON.stringify(rail)})`);
    // LAYOUT.railPx, ±7.5 % — the rail is a token (`--job-rail: var(--rail)`), not a literal
    if (Math.abs(rail.boardW - RAIL_PX) > RAIL_PX * 0.075) {
      fail('rail', `the rail is ${rail.boardW}px wide; G6 / LAYOUT.railPx says ${RAIL_PX}`);
    }
    if (!(rail.boardH > BOARD_COLLAPSED + 0.5)) fail('rail', `the rail board is collapsed to ${rail.boardH}px — G6 says permanently visible`);
    if (rail.overflow > 1) fail('rail', `the rail scrolls ${rail.overflow}px sideways at ${at}`);
    out.rows.push({ engine: engineName, theme, beat: `rail ${RAIL_VP[0]}`, boardH: rail.boardH, hdr: '—', note: `board ${rail.boardW}px beside a ${rail.mainW}px column · ${rail.pos}` });

    /* …and BELOW G6's threshold (LAYOUT.railMinWidthPx) there is no rail: the board is the sheet
       again, stacked above the reading column. Without this the 1024 in the table is a number
       nothing reads — the rail could start at 600 px and every check above would still pass. */
    await page.setViewportSize({ width: RAIL_MIN_WIDTH - 64, height: 900 });
    await nap(page, 260);
    const narrow = await page.evaluate(PROBE_RAIL);
    if (narrow.beside) {
      fail('rail', `the board is already a rail at ${RAIL_MIN_WIDTH - 64}px wide; `
        + `G6 / LAYOUT.railMinWidthPx puts the rail at ${RAIL_MIN_WIDTH}px and above`);
    }
    out.rows.push({ engine: engineName, theme, beat: `no rail ${RAIL_MIN_WIDTH - 64}`, boardH: narrow.boardH, hdr: '—', note: `beside=${narrow.beside} · board ${narrow.boardW}px` });
    await page.setViewportSize({ width: PHONE_W, height: 667 });

    /* ---- 5b. focus rings ---- */
    await page.goto(BASE + '#/run/job', { waitUntil: 'networkidle' });
    await page.waitForSelector('.job-screen .btn, .job-screen button', { timeout: 20000 }).catch(() => {});
    const ring = await page.evaluate(() => {
      const b = document.querySelector('.job-screen button, .job-screen .btn');
      if (!b) return null;
      b.focus();
      const cs = getComputedStyle(b);
      return { outline: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
    });
    if (!ring || ring.outline === 'none' || parseFloat(ring.width) < 1) fail('focus', `no focus ring on a job control (${JSON.stringify(ring)})`);

    const noisy = consoleErrors.filter((t) => !/service ?worker|Failed to load resource: .*sw\.js/i.test(t));
    if (noisy.length) fail('console', noisy.slice(0, 3).join(' | '));
  } catch (e) {
    fail('harness', String(e?.message ?? e));
  } finally {
    if (!args.includes('--keep')) await browser.close();
  }
}

/* ---------------------------------------------------------------- run */

const out = { rows: [], fails: [], warns: [], kbRows: [], worstBoard: 0, worstOpenBoard: 0 };
for (const e of ENGINES) for (const t of THEMES) await walk(e, t, out);
await new Promise((r) => server.close(r));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nJ6 — THE JOB screen  (board collapses to <= ${BOARD_COLLAPSED}px with a stem in the DOM)\n`);
console.log(`${pad('engine', 10)}${pad('theme', 7)}${pad('beat', 12)}${pad('board px', 10)}${pad('hdr', 5)}note`);
for (const r of out.rows) console.log(`${pad(r.engine, 10)}${pad(r.theme, 7)}${pad(r.beat, 12)}${pad(r.boardH ?? '—', 10)}${pad(r.hdr, 5)}${r.note}`);
console.log(`\nworst board height with a stem in the DOM, across every target of every walk: ${out.worstBoard}px (max ${BOARD_COLLAPSED})`);
console.log(`worst OPEN board height, during the decision phases at 375x667: ${out.worstOpenBoard}px `
  + `(G6's sticky sheet is ${BOARD_SHEET}px — ${SHEET_RULE_SHIPPED ? 'ENFORCED by job.css, so this is fatal' : 'no job.css rule enforces it yet, so this is a warning'})`);
/* The keyboard, as the app saw it — printed so the MODEL is auditable and not just its verdict.
   `innerH` must not move (a keyboard does not resize the layout viewport); `--kb` and `data-kb` are
   the app's own publication, read back off <html>, never written by this file. */
if (out.kbRows.length) {
  for (const k of out.kbRows) {
    console.log(`keyboard open (${k.engine}/${k.theme}): layout viewport ${k.innerH}px · visible band 0..${k.fold} `
      + `· --kb ${k.kb} · data-kb ${k.dataKb}`);
  }
} else {
  console.log('keyboard open: NOT MEASURED — no visualViewport in this engine');
}
/* The crew grid: how many briefs it was measured on, and on how many of those the queue-aware gap
   and the supply-blind one actually DIFFER — the second number is what makes rule 11 a test rather
   than a tautology. */
console.log(`crew grid: measured on ${out.crewSeen ?? 0} brief(s) · the queue-aware gap differs from `
  + `the supply-blind one on ${out.crewDiscriminating ?? 0} of them`);
console.log('');
if (out.warns.length) {
  console.log(`WARN — ${out.warns.length}`);
  for (const w of out.warns) console.log('  ' + w);
  console.log('');
}
if (out.fails.length) {
  console.log(`FAIL — ${out.fails.length}`);
  for (const f of out.fails) console.log('  ' + f);
  process.exit(1);
}
console.log('ALL PASS');
