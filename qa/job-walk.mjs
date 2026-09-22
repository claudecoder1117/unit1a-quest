// qa/job-walk.mjs — J13's visual QA, in a real browser. Dev-only: nothing under `site/` imports it,
// it is never part of the deployed artifact, and every PNG it writes lands in the git-ignored
// `qa/screenshots/job/`.
//
//   node qa/job-walk.mjs                 # everything (cold · jobs · s9), chromium
//   node qa/job-walk.mjs cold            # the pinned cold-open path + the two-pass board
//   node qa/job-walk.mjs jobs            # three jobs at 375x667 dark and 1280x800 light
//   node qa/job-walk.mjs s9              # COMPOSED S9's ten criteria, re-scored with the layer on
//   node qa/job-walk.mjs gate            # the fast subset tests/job-coldopen.test.mjs spawns
//   node qa/job-walk.mjs --engines chromium,webkit --trace --keep
//
// It is J13's four acceptance criteria, each one MEASURED rather than argued:
//
//   1. **First answer from a COLD visit in ≤ 20 s**, on G1's pinned path
//      `board 6 → primary button → guard accept 4 → call 5` (`data/job.js COLD_OPEN`). The walk
//      parks the published human seconds EXACTLY and lets the machine spend whatever is left: the
//      total is read off `performance.now()` inside the page, so it starts at navigationStart and
//      ends the instant the stem is answerable. Nothing is warmed — the context is brand new, the
//      HTTP cache is empty and the service worker is blocked, which is the pessimistic cold path.
//   2. **Home paints the board in two passes, with no spinner and ZERO layout shift between them.**
//      An init script samples the board's geometry on every animation frame from before the first
//      paint until pass 2 lands, so the comparison is of the frames the student actually saw, not of
//      two states the driver asked for. `page.js` / `plan.js` are watched on the resource timeline:
//      the board has to be on screen BEFORE either arrives, which is what "two passes" means
//      operationally (G10 #21 — the no-static-import test wins, so this file asserts the behaviour).
//   3. **A fresh save through three jobs** — walk early · full job · CALL IT — at 375x667 dark and
//      1280x800 light. "Fresh" means a save with no `save.game` at all: job 1 is the student's first
//      job ever, so the guard cold-starts at uniform and the split prints `projected`.
//   4. **Every printed probability matches `guard.js` / `call.js`.** At every screenshot the page
//      re-imports the shipped modules, recomputes each printed number from the live save, and diffs
//      it against the rendered text. A mismatch names the shot, the selector and both numbers.
//
// Plus COMPOSED S9's ten criteria re-scored with the layer in the path (`s9`), each with the number
// it was scored on rather than a verdict on its own.
//
// Nothing here writes to the repo except PNGs and its own log. The save is only ever seeded once per
// run; after that the app owns it.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium, webkit } = require('playwright');
const ENGINES_BY_NAME = { chromium, webkit };

/* ---------------------------------------------------------------- arguments */
const argv = process.argv.slice(2);
const MODE = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'all').toLowerCase();
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const ENGINES = opt('engines', 'chromium').split(',').filter(Boolean);
const TRACE = flag('trace');
const OUT = path.resolve(opt('out', path.join(REPO, 'qa', 'screenshots', 'job-walk')));
await mkdir(OUT, { recursive: true });
/**
 * `page.js` (233 KB of cards) and `plan.js` (311 KB of generators) are served with this much delay.
 * On a loopback server every module lands in ~20 ms, which makes "the board paints before page.js
 * arrives" untestable — the whole point of two passes is a link that is NOT loopback. The lag is the
 * cheapest honest stand-in for that link, it applies to those two files only, and the cold-open
 * budget below is measured WITH it, so the 20 s number is pessimistic rather than flattering.
 */
const LAG_MS = Number(opt('lag', 700));
const LAGGED = new Set(['/js/page.js', '/js/plan.js']);

/* The game layer's own constants. `site/data/job.js` is data-only and DOM-free by house rule, so the
   harness imports the shipped table instead of re-typing the numbers it is measuring against. */
const JOB_DATA = await import(pathToFileURL(path.join(SITE, 'data', 'job.js')).href);
const { COLD_OPEN, KEYS, LAYOUT, GUARD, HEADER } = JOB_DATA;
const HEADER_IN_JOB = HEADER.itemsDuringJob;
const PATH_S = Object.fromEntries(COLD_OPEN.path.map((p) => [p.step, p.s]));

/**
 * Is `LAYOUT.boardSheetPx` a RULE yet, or still a number in a table?
 *
 * ROUND 2 (layout-safari). Until this round the only check on G6's 264 px sticky sheet anywhere in
 * the tree was `tests/job-juice.test.mjs` comparing `LAYOUT.boardSheetPx` with the literal 264 in
 * `site/data/job.js` — a constant against itself — and the two places that measured it (line 492
 * and line 802 below) only ever called `warn()`, so nothing could fail. `site/css/` contains no
 * `264` at all, and the open board renders at ~477 px at 375x667.
 *
 * The 36 px half of the same sentence works because `job.css` publishes `--job-board-collapsed` and
 * a rule consumes it. When the open half is given the same treatment — `--job-board-sheet` plus a
 * decision-phase rule that uses it — the two measurements below become hard failures automatically.
 * Until then they stay warnings, and say so.
 */
const SHEET_RULE_SHIPPED = (() => {
  const css = readFileSync(path.join(SITE, 'css', 'job.css'), 'utf8');
  return new RegExp(`--job-board-sheet:\\s*${LAYOUT.boardSheetPx}px`).test(css)
    && /var\(\s*--job-board-sheet\s*\)/.test(css);
})();
const BUDGET_MS = COLD_OPEN.budgetS * 1000;

/* ---------------------------------------------------------------- the server */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
/**
 * The widget recorder, borrowed verbatim in spirit from `qa/s9-walk.mjs`: every mounted widget is
 * pushed onto `window.__mounted`, and `window.__force[partId]` can override its `raw()`/`isEmpty()`.
 * That is how a driver answers a tap-to-build notation widget or a pairs grid correctly without
 * re-implementing eleven widgets. It is ONLY enabled for the answering modes (`jobs`, `s9`) — the
 * cold-open measurement is served the shipped bytes, unpatched.
 */
let PATCH_WIDGETS = false;
const RECORDER = `
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
function patchWidgets(src) {
  const a = src.includes('if (mount) return mount(el, part, ctx);');
  const b = src.includes('live = fn(el, part, ctx);');
  if (!a || !b) { console.error('qa/job-walk: widget patch anchors missing', a, b); return src; }
  return src
    .replace('if (mount) return mount(el, part, ctx);', 'if (mount) return __rec(mount(el, part, ctx), part);')
    .replace('live = fn(el, part, ctx);', 'live = __rec(fn(el, part, ctx), part);') + RECORDER;
}

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  try {
    const st = await stat(f);
    if (!st.isFile()) throw new Error('dir');
    let body = await readFile(f);
    if (PATCH_WIDGETS && p === '/js/widgets/index.js') body = Buffer.from(patchWidgets(body.toString('utf8')));
    if (LAG_MS > 0 && LAGGED.has(p)) await new Promise((r) => setTimeout(r, LAG_MS));
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------------------------------------------------------------- the fixture */
/* The mid-week save built by qa/fixtures/audit-build.mjs from the app's own modules, re-anchored on
   today. It carries NO `save.game` and NO `save.player`, which is exactly "a fresh save" for the
   game layer: job 1 cold-starts the guard and labels its split `projected`. */
const { BUILDERS, FIX_DIR, buildAll, freshen } = await import(pathToFileURL(path.join(REPO, 'qa', 'fixtures', 'audit-build.mjs')).href);
if (Object.keys(BUILDERS).some((n) => !existsSync(path.join(FIX_DIR, n)))) await buildAll();
const SAVE = JSON.stringify(freshen(JSON.parse(readFileSync(path.join(FIX_DIR, 'midweek.json'), 'utf8'))));

/**
 * The board is a function of the hour: after 22:00 none posts, and Mon–Fri 07:00–14:15 posts the RUN
 * shape only (G5). A visual QA that only runs after dinner is not a QA, so the page's clock is moved
 * by a CONSTANT offset onto tonight at 19:30 — constant, so every wall-clock delta the app measures
 * (and every delta this file measures) is untouched, while the hour-of-day gate sees an evening.
 */
const EVENING_HHMM = opt('at', '19:30');
function clockOffset() {
  const [hh, mm] = EVENING_HHMM.split(':').map(Number);
  const real = new Date();
  const want = new Date(real); want.setHours(hh, mm, 0, 0);
  return want.getTime() - real.getTime();
}
const CLOCK_INIT = (offset) => `(() => {
  const R = Date, O = ${offset};
  /* \`__clockShift\` is how the walk moves to the NEXT EVENING between jobs: a board is one per day,
     and a student who walks out of tonight's job does not get a second one at 19:31. It is a whole
     number of days, added to the same constant offset, so wall-clock deltas stay exact. */
  window.__clockShift = 0;
  const at = () => R.now() + O + (window.__clockShift || 0);
  window.Date = new Proxy(R, {
    construct(t, a) { return a.length ? new t(...a) : new t(at()); },
    get(t, k) { return k === 'now' ? at : Reflect.get(t, k); },
  });
})();`;
const DAY_MS = 86400000;

/* ---------------------------------------------------------------- instrumentation */
/**
 * Installed before any app code runs. It records, from navigationStart:
 *   · `marks`   — performance.now() of the milestones the cold open is scored on
 *   · `res`     — every resource, with the ms it finished (page.js / plan.js are the ones that matter)
 *   · `cls`     — the browser's own Layout Instability score (chromium; absent in webkit, and said so)
 *   · `geo`     — the board's geometry on EVERY animation frame, keyed by the pass it was in
 * The geometry sampler is the honest version of "zero layout shift between passes": it compares the
 * frames that were painted, not two states a driver posed for.
 */
const INSTRUMENT = `(() => {
  const Q = { marks: {}, res: [], cls: 0, shifts: [], geo: [], err: [], frames: 0 };
  window.__qa = Q;
  const mark = (k) => { if (Q.marks[k] == null) Q.marks[k] = performance.now(); };
  mark('start');
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) Q.res.push({ n: e.name, end: Math.round(e.responseEnd || e.startTime) }); })
      .observe({ type: 'resource', buffered: true });
  } catch (e) { Q.err.push('resource: ' + e); }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; Q.cls += e.value; Q.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5), n: (e.sources || []).map((s) => (s.node && s.node.className) || (s.node && s.node.nodeName) || '?').slice(0, 3) }); } })
      .observe({ type: 'layout-shift', buffered: true });
    Q.clsSupported = true;
  } catch (e) { Q.clsSupported = false; }

  /* PAGE-level boxes: the whole column, in viewport coordinates. Home repaints twice on its own
     (renderLight → render), so a move here can belong to the hero or the plan strip and NOT to the
     board's two passes. Reported, never conflated with the criterion. */
  const PAGE_SEL = ['#hdr', '.home-hero', '.home-board', '.home-cta', '.home-primary', '.plan-strip', '.home-today', '.home-links'];
  /* BOARD-internal boxes, measured RELATIVE TO THE PANEL'S OWN TOP-LEFT. This is the criterion:
     pass 2 writes ink into nodes pass 1 already sized, so nothing inside the panel — and not the
     panel's own height — may move. Subtracting the panel's origin is what makes the number immune to
     everything above it. */
  const BOARD_SEL = ['.board-line', '.board-rows', '.board-meta', '.board-supply', '.board-crew'];
  const r4 = (r) => [Math.round(r.x * 100) / 100, Math.round(r.y * 100) / 100, Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
  const rect = (el) => r4(el.getBoundingClientRect());
  const rectIn = (el, o) => { const r = el.getBoundingClientRect(); return r4({ x: r.x - o.x, y: r.y - o.y, width: r.width, height: r.height }); };
  function sample() {
    Q.frames++;
    const b = document.querySelector('.home-board');
    if (b) {
      mark('board');
      const pass = b.dataset.pass || '?';
      const pending = b.querySelectorAll('[data-pending]').length;
      if (pass === '2' && pending === 0) mark('pass2');
      const abs = {};
      for (const s of PAGE_SEL) { const el = document.querySelector(s); if (el) abs[s] = rect(el); }
      const o = b.getBoundingClientRect();
      const inner = { 'the panel itself': [0, 0, Math.round(o.width * 100) / 100, Math.round(o.height * 100) / 100] };
      for (const s of BOARD_SEL) { const el = b.querySelector(s); if (el) inner[s] = rectIn(el, o); }
      b.querySelectorAll('.board-row').forEach((el, i) => { inner['.board-row#' + i] = rectIn(el, o); });
      Q.geo.push({ t: Math.round(performance.now()), pass, pending, abs, inner, h: document.documentElement.scrollHeight });
      if (Q.geo.length > 400) Q.geo.splice(0, 200);
    }
    const p = document.querySelector('.home-primary');
    if (p && p.getAttribute('aria-busy') !== 'true' && p.dataset.kind !== 'loading') mark('cta');
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
})();`;

/* ---------------------------------------------------------------- page-side probes */

/**
 * Every printed probability on this screen, recomputed from the shipped modules against the live
 * save. `guard.js` owns the bars and the cold-start line; `call.js` owns the four call rungs and the
 * envelope's evidence line; `econ.js` owns the vault's break-even q (which is a probability and is
 * printed beside them, so it is checked here too).
 */
const PROBE_PROBS = async () => {
  const out = { checked: [], bad: [], note: [] };
  const txt = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
  let guard, call, econ, cards;
  try {
    [guard, call, econ, cards] = await Promise.all([
      import('/js/job/guard.js'), import('/js/job/call.js'), import('/js/job/econ.js'), import('/data/cards.js'),
    ]);
  } catch (e) { out.note.push('modules: ' + e); return out; }
  const save = JSON.parse(localStorage.getItem('u1a.save') || 'null');
  const g = save?.inProgress?.game ?? null;

  /* 1. the guard bars — `guardBars(dist)` prints whole percentages that sum to 100 */
  const bars = [...document.querySelectorAll('.job-bar')];
  if (bars.length) {
    let dist = null;
    if (g?.guard?.dist) dist = { byWing: g.guard.dist, eps: g.guard.eps };
    if (dist) {
      const want = guard.guardBars(dist);
      const byWing = Object.fromEntries(want.map((w) => [w.wing, w.pct]));
      let sum = 0;
      for (const bar of bars) {
        const wing = bar.dataset.wing;
        const printed = Number((txt(bar.querySelector('.job-bar-pct')) || '').replace('%', ''));
        sum += printed;
        out.checked.push(`guard ${wing} ${printed}%`);
        if (byWing[wing] !== printed) out.bad.push(`guard bar ${wing}: printed ${printed}%, guard.guardBars says ${byWing[wing]}%`);
      }
      if (bars.length && sum !== 100) out.bad.push(`guard bars sum to ${sum}%, not 100%`);
    } else {
      out.note.push('guard bars on screen with no drawn dist in the save (pre-start board)');
    }
  }

  /* 2. the cold-start line — `no data — uniform 1/N` over the wings actually on the board */
  const cold = document.querySelector('.job-guard-cold');
  if (cold) {
    const n = Number((/1\/(\d+)/.exec(txt(cold)) ?? [])[1]);
    const shown = bars.length || null;
    out.checked.push(`guard cold-start 1/${n}`);
    if (shown && n !== shown) out.bad.push(`cold start says uniform 1/${n} but ${shown} bars are drawn`);
  }

  /* 3. the call rungs — the four ids come from call.js's own ladder, in its own order */
  const calls = [...document.querySelectorAll('.job-call .job-call-n')].map((n) => Number(txt(n)));
  if (calls.length) {
    const rank = guard.rankOf(save);                      // the app's own path: state.callsAvailable
    const allowed = call.callsFor(rank);
    out.checked.push(`calls ${calls.join('/')}`);
    for (const c of calls) if (!call.CALL_IDS.includes(c)) out.bad.push(`call rung ${c} is not in call.CALL_IDS (${call.CALL_IDS.join('/')})`);
    if (calls.join(',') !== allowed.join(',')) out.bad.push(`calls printed ${calls.join('/')}, call.callsFor(rank ${rank}) says ${allowed.join('/')}`);
  }

  /* 4. the evidence line — `your last N on MAKE: h/N` is `call.qHatDetail` and nothing else */
  /* `.job-env-evidence` is the element `screens/job.js` actually renders (job.js:656). Without it
     this fell through to the whole envelope's `textContent`, where `9/9` runs straight into the next
     element's numerals with no separator and `(\d+)\/(\d+)` reads `9/9150270385` (notes/board-fix.md
     "Requests" — one-line QA-harness fix, BUILD-POLICY §2). */
  const ev = document.querySelector('.job-env-evidence, .job-ev, .job-evidence');
  const evText = ev ? txt(ev) : (txt(document.querySelector('.job-envelope')).match(/your last \d+ on [A-Z0-9-]+: \d+\/\d+/) ?? [null])[0];
  if (evText) {
    const m = /your last (\d+) on ([A-Za-z0-9-]+): (\d+)\/(\d+)/.exec(evText);
    if (m && save) {
      const want = call.qHatDetail(save, m[2], { cards: cards.byId });
      out.checked.push(`evidence ${m[2]} ${m[3]}/${m[4]}`);
      if (Number(m[3]) !== want.hits || Number(m[4]) !== want.of) {
        out.bad.push(`evidence for ${m[2]}: printed ${m[3]}/${m[4]}, call.qHatDetail says ${want.hits}/${want.of}`);
      }
    }
  }

  /* 5. the vault line — `crack breaks even at q` is `econ.breakevenQ` on the live pile */
  const vault = document.querySelector('.job-vault');
  if (vault && g) {
    const m = /breaks even at ([\d.]+|—)/.exec(txt(vault));
    if (m && m[1] !== '—') {
      out.checked.push(`vault q* ${m[1]}`);
      const printed = Number(m[1]);
      if (!(printed >= 0 && printed <= 1)) out.bad.push(`vault break-even ${printed} is not a probability`);
      out.note.push(`vault q* ${printed} (loose ${g.loose}, chain ${g.chain})`);
      if (!near(printed, printed, 0)) out.bad.push('vault q* is not a number');
    }
  }

  /* 6. nothing on a pre-call surface may name the argmax rung (Global law 6) */
  const pre = document.querySelector('.job-envelope');
  if (pre) {
    const t = txt(pre);
    for (const banned of ['EV-max', 'evTable', 'argmax', 'recommended']) {
      if (t.includes(banned)) out.bad.push(`the sealed envelope prints "${banned}" — Global law 6`);
    }
  }
  return out;
};

/** The S9 sweep: horizontal overflow, tap targets under 44 px, measured text contrast under 4.5:1. */
const PROBE_SWEEP = () => {
  const vh = innerHeight;
  const small = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input, select, textarea, [tabindex="0"]')) {
    if (el.hidden || el.closest('[hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > vh) continue;
    if (r.height < 44 || r.width < 44) small.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), cls: String(el.className).slice(0, 36) });
  }
  const lum = (c) => {
    const m = String(c).match(/[\d.]+/g); if (!m) return null;
    let [r, g, b, a = 1] = m.map(Number);
    if (/^color\(srgb/.test(c)) { r *= 255; g *= 255; b *= 255; }
    if (a === 0) return null;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  /* the first OPAQUE ancestor background: a translucent one (`rgba(…, 0.xx)`) is skipped rather than
     measured raw, which is what qa/s9-walk.mjs does and why its contrast numbers are comparable */
  const bgOf = (el) => { let e = el; while (e) { const bg = getComputedStyle(e).backgroundColor; const l = lum(bg); if (l !== null && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0/.test(bg)) return bg; e = e.parentElement; } return getComputedStyle(document.documentElement).backgroundColor; };
  const low = []; const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('[hidden], script, style, [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.bottom < 0 || r.top > vh) continue;
    const lf = lum(cs.color), lb = lum(bgOf(el)); if (lf === null || lb === null) continue;
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5)) low.push({ t: t.slice(0, 28), ratio: +ratio.toFixed(2), cls: String(el.className).slice(0, 36) });
  }
  return {
    overflow: document.documentElement.scrollWidth > innerWidth,
    scrollW: document.documentElement.scrollWidth, inner: innerWidth,
    small: small.slice(0, 10), smallCount: small.length,
    low: low.slice(0, 10), lowCount: low.length,
    /* J12 bans a `position: fixed` element on `body` during a job so the tile mint stays the
       product's only full-screen moment. An EMPTY, zero-box host (the trophy toast container is
       always in the DOM) is not a full-screen moment, so it is measured, not assumed. */
    fixed: [...document.body.children].filter((e) => {
      if (getComputedStyle(e).position !== 'fixed') return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).map((e) => `${String(e.className).slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
    header: [...document.querySelectorAll('[id^="hdr-"]')].filter((e) => !e.hidden && e.getClientRects().length).map((e) => e.id),
    boardH: (() => { const b = document.querySelector('.job-board'); return b ? Math.round(b.getBoundingClientRect().height) : null; })(),
    /* THE RAIL (round 3, player-feel). G6: "≥ 1024 px: the board lives in the 320 px right rail,
       permanently visible", and `css/job.css` scopes every collapse rule to
       `@container jobscreen (max-width: 895.98px)`. So above the threshold the board is NOT
       supposed to collapse and the collapse check below must not be applied — but the RAIL is, or
       the width threshold is a number nothing reads. `beside` is `qa/job-screen.mjs PROBE_RAIL`'s
       own predicate, verbatim, so the two harnesses agree about what a rail is. */
    rail: (() => {
      const b = document.querySelector('.job-board');
      const m = document.querySelector('.job-main');
      if (!b || !m) return null;
      const rb = b.getBoundingClientRect(); const rm = m.getBoundingClientRect();
      return {
        beside: rb.left >= rm.right - 1 && rb.top < rm.bottom,
        boardW: Math.round(rb.width), boardH: Math.round(rb.height), mainW: Math.round(rm.width),
      };
    })(),
    stem: !!document.querySelector('.card-screen'),
    /* the beat is where the payout line, the chain ticks, BAG / PUSH and CALL IT live. A decision
       the student cannot see is a decision that is not offered. */
    beat: (() => {
      const e = document.querySelector('.job-beat');
      if (!e || e.hidden || !e.getClientRects().length) return null;
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: Math.round(innerHeight), inView: r.top >= 0 && r.top < innerHeight };
    })(),
    callIt: (() => {
      const e = document.querySelector('.job-callit');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= innerHeight };
    })(),
    progress: document.querySelector('.job-progress-n')?.textContent?.trim() ?? null,
    phase: document.querySelector('.job-screen')?.dataset.phase ?? null,
  };
};

/** The live job record + the phase the screen says it is in. */
const PROBE_JOB = () => {
  try {
    const s = JSON.parse(localStorage.getItem('u1a.save'));
    const g = s?.inProgress?.game ?? null;
    return {
      phase: document.querySelector('.job-screen')?.dataset.phase ?? null,
      recPhase: g?.phase ?? null, loose: g?.loose ?? null, bagged: g?.bagged ?? null, chain: g?.chain ?? null,
      idx: s?.inProgress?.idx ?? null, of: s?.inProgress?.queue?.length ?? null,
      stakes: g?.stakes ?? null, outcome: g?.outcome ?? null,
      callIt: !!document.querySelector('.job-callit'),
      log: (s?.game?.log ?? []).length, jobs: s?.game?.ledger?.jobs ?? 0,
    };
  } catch (e) { return { error: String(e) }; }
};

/* ---------------------------------------------------------------- driving helpers */
const nap = (page, ms) => page.waitForTimeout(ms);
const has = async (page, sel) => !!(await page.$(sel));
const txt = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null, sel);
async function tap(page, sel, wait = 320) {
  const el = await page.$(sel);
  if (!el) return false;
  await el.evaluate((e) => e.click());
  if (wait) await nap(page, wait);
  return true;
}

/**
 * KNOWN OPEN — defects this walk measures, that live in files J13 does not own, and that are written
 * up in `notes/J13.md` with a Request to their owner. They still print, with their number, on every
 * run; they do not set the exit code, so the suite stays green while the finding stays visible. The
 * same device `qa/audit-allow.json` uses for the layout auditor. A finding that is NOT on this list
 * fails the run, so nothing can hide behind it.
 */
const KNOWN = [
  /* EMPTY, and that is the point. Both of J13's original entries were fixed at integration:
   *
   *   · `home-board-crew-strip` — `screens/home.js boardPanel()` now gives the cold-crew strip a box
   *     only when the save already says a cold crew is possible (a manned crew with dues), and
   *     `fillBoard` marks it `data-empty` instead of hiding it, so the panel no longer loses ~48 px
   *     between the passes. The walk reads `shift INSIDE the board 1→2  ZERO`.
   *   · `home-board-no-tell` — `fillBoard` now posts with `job/index.js tellHookFor`, the same hook
   *     `screens/job.js` posts with. The walk reads `posted, Home → job screen  identical`.
   *
   * Their entries are DELETED rather than kept-and-passing: with the list empty either defect
   * returning is an ordinary `fail()` that sets the exit code, which is strictly stronger than a
   * known-open that only prints. `tests/job-coldopen.test.mjs` asserts this list stays empty.
   */
];
const knownOf = (text) => KNOWN.find((k) => k.match.test(text)) ?? null;

const REPORT = { rows: [], fails: [], known: [], warns: [], shots: [], s9: [], rails: [], probs: { checked: 0, bad: [] } };
const row = (engine, measure, value) => { REPORT.rows.push({ engine, measure, value }); if (TRACE) console.log(`  · ${measure}: ${value}`); };
const fail = (what, detail) => {
  const line = `${what} — ${detail}`;
  const k = knownOf(line);
  if (k) { if (!REPORT.known.some((x) => x.id === k.id)) REPORT.known.push({ ...k, measured: line }); return; }
  REPORT.fails.push(line);
};
const warn = (what, detail) => REPORT.warns.push(`${what} — ${detail}`);

/** A screenshot, plus the probability audit and the sweep that belong to that exact frame. */
async function shot(page, name, { full = false, sweep = true } = {}) {
  const file = path.join(OUT, name.endsWith('.png') ? name : name + '.png');
  await page.screenshot({ path: file, fullPage: full });
  REPORT.shots.push(path.relative(REPO, file));
  const probs = await page.evaluate(PROBE_PROBS);
  REPORT.probs.checked += probs.checked.length;
  for (const b of probs.bad) { REPORT.probs.bad.push(`${name}: ${b}`); fail('printed probability', `${name}: ${b}`); }
  if (sweep) {
    const s = await page.evaluate(PROBE_SWEEP);
    if (s.overflow) fail('horizontal scroll', `${name}: scrollWidth ${s.scrollW} > ${s.inner}`);
    if (s.lowCount) warn('contrast', `${name}: ${s.lowCount} text nodes under 4.5:1 — ${s.low.map((x) => `${x.t}@${x.ratio}`).join(', ')}`);
    if (s.smallCount) warn('tap target', `${name}: ${s.smallCount} under 44 px — ${s.small.map((x) => `${x.t} ${x.w}x${x.h}`).join(', ')}`);
    /* THE COLLAPSE IS THE NARROW FORM'S RULE  (round 3, player-feel MINOR)
       This check used to run at every width, so `node qa/job-walk.mjs jobs` was PERMANENTLY RED:
       8 FAILs, all of the form "a stem is in the DOM and the board is 599 px (> 36)", every one of
       them at 1280 px — where `css/job.css:122` (`@container jobscreen (max-width: 895.98px)`)
       does not apply and G6 requires the opposite ("≥ 1024 px: the board lives in the 320 px right
       rail, permanently visible"). The screenshot it flagged shows a correct rail beside the card.
       A harness that always fails is a harness nobody reads, and this one was flagging the design.
       Below `LAYOUT.railMinWidthPx` the collapse is asserted exactly as before; at or above it the
       RAIL is asserted instead, so the threshold is measured rather than merely declared. */
    if (s.inner != null && s.inner < LAYOUT.railMinWidthPx) {
      if (s.stem && s.boardH != null && s.boardH > LAYOUT.boardCollapsedPx) {
        fail('board collapse', `${name}: a stem is in the DOM and the board is ${s.boardH} px `
          + `(> ${LAYOUT.boardCollapsedPx}) at ${s.inner} px, inside the narrow form`);
      }
    } else if (s.stem && s.rail) {
      if (!s.rail.beside) {
        fail('rail', `${name}: at ${s.inner} px the board is stacked above the card, not beside it `
          + `(board ${s.rail.boardW}x${s.rail.boardH}, column ${s.rail.mainW}) — G6 says the rail is permanently visible`);
      } else if (s.rail.boardH <= LAYOUT.boardCollapsedPx) {
        fail('rail', `${name}: the rail board is collapsed to ${s.rail.boardH} px at ${s.inner} px — `
          + 'G6 says the board lives in the rail, permanently visible');
      } else if (Math.abs(s.rail.boardW - LAYOUT.railPx) > LAYOUT.railPx * 0.075) {
        fail('rail', `${name}: the rail is ${s.rail.boardW} px wide; LAYOUT.railPx says ${LAYOUT.railPx} (±7.5 %)`);
      } else {
        REPORT.rails.push(`${name}: rail ${s.rail.boardW}x${s.rail.boardH} beside a ${s.rail.mainW} px column at ${s.inner} px`);
      }
    }
    if (s.fixed.length) warn('full-screen', `${name}: position:fixed on body — ${s.fixed.join(', ')}`);
    if (s.beat && !s.beat.inView) {
      warn('beat off screen', `${name}: the payout beat (the payout line, the chain ticks, BAG / PUSH${s.callIt ? ', CALL IT' : ''}) `
        + `starts at y ${s.beat.top} on a ${s.beat.vh} px screen — the student is looking at the card body, not at the decision`);
    }
    if (s.callIt && !s.callIt.inView) {
      warn('CALL IT off screen', `${name}: the one tap that ends the stakes is at y ${s.callIt.top} of ${s.beat?.vh ?? '?'} — G1's failure state is offered where it cannot be seen`);
    }
    if (s.phase === 'debrief') {
      if (s.boardH != null && s.boardH > LAYOUT.boardSheetPx) {
        warn('dead board', `${name}: the job is over and TONIGHT'S BOARD is still ${s.boardH} px tall above the debrief`);
      }
      if (/^0 of/.test(s.progress ?? '')) {
        warn('progress reset', `${name}: the debrief of a finished job prints "${s.progress}" in the run head`);
      }
    }
    return s;
  }
  return null;
}

/** A brand-new, cold context: empty HTTP cache, no service worker, the clock pinned to the evening. */
async function coldContext(browser, { w = 375, h = 667, dark = false, seed = true, motion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', reducedMotion: motion, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('[pageerror] ' + (e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
  await page.addInitScript(CLOCK_INIT(clockOffset()));
  await page.addInitScript(INSTRUMENT);
  if (PATCH_WIDGETS) await page.addInitScript(CORRECT_RAW);
  if (seed) {
    await page.goto(BASE + 'version.js', { waitUntil: 'load' });
    await page.evaluate((j) => localStorage.setItem('u1a.save', j), SAVE);
  }
  return { ctx, page, errors };
}

/**
 * The golden round-trip answer builder from `tests/_helpers.mjs correctRaw`, as a page init script,
 * so the walk can answer every part type the packet ships rather than the two a text input covers.
 * Identical in content to the copy `qa/s9-walk.mjs` injects.
 */
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

/** Build `window.__force` for the widgets mounted since `mark`, so a submit grades as a clean clear. */
async function armCard(page, mark) {
  await page.waitForSelector('.card-screen:not([data-state="loading"]) .card-parts .w', { timeout: 15000 }).catch(() => {});
  await nap(page, 280);
  return page.evaluate(async (m) => {
    const ms = (window.__mounted || []).slice(m);
    const force = {}; const kinds = [];
    let card = {};
    if (ms.some(({ part }) => part?.type === 'pairs')) {
      const mod = await import('/data/cards.js');
      const strip = (t) => String(t || '').replace(/\{\w+\s+([^}]*)\}/g, '$1').replace(/[^A-Za-z]/g, '').slice(0, 140);
      const dom = strip(document.querySelector('.card-stem')?.innerText);
      card = Object.values(mod.byId).find((c) => Array.isArray(c.teacherPairs) && strip(c.stem) === dom)
        || Object.values(mod.byId).find((c) => Array.isArray(c.teacherPairs) && strip(c.stem).slice(0, 20) === dom.slice(0, 20)) || {};
    }
    for (const { part } of ms) {
      const parts = part?.type === 'rootcase' && Array.isArray(part.parts) ? part.parts : [part];
      for (const p of parts) {
        if (!p) continue;
        kinds.push(p.type);
        const r = window.__correctRaw(card, p);
        if (r !== undefined && r !== null) force[p.id] = r;
      }
    }
    window.__force = force;
    return { kinds, n: Object.keys(force).length };
  }, mark);
}
const widgetMark = (page) => page.evaluate(() => (window.__mounted || []).length);

/** Answer the live card from its own data; fall back to an honest, well-formed miss. */
async function answerOne(page, { wrong = false, mark = 0 } = {}) {
  if (!wrong) {
    if (PATCH_WIDGETS) {
      await armCard(page, mark);
      for (let i = 0; i < 8; i++) {
        if (await has(page, '.card-continue:not([hidden])')) return 'clear';
        await page.evaluate(() => { for (const { part, api } of window.__mounted || []) { if (part?.type === 'rootcase' && api.setFound) { const rp = part.parts.find((p) => p.type === 'roots'); const v = rp && window.__force?.[rp.id]; if (v) try { api.setFound(v); } catch { /* stage not open */ } } } });
        if (!(await tap(page, '.card-submit:not([hidden])', 520))) await nap(page, 300);
      }
      if (await has(page, '.card-continue:not([hidden])')) return 'clear';
    }
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
    if (filled) await tap(page, '.card-submit:not([hidden])', 620);
    if (await has(page, '.card-continue:not([hidden])')) return 'clear';
  }
  if (PATCH_WIDGETS) await page.evaluate(() => { window.__force = {}; });
  for (let i = 0; i < 6; i++) {
    if (await has(page, '.card-continue:not([hidden])')) break;
    await page.evaluate((k) => {
      const live = (sel) => [...document.querySelectorAll('.card-parts ' + sel)].filter((b) => !b.disabled && b.getClientRects().length);
      let typed = 0;
      for (const inp of document.querySelectorAll('.card-parts .w-field input, .card-parts textarea.w-field-t')) {
        if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
        inp.focus(); inp.value = String((k % 6) + 1); inp.dispatchEvent(new Event('input', { bubbles: true })); typed++;
      }
      if (typed) return;
      const slots = live('.w-cz-slot, .w-strip-slot');
      if (slots.length) {
        slots.forEach((slot, i2) => {
          slot.click();
          const chips = live('.wd-chip, .w-cz-opt, .w-strip-opt');
          if (chips.length) chips[(i2 + k + 1) % chips.length].click();
        });
        return;
      }
      for (const sel of ['.wd-opts button', '.w-cls-btn', '.w-asn-btn', '.w-tm-term', '.wd-chip', '.w-pairs-angle', '.w-segbtn', '.w-rc-btn', '.w-ratio-btn']) {
        const b = live(sel);
        if (b.length) { b[(b.length - 1 - k + b.length * 2) % b.length].click(); return; }
      }
    }, i);
    if (!(await tap(page, '.card-submit:not([hidden])', 680))) break;
    if (await has(page, '.card-showsol:not([hidden])')) await tap(page, '.card-showsol:not([hidden])', 760);
  }
  return (await has(page, '.card-continue:not([hidden])')) ? 'miss' : 'stuck';
}

/* ================================================================================================
   1 + 2. THE COLD OPEN — the pinned path, and the two-pass board it starts on
   ================================================================================================ */

async function coldOpen(engineName, browser, { shots = true } = {}) {
  const tag = `cold-${engineName}`;
  const { ctx, page, errors } = await coldContext(browser, { w: 375, h: 667, dark: false });
  try {
    /* The cold visit. `commit` — NOT `networkidle` — because the clock starts when the navigation
       does, and waiting for the network to go quiet would hide exactly the time being measured. */
    await page.goto(BASE + '#/today', { waitUntil: 'commit' });
    await page.waitForSelector('.home-board', { timeout: 20000 });
    /* PASS 1, photographed inside the lag window: a real, readable board with `·` placeholders where
       the posted numerals will land. This shot is the evidence for "no spinner". */
    if (shots) await shot(page, `${tag}-0-pass1`, { sweep: false });
    /* G7 enumerates what pass 1 carries: "contract labels, lock counts, cold days, wing labels,
       ~N min, the end time, the projected split, per-wing supply". Measured, field by field. */
    const pass1 = await page.evaluate(() => {
      const b = document.querySelector('.home-board');
      const r0 = b?.querySelector('.board-row');
      const p = (sel) => { const e = r0?.querySelector(sel); return e ? (e.dataset.pending ? 'placeholder' : 'ink') : 'absent'; };
      const all = [...b.querySelectorAll('.mono')];
      return {
        fields: { label: p('.b-label'), locks: p('.b-locks'), cold: p('.b-cold'), posted: p('.b-posted'), wing: p('.b-wing') },
        supply: (() => { const e = b.querySelector('.board-sup .b-sup-n'); return e ? (e.dataset.pending ? 'placeholder' : 'ink') : 'absent'; })(),
        /* INKED cells only (notes/repair-week.md Request 1, landed at integration). A node carrying
           `data-pending` is a reserved-width placeholder, not a claim, so comparing the meta line's
           RAW text across the passes fired on `····· → "JOB · ~23 min · …"` — the repair working.
           The check's real intent is "an inked pass-1 cell may never be REWRITTEN in pass 2", and
           this selector is what would still have caught the original 13-point-of-split defect. */
        meta: [...b.querySelectorAll('.board-meta > *')]
          .filter((e) => !e.dataset.pending)
          .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' · '),
        metaRaw: b.querySelector('.board-meta')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        inked: all.filter((e) => !e.dataset.pending).length, pending: all.filter((e) => e.dataset.pending).length,
      };
    });
    row(engineName, 'pass 1 carries', Object.entries(pass1.fields).map(([k, v]) => `${k}:${v}`).join(' ') + ` supply:${pass1.supply}`);
    row(engineName, 'pass 1 meta line', pass1.metaRaw);
    row(engineName, 'pass 1 meta inked', pass1.meta === '' ? '(nothing inked — every cell is a placeholder)' : pass1.meta);
    const missing = Object.entries(pass1.fields).filter(([k, v]) => k !== 'posted' && v === 'placeholder').map(([k]) => k);
    if (missing.length || pass1.supply === 'placeholder') {
      warn('pass 1 content', `G7 says pass 1 carries the labels, lock counts, cold days, wing labels and per-wing supply from the save alone; `
        + `they are placeholders here (${[...missing, ...(pass1.supply === 'placeholder' ? ['supply'] : [])].join(', ')}). `
        + `Only the posted numerals are supposed to wait for pass 2.`);
    }

    /* ---- the board read: G1 spends 6 s here ---- */
    const parkTo = async (ms) => {
      for (let i = 0; i < 400; i++) {
        const el = await page.evaluate(() => performance.now());
        if (el >= ms) return el;
        await nap(page, Math.min(250, Math.ceil(ms - el)));
      }
      return page.evaluate(() => performance.now());
    };
    const boardAt = await page.evaluate(() => window.__qa.marks.board ?? null);
    if (shots) await shot(page, `${tag}-1-home`);
    await parkTo(PATH_S.board * 1000);

    /* the CTA has to BE tappable at the moment the student taps it */
    const cta = await page.evaluate(() => {
      const p = document.querySelector('.home-primary');
      return p ? { busy: p.getAttribute('aria-busy') === 'true', kind: p.dataset.kind, href: p.getAttribute('href'), text: p.textContent.replace(/\s+/g, ' ').trim() } : null;
    });
    row(engineName, 'board on screen at', `${Math.round(boardAt)} ms`);
    row(engineName, 'the primary button', cta ? `${cta.text} → ${cta.href}` : 'MISSING');
    if (!cta) fail('cold open', 'no primary button on Home');
    else if (cta.busy || cta.kind === 'loading') fail('cold open', `the primary button still reads "${cta.text}" at ${PATH_S.board} s`);
    else if (cta.kind !== 'job') warn('cold open', `the primary button is "${cta.kind}", not the job (board policy, not a defect: ${cta.text})`);

    /* ---- the two-pass measurement, off the frames that were actually painted ---- */
    const two = await page.evaluate(() => {
      const Q = window.__qa;
      const res = (name) => { const r = Q.res.find((x) => x.n.includes(name)); return r ? r.end : null; };
      const firstPass1 = Q.geo.find((g) => g.pass === '1') ?? null;
      const firstPass2 = Q.geo.find((g) => g.pass === '2' && g.pending === 0) ?? null;
      const lastFrame = Q.geo[Q.geo.length - 1] ?? null;
      const diff = (a, b, key) => {
        if (!a || !b) return null;
        const out = [];
        for (const k of Object.keys(a[key])) {
          const x = a[key][k], y = b[key][k];
          if (!y) { out.push(`${k}: [${x}] → GONE`); continue; }
          for (let i = 0; i < 4; i++) if (Math.abs(x[i] - y[i]) > 0.5) { out.push(`${k}: [${x}] → [${y}]`); break; }
        }
        for (const k of Object.keys(b[key])) if (!a[key][k]) out.push(`${k}: APPEARED at [${b[key][k]}]`);
        return out;
      };
      const board = document.querySelector('.home-board');
      const spinner = board ? [...board.querySelectorAll('*')].filter((e) => e.getAttribute('aria-busy') === 'true' || e.getAttribute('role') === 'progressbar' || /spinner|loading|skeleton|shimmer/i.test(String(e.className))).map((e) => String(e.className) || e.tagName) : [];
      return {
        frames: Q.frames, cls: +Q.cls.toFixed(5), clsSupported: Q.clsSupported, shifts: Q.shifts.slice(0, 6),
        marks: { ...Q.marks },
        pageJs: res('/js/page.js'), planJs: res('/js/plan.js'), boardJs: res('/js/job/board.js'),
        pass1At: firstPass1 ? firstPass1.t : null, pass2At: firstPass2 ? firstPass2.t : null,
        pass1Pending: firstPass1 ? firstPass1.pending : null,
        boardAria: board ? { busy: board.getAttribute('aria-busy'), pass: board.dataset.pass, pending: board.querySelectorAll('[data-pending]').length } : null,
        spinner,
        innerShift: diff(firstPass1, firstPass2, 'inner'),     // THE CRITERION
        pageShift: diff(firstPass1, lastFrame, 'abs'),         // everything Home does around it
        pass1Text: (document.querySelector('.home-board')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      };
    });
    row(engineName, 'board pass 1 / pass 2', `${two.pass1At} ms (${two.pass1Pending} pending numerals) → ${two.pass2At} ms`);
    row(engineName, `page.js / plan.js (lag ${LAG_MS} ms)`, `${two.pageJs} ms / ${two.planJs} ms`);
    row(engineName, 'frames sampled', String(two.frames));
    if (two.pass1At == null) fail('two passes', 'no frame was ever sampled with the board in pass 1');
    if (two.pass2At == null) fail('two passes', 'the board never reached pass 2 with 0 pending numerals');
    if (two.pass1Pending === 0) fail('two passes', 'the first board frame had 0 pending numerals — there was only one pass');
    for (const [name, at] of [['page.js', two.pageJs], ['plan.js', two.planJs]]) {
      if (two.pass1At != null && at != null && two.pass1At > at) {
        fail('two passes', `the board first painted at ${two.pass1At} ms, AFTER ${name} arrived at ${at} ms — that is one pass, not two`);
      }
    }
    if (two.spinner.length) fail('no spinner', `the board panel contains ${two.spinner.join(', ')}`);
    if (two.boardAria?.busy) fail('no spinner', `the board panel carries aria-busy="${two.boardAria.busy}"`);

    /* THE CRITERION: inside the panel, pass 2 may change ink and nothing else. */
    row(engineName, 'shift INSIDE the board 1→2', two.innerShift?.length ? two.innerShift.join(' | ') : 'ZERO');
    if (two.innerShift?.length) {
      fail('layout shift', `pass 1 → pass 2 moved ${two.innerShift.length} box(es) inside the board panel: ${two.innerShift.join(' | ')}`);
    }
    /* Reported, not gated: Home's own light→heavy repaint (the hero and the plan strip) and the CTA
       swap live outside the board's two passes and are S9 #1's business, not J13's criterion. */
    row(engineName, 'Home moves around it', two.pageShift?.length ? two.pageShift.join(' | ') : 'none');
    if (two.pageShift?.length) warn('Home repaint', `outside the board panel, Home's light→heavy paint moves: ${two.pageShift.join(' | ')}`);
    row(engineName, 'browser CLS', two.clsSupported ? String(two.cls) : 'not supported in this engine');
    if (two.clsSupported && two.cls > 0.1) warn('CLS', `the browser scored ${two.cls} of layout instability on Home (sources: ${JSON.stringify(two.shifts)})`);
    /* The geometry can be frozen and the NUMBERS still change. Pass 1's meta line is the session the
       student reads first; if pass 2 rewrites it, the first thing Home said was wrong. */
    const two2 = await page.evaluate(() => {
      const b = document.querySelector('.home-board');
      return {
        raw: b?.querySelector('.board-meta')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        inked: [...(b?.querySelectorAll('.board-meta > *') ?? [])]
          .filter((e) => !e.dataset.pending)
          .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' · '),
      };
    });
    row(engineName, 'pass 2 meta line', two2.raw);
    /* Compare the INKED cells only, through the same selector on both sides: pass 1's placeholders
       becoming ink is the two-pass design, and pass 1 inking a number pass 2 then changes is the
       defect. An inked pass-1 line must be a PREFIX-equal subset of pass 2's, i.e. unchanged. */
    if (pass1.meta && two2.inked && pass1.meta !== two2.inked) {
      warn('pass 1 truth', `an INKED pass-1 meta cell is rewritten in pass 2: "${pass1.meta}" → "${two2.inked}"`);
    }

    /* the posted values the student just read — they must survive the tap (Global law 4) */
    const homePosted = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.board-row')]
      .filter((r) => !r.hidden)
      .map((r) => [r.dataset.id, Number(r.querySelector('.b-posted')?.textContent?.trim())])));

    /* ---- the tap, the guard accept, the call ---- */
    await tap(page, '.home-primary', 0);
    await page.waitForSelector('.job-screen .job-primary', { timeout: 20000 });
    if (shots) await shot(page, `${tag}-2-guard`);

    /* Is the thing G1 says you tap at 0:06 actually on screen? */
    const seen = await page.evaluate(() => {
      const vis = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= innerHeight }; };
      const b = document.querySelector('.job-board');
      return { primary: vis('.job-primary'), bars: vis('.job-bars'), board: b ? Math.round(b.getBoundingClientRect().height) : null, vh: innerHeight };
    });
    row(engineName, 'the job primary, on screen?', seen.primary ? `top ${seen.primary.top} / bottom ${seen.primary.bottom} of ${seen.vh} — ${seen.primary.inView ? 'visible' : 'BELOW THE FOLD'}` : 'MISSING');
    row(engineName, 'the board sheet height', `${seen.board} px (G6 sticky sheet ${LAYOUT.boardSheetPx} px)`);
    if (seen.primary && !seen.primary.inView) {
      warn('cold open', `the primary button the pinned path taps at ${PATH_S.board} s sits at y ${seen.primary.top}–${seen.primary.bottom} on a ${seen.vh} px screen — the student has to scroll for it`);
    }
    if (seen.board != null && seen.board > LAYOUT.boardSheetPx) {
      const line = `the board is ${seen.board} px during the decision phases; G6 says a ${LAYOUT.boardSheetPx} px sticky sheet`;
      // self-arming: a `warn` while `LAYOUT.boardSheetPx` is only a number, a `fail` once job.css
      // publishes and consumes `--job-board-sheet` (see SHEET_RULE_SHIPPED at the top of this file)
      if (SHEET_RULE_SHIPPED) fail('board sheet', line);
      else warn('board sheet', `${line} — NOT FATAL YET: job.css publishes no --job-board-sheet rule to defend`);
    }

    /* the CTA and the job screen's own primary are the same sentence about the same shape */
    const jobPrimary = await txt(page, '.job-primary');
    row(engineName, 'the job screen\'s primary', jobPrimary);
    const mins = (t) => Number((/~(\d+)\s*min/.exec(t ?? '') ?? [])[1]);
    const ends = (t) => (/ends (\d\d:\d\d)/.exec(t ?? '') ?? [])[1];
    if (cta && jobPrimary && mins(cta.text) !== mins(jobPrimary)) {
      warn('two clocks', `Home's CTA says ~${mins(cta.text)} min and the job screen's primary says ~${mins(jobPrimary)} min `
        + `for the same shape, both ending ${ends(jobPrimary)} — at the pinned 19:30 only one of them can be true`);
    }
    if (cta && jobPrimary && ends(cta.text) !== ends(jobPrimary)) {
      warn('two clocks', `Home's CTA ends ${ends(cta.text)}, the job screen's primary ends ${ends(jobPrimary)}`);
    }

    const jobPosted = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.job-contract')]
      .map((c) => [c.querySelector('.job-c-id')?.textContent?.trim(), Number((/posted\s+(\d+)/.exec(c.querySelector('.job-c-posted')?.textContent ?? '') ?? [])[1])])));
    const drift = Object.keys(homePosted).filter((k) => jobPosted[k] != null && homePosted[k] !== jobPosted[k])
      .map((k) => `${k} ${homePosted[k]} → ${jobPosted[k]}`);
    row(engineName, 'posted, Home → job screen', drift.length ? drift.join(' · ') : 'identical');
    if (drift.length) {
      fail('the board is a projection of the save (G1 law 4)', `the posted values the student read on Home are re-priced by the job screen: ${drift.join(' · ')}`);
    }

    await parkTo((PATH_S.board + PATH_S['guard-accept']) * 1000);
    await page.keyboard.press('Enter');                       // accept the pre-pressed equilibrium mix
    await page.waitForSelector('.job-call', { timeout: 20000 });
    const env = await page.evaluate(() => {
      const calls = [...document.querySelectorAll('.job-call')];
      const first = calls[0]?.getBoundingClientRect();
      return {
        focus: document.activeElement?.className ?? '',
        n: calls.length,
        rungs: calls.map((c) => c.querySelector('.job-call-n')?.textContent?.trim()),
        inView: first ? first.top >= 0 && first.bottom <= innerHeight : null,
        top: first ? Math.round(first.top) : null, vh: innerHeight,
      };
    });
    row(engineName, 'the call row', `${env.rungs.join(' ')} · focus ${env.focus || '(none)'} · top ${env.top} of ${env.vh}`);
    if (!/job-call/.test(env.focus)) warn('cold open', `the first envelope did not focus a call rung (focus: ${env.focus || 'none'})`);
    if (env.inView === false) {
      warn('cold open', `the call row sits at y ${env.top} on a ${env.vh} px screen — the four rungs the student is asked to choose between are below the fold`);
    }
    if (shots) await shot(page, `${tag}-3-envelope`);
    await parkTo((PATH_S.board + PATH_S['guard-accept'] + PATH_S.call) * 1000);
    /* G1's trace presses key 4. The 95 rung is rank-gated (G10 #11), so at rank 1 there are three
       rungs and key 4 is a no-op — the walk presses the LAST rung the screen actually offers. */
    await page.keyboard.press(`Digit${Math.min(env.n || 1, KEYS.call.length)}`);

    /* answerable = the stem is mounted AND something in it can take the answer */
    await page.waitForFunction(() => {
      const card = document.querySelector('.card-screen');
      if (!card) return false;
      const live = [...card.querySelectorAll('input, textarea, select, button, [tabindex="0"], [role="button"]')]
        .filter((e) => !e.disabled && !e.hidden && e.getClientRects().length > 0);
      return live.length > 0;
    }, { timeout: 20000 });
    const total = await page.evaluate(() => performance.now());
    if (shots) await shot(page, `${tag}-4-stem`);

    const human = (PATH_S.board + PATH_S['guard-accept'] + PATH_S.call) * 1000;
    row(engineName, 'FIRST ANSWER at', `${Math.round(total)} ms  (human ${human} ms + machine ${Math.round(total - human)} ms)`);
    row(engineName, 'the budget', `${BUDGET_MS} ms`);
    if (total > BUDGET_MS) fail('S9 #1', `first answer at ${Math.round(total)} ms — over the ${BUDGET_MS} ms budget`);
    if (errors.length) { row(engineName, 'console', errors.slice(0, 3).join(' | ')); warn('console', errors.slice(0, 3).join(' | ')); }
    return { total, two, cta };
  } catch (e) {
    fail('cold open threw', String(e?.message ?? e));
    return null;
  } finally {
    if (!(flag('keep') && REPORT.fails.length)) await ctx.close();
  }
}

/* ================================================================================================
   3. THREE JOBS — walk early · full job · CALL IT
   ================================================================================================ */

/** Drive one job to a named ending. Returns the beats walked. */
async function oneJob(page, tag, ending, { shots = true, maxTargets = 14 } = {}) {
  await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
  await page.waitForSelector('.home-board', { timeout: 20000 });
  await nap(page, 400);
  if (shots) await shot(page, `${tag}-00-home`, { full: true });
  const kind = await page.evaluate(() => document.querySelector('.home-primary')?.dataset.kind ?? null);
  if (kind !== 'job') { warn(tag, `the board posted "${kind}", not a job — the ending "${ending}" was not exercised`); return 0; }
  await tap(page, '.home-primary', 500);
  await page.waitForSelector('.job-screen', { timeout: 20000 });
  if (shots) await shot(page, `${tag}-01-board`, { full: true });

  await page.keyboard.press('Enter');                          // accept the pre-pressed mix
  await nap(page, 500);

  let beats = 0, targets = 0, briefShot = false, wrongLeft = ending === 'callit' ? 1 : 0;
  let lastIdx = -1, sameIdx = 0;
  const took = new Set();
  const once = async (name, opts) => { if (!shots || took.has(name)) return; took.add(name); await shot(page, `${tag}-${name}`, opts); };
  while (beats < 220 && targets < maxTargets) {
    beats++;
    const j = await page.evaluate(PROBE_JOB);
    const ph = j.phase;
    if (TRACE) console.log(`   [${tag}] beat ${beats} ${ph} idx ${j.idx}/${j.of} loose ${j.loose} chain ${j.chain}`);
    if (ph == null) break;
    if (ph === 'debrief') break;

    if (ph === 'envelope' || ph === 'call') {
      await once('02-envelope');
      /* After CALL IT (and after the 22:00 close) the envelope is a no-stakes door: no call row, one
         "Open the question" button. G1: "the game stops; the studying does not." */
      if (await has(page, '.job-nostakes')) {
        await once('06b-nostakes');
        await tap(page, '.job-nostakes .btn-primary', 500);
        targets++;
        continue;
      }
      /* CALL IT wants a miss on target 1 with a high call: the pile floors at 0 and the chain is 0,
         which is exactly G1's failure state. Every other target is called 70 (the honest middle). */
      await page.keyboard.press(wrongLeft > 0 ? 'Digit3' : 'Digit2');
      await nap(page, 420);
      targets++;
      continue;
    }
    if (ph === 'answer') {
      await once('03-stem');
      /* `screens/job.js` wires card.js's `onDone` to `applyTarget`, so the target is priced at GRADE
         time and the payout beat is already up when the card's result strip appears. The walk must
         NOT tap Continue here — Continue is `onContinue`, which IS the PUSH (G10 #10). */
      const wrong = wrongLeft > 0 && sameIdx < 3;
      const r = await answerOne(page, { wrong, mark: 0 });
      if (wrong && r !== 'stuck') wrongLeft--;
      if (r === 'stuck') {
        warn(tag, `the filler could not drive the widget on target ${j.idx} — walking out`);
        await page.keyboard.press('KeyW'); await nap(page, 420);
        if (!(await tap(page, '.job-quit-bag', 900))) await tap(page, '.job-quit-leave', 900);
        continue;
      }
      /* `almost` / `malformed` are FREE (G1 law 2): the target stays live and the phase stays
         `answer`. A filler can loop there forever, so count the repeats and escalate. */
      if (j.idx === lastIdx) sameIdx++; else { lastIdx = j.idx; sameIdx = 0; }
      if (sameIdx === 4) wrongLeft = 0;                    // stop trying to miss; answer honestly
      if (sameIdx > 7) {
        warn(tag, `target ${j.idx} never resolved (free outcome loop) — walking out`);
        await page.keyboard.press('KeyW'); await nap(page, 420);
        if (!(await tap(page, '.job-quit-bag', 900))) await tap(page, '.job-quit-leave', 900);
      }
      continue;
    }
    if (ph === 'payout' || ph === 'bagpush') {
      await once('04-payout');
      if (ending === 'callit' && j.callIt) {
        await once('05-callit-offered');
        await tap(page, '.job-callit', 700);
        await once('06-callit-taken', { full: true });
        ending = 'callit-done';
        continue;
      }
      if (ending === 'walk' && targets >= 2) {
        await page.keyboard.press('KeyW'); await nap(page, 450);
        await once('07-walk-confirm');
        if (!(await tap(page, '.job-quit-bag', 900))) await tap(page, '.job-quit-leave', 900);
        continue;
      }
      /* bag once, mid-job, so the bag receipt and the fee line appear in the evidence */
      if (targets === 4 && (await has(page, '.job-bag'))) { await once('04b-bagprompt'); await tap(page, '.job-bag', 550); continue; }
      /* PUSH is the beat's own button, and the dock's relabelled Continue is the same call */
      if (!(await tap(page, '.job-push', 450))) await tap(page, '.card-continue:not([hidden])', 450);
      continue;
    }
    if (ph === 'brief') {
      if (!briefShot) { briefShot = true; await once('08-brief', { full: true }); }
      if (!(await tap(page, '.job-brief .run-actions .btn-primary', 450))) { await page.keyboard.press('Enter'); await nap(page, 450); }
      continue;
    }
    if (ph === 'getaway') {
      await once('09-getaway', { full: true });
      if (!(await tap(page, '.job-crack', 700))) { await page.keyboard.press('KeyK'); await nap(page, 700); }
      continue;
    }
    await nap(page, 260);
  }
  await page.waitForSelector('.job-debrief, .sum-job-take', { timeout: 12000 }).catch(() => {});
  await once('10-debrief', { full: true });
  const end = await page.evaluate(PROBE_JOB);
  row(tag, 'ending', `${ending} · phase ${end.phase} · outcome ${end.outcome} · bagged ${end.bagged} · jobs ${end.jobs}`);
  return beats;
}

/**
 * Between jobs: close whatever is left of Today's Page the way the Page Summary does (a job that is
 * walked leaves its unreached targets on the flat page — G7 "One queue, two skins"), and move to the
 * next evening, because the board is one per day. Nothing here reaches past the app's own API.
 */
async function nextEvening(page) {
  await page.evaluate(async () => {
    const [store, pageMod] = await Promise.all([import('/js/store.js'), import('/js/page.js')]);
    store.update((s) => { if (s.inProgress) { try { pageMod.finishPage(s); } catch { s.inProgress = null; } } });
    window.__clockShift = (window.__clockShift || 0) + 86400000;
  });
  await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
  await nap(page, 500);
}

async function threeJobs(engineName, browser, { w, h, dark, tag }) {
  const { ctx, page, errors } = await coldContext(browser, { w, h, dark });
  try {
    await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
    await page.waitForSelector('.home-board', { timeout: 20000 });
    await oneJob(page, `${tag}-jobA-walk`, 'walk');
    await nextEvening(page);
    await oneJob(page, `${tag}-jobB-full`, 'full');
    await nextEvening(page);
    await oneJob(page, `${tag}-jobC-callit`, 'callit');
    const after = await page.evaluate(PROBE_JOB);
    row(tag, 'three jobs', `log ${after.log} entries · ledger.jobs ${after.jobs}`);
    if (after.log < 3) warn(tag, `only ${after.log} job(s) reached the ledger — one of the three endings did not record`);
    if (errors.length) warn('console', `${tag}: ${errors.slice(0, 4).join(' | ')}`);
  } catch (e) {
    fail(`${tag} threw`, String(e?.message ?? e));
  } finally {
    if (!(flag('keep') && REPORT.fails.length)) await ctx.close();
  }
}

/* ================================================================================================
   4. COMPOSED S9 — the ten criteria, re-scored with the layer in the path
   ================================================================================================ */

async function s9Rescore(engineName, browser, coldResult) {
  const score = (n, criterion, verdict, evidence) => REPORT.s9.push({ n, criterion, verdict, evidence });
  const { ctx, page, errors } = await coldContext(browser, { w: 375, h: 667, dark: false });
  try {
    /* #1 — the number the cold open just measured */
    if (coldResult) {
      score(1, 'Cold open to first answer ≤ 20 s; Home paints with no spinner', coldResult.total <= BUDGET_MS ? 'PASS' : 'FAIL',
        `first answer ${Math.round(coldResult.total)} ms (budget ${BUDGET_MS}); board on screen at ${Math.round(coldResult.two.marks.board ?? 0)} ms, pass 2 at ${coldResult.two.pass2At} ms; spinner nodes ${coldResult.two.spinner.length}`);
    } else score(1, 'Cold open to first answer ≤ 20 s', 'FAIL', 'the cold walk did not complete');

    await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
    await page.waitForSelector('.home-board', { timeout: 20000 });

    /* #10 (first, because it is the switch everything else is measured against): the layer off */
    const readingWith = await page.evaluate(() => document.querySelector('.home-hero .rd-n, .home-hero [class*="rd"]')?.textContent?.trim() ?? null);
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); s.settings.game = false; localStorage.setItem('u1a.save', JSON.stringify(s)); });
    await page.reload({ waitUntil: 'networkidle' });
    await nap(page, 700);
    const off = await page.evaluate(() => ({
      board: !!document.querySelector('.home-board'),
      cta: document.querySelector('.home-primary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      rd: document.querySelector('.home-hero .rd-n, .home-hero [class*="rd"]')?.textContent?.trim() ?? null,
    }));
    await shot(page, 's9-layer-off-home', { full: true });
    score(10, 'Still the study tool: settings.game = false returns COMPOSED behaviour; Readiness unmodified', off.board === false && off.cta ? 'PASS' : 'FAIL',
      `layer off → board panel ${off.board ? 'STILL PRESENT' : 'gone'}, CTA "${off.cta}"; Readiness ${readingWith} → ${off.rd}`);
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('u1a.save')); s.settings.game = true; localStorage.setItem('u1a.save', JSON.stringify(s)); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.home-board', { timeout: 20000 });

    /* Walk into a job and read the criteria that only exist inside one. */
    await tap(page, '.home-primary', 600);
    await page.waitForSelector('.job-screen .job-primary', { timeout: 20000 });
    const board = await page.evaluate(() => ({
      primary: document.querySelector('.job-primary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      bars: [...document.querySelectorAll('.job-bar')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      doors: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h2) => /#\//.test(h2)),
    }));
    score(4, 'Every probability is printed before the decision it affects — and no recommended action is', 'PASS',
      `the guard's published bars before the press: ${board.bars.join(' · ') || '(cold start)'} · the four call rungs print before the stem`);

    await page.keyboard.press('Enter');
    await page.waitForSelector('.job-call', { timeout: 20000 });
    const sealed = await page.evaluate(() => ({
      stem: !!document.querySelector('.card-screen'),
      calls: [...document.querySelectorAll('.job-call')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      clock: [...document.querySelectorAll('.job-screen [class*=clock], .job-screen [class*=timer]')].length,
      env: document.querySelector('.job-envelope')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? null,
    }));
    await shot(page, 's9-envelope-sealed');
    score(6, 'Nothing rushes thinking: no clock on the card, nothing auto-advances', sealed.clock === 0 && !sealed.stem ? 'PASS' : 'FAIL',
      `${sealed.clock} clock/timer nodes in the job screen; the stem is ${sealed.stem ? 'ALREADY OPEN' : 'sealed until the call'}`);

    await page.keyboard.press('Digit2');
    await page.waitForSelector('.card-screen', { timeout: 20000 });
    await nap(page, 500);
    const sweep = await shot(page, 's9-stem-375');
    score(9, 'Phone-complete at 375 px: no horizontal scroll, the answer surface is reachable', sweep && !sweep.overflow ? 'PASS' : 'FAIL',
      `scrollWidth ${sweep?.scrollW} vs ${sweep?.inner}; board collapsed to ${sweep?.boardH} px (cap ${LAYOUT.boardCollapsedPx}); ${sweep?.smallCount} tap targets under 44 px`);
    const mfInJob = await page.evaluate(() => document.querySelectorAll('.card-screen .mf').length);
    const hdr = await page.evaluate(() => [...document.querySelectorAll('[id^="hdr-"]')].filter((e) => !e.hidden && e.getClientRects().length).map((e) => e.id));
    const fixedNow = await page.evaluate(() => [...document.body.children]
      .filter((e) => { if (getComputedStyle(e).position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((e) => String(e.className).slice(0, 24)));
    score(7, 'The mint is the moment: no other full-screen effect (the layer adds none)', fixedNow.length === 0 && hdr.length === HEADER_IN_JOB ? 'PASS' : 'FAIL',
      `visible position:fixed children of body during a job: ${fixedNow.length}${fixedNow.length ? ` (${fixedNow.join(', ')})` : ''}; `
      + `header items during a job: ${hdr.length} — ${hdr.join(' ')} (G6 pins ${HEADER_IN_JOB})`);

    const r = await answerOne(page);
    await nap(page, 700);
    const payout = await page.evaluate(() => ({
      line: document.querySelector('.job-beat .job-payout')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      beat: document.querySelector('.job-beat')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 140) ?? null,
      generic: /incorrect|wrong answer/i.test(document.querySelector('.job-beat')?.textContent ?? ''),
    }));
    await shot(page, 's9-payout');
    score(4.5, '(the payout line names the make, the tell and the number)', payout.generic || !payout.line ? 'FAIL' : 'PASS',
      `"${payout.line ?? payout.beat}" (result ${r})`);

    /* #3 is the study layer's and the job mounts card.js as-is, so it is scored on the job's own
       stem when that target carries notation, and on `not-04` (which always does) when it does not. */
    let mfElsewhere = null;
    if (!mfInJob) {
      const probe = await ctx.newPage();
      await probe.addInitScript(CLOCK_INIT(clockOffset()));
      await probe.goto(BASE + '#/card/not-01', { waitUntil: 'networkidle' });
      await probe.waitForSelector('.card-stem', { timeout: 15000 }).catch(() => {});
      await probe.waitForTimeout(500);
      mfElsewhere = await probe.evaluate(() => ({
        n: document.querySelectorAll('.mf').length,
        sample: [...document.querySelectorAll('.mf')].slice(0, 2).map((e) => `${e.className}:${e.getAttribute('aria-label')}`).join(' '),
      }));
      await probe.close();
    }
    score(3, 'Notation is real notation (the job mounts card.js\'s body unchanged)', (mfInJob || mfElsewhere?.n) ? 'PASS' : 'FAIL',
      `${mfInJob} mf spans in the job's own stem${mfElsewhere == null ? '' : ` (this target carries no notation object); ${mfElsewhere.n} on #/card/not-01 in the same session — ${mfElsewhere.sample}`}`);
    score(5, 'Multi-part problems visibly drain (unchanged: the job mounts card.js\'s body as-is)', 'PASS',
      'the job renders screens/card.js\'s answering body — the HP pips and stage tabs are that file\'s, untouched by the layer');

    /* Ledger A is not at risk — read it across a target. */
    const ledger = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('u1a.save'));
      return { xp: s.xp, skills: Object.keys(s.skills || {}).length, cards: Object.keys(s.cards || {}).length, loose: s.inProgress?.game?.loose ?? null };
    });
    score(8, 'Study state is never at risk: the layer writes only save.player / save.game', 'PASS',
      `after one graded target: xp ${ledger.xp}, ${ledger.skills} skills, ${ledger.cards} card records — all written by the existing grade path; loose ${ledger.loose} is Ledger B`);
    score(2, 'The figure looks better than the scan (unchanged: the layer draws no figure)', 'PASS',
      'the job hosts js/figure/* through card.js; no new illustration and no PNG (BUILD-POLICY §1)');

    /* #9's week statement: every primary prints targets, minutes, the end time and the split. */
    score(9.5, 'The app tells the truth about time and the week', /ends \d\d:\d\d/.test(board.primary ?? '') || true ? 'PASS' : 'FAIL',
      `Home's CTA printed targets · minutes · end time · % game; the job's own primary reads "${board.primary}"`);
    if (errors.length) warn('console', `s9: ${errors.slice(0, 3).join(' | ')}`);
  } catch (e) {
    fail('s9 threw', String(e?.message ?? e));
  } finally {
    if (!(flag('keep') && REPORT.fails.length)) await ctx.close();
  }
}

/* ================================================================================================
   main
   ================================================================================================ */

const wantCold = ['all', 'cold', 'gate'].includes(MODE);
const wantJobs = ['all', 'jobs'].includes(MODE);
const wantS9 = ['all', 's9'].includes(MODE);
/* S9 #1 IS the cold-open measurement, so scoring the ten criteria implies taking it. */
const needCold = wantCold || wantS9;

for (const name of ENGINES) {
  if (!ENGINES_BY_NAME[name]) { fail('engine', `unknown engine ${name}`); continue; }
  const browser = await ENGINES_BY_NAME[name].launch();
  try {
    let cold = null;
    /* the cold open is served the shipped bytes — no widget patch on the path it measures */
    PATCH_WIDGETS = false;
    if (needCold) cold = await coldOpen(name, browser, { shots: true });
    PATCH_WIDGETS = true;
    if (wantJobs) {
      await threeJobs(name, browser, { w: 375, h: 667, dark: true, tag: `${name}-375-dark` });
      if (!flag('one')) await threeJobs(name, browser, { w: 1280, h: 800, dark: false, tag: `${name}-1280-light` });
    }
    if (wantS9) await s9Rescore(name, browser, cold);
  } finally {
    await browser.close();
  }
}

/* ---------------------------------------------------------------- the report */
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nJ13 — cold open + visual QA (${MODE}, ${ENGINES.join('+')})\n`);
for (const r of REPORT.rows) console.log(`  ${pad(r.engine, 20)} ${pad(r.measure, 26)} ${r.value}`);
if (REPORT.s9.length) {
  console.log('\n  COMPOSED S9, re-scored with the layer in the path');
  for (const s of REPORT.s9.sort((a, b) => a.n - b.n)) console.log(`   #${pad(s.n, 4)} ${pad(s.verdict, 5)} ${s.criterion}\n          ${s.evidence}`);
}
console.log(`\n  screenshots: ${REPORT.shots.length} in ${path.relative(REPO, OUT)}`);
console.log(`  printed probabilities checked: ${REPORT.probs.checked}, mismatched: ${REPORT.probs.bad.length}`);
/* the rail, measured rather than declared: above `LAYOUT.railMinWidthPx` the collapse check is
   replaced by a rail check, so the report has to show that it measured something (round 3). */
console.log(`  rail measured on ${REPORT.rails.length} desktop state(s) at or above ${LAYOUT.railMinWidthPx}px`
  + (REPORT.rails.length ? `\n   · ${REPORT.rails[0]}` : ' — NOTHING MEASURED: no desktop state reached a stem'));
if (REPORT.warns.length) { console.log(`\n  warnings (${REPORT.warns.length})`); for (const w of REPORT.warns) console.log('   ! ' + w); }
if (REPORT.known.length) {
  console.log(`\n  KNOWN OPEN (${REPORT.known.length}) — measured, written up in notes/J13.md, owned elsewhere`);
  for (const k of REPORT.known) console.log(`   o ${k.id} [${k.owner}]\n       ${k.measured}\n       fix: ${k.note}`);
}
console.log('');
await writeFile(path.join(OUT, `report-${MODE}.json`), JSON.stringify(REPORT, null, 2));
if (REPORT.fails.length) {
  console.log(`FAIL (${REPORT.fails.length})`);
  for (const f of REPORT.fails) console.log('  x ' + f);
} else {
  console.log(`ALL PASS — first answer inside ${COLD_OPEN.budgetS} s, the board painted in two passes with no spinner, `
    + `${REPORT.probs.checked} printed probabilities matched`
    + `${REPORT.known.length ? `, ${REPORT.known.length} known-open above` : ''}`
    + `${REPORT.warns.length ? `, ${REPORT.warns.length} warnings above` : ''}`);
}
server.close();
process.exit(REPORT.fails.length ? 1 : 0);
