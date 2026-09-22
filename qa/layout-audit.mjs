// qa/layout-audit.mjs — the app's layout safety net (ticket AUDIT-HARNESS). Dev tool; never part of site/.
//
// Why it exists: every responsive rule in the app is keyed to VIEWPORT width, but components are hosted
// at widths that have nothing to do with the viewport (a .card-screen lives inside #/card, inside a run,
// inside onboarding's .ob-run-stage, inside a boss, inside a mock). That is how the PLACEMENT question
// came to render one letter per line at 1900x1200 while #/run/page looked fine. Eyeballing one screen at
// one width cannot catch that class of bug, so this measures every state at every width, in both engines,
// in both themes, and fails the build when a blocker survives.
//
//   node qa/layout-audit.mjs                        # full matrix (self-test preamble runs first)
//   node qa/layout-audit.mjs --selftest             # detector calibration only
//   node qa/layout-audit.mjs --only onboard,card --vp desktop --engine webkit --theme light
//
// Flags: --only <state-id-prefixes,comma> --vp <all|phone|tablet|desktop|WxH,...> --engine <chromium|webkit|both>
//        --theme <light|dark|both> --max-findings N --json <path> --workers N --no-confirm --no-selftest
//        --no-extra (skip the text-zoom and reduced-motion passes) --quiet
//
// --vp ADDS to a state's pinned sizes, it does not replace them. A state may declare its own `vps`
// (the keyboard-open phone, 375x331, is why), and those rows are always measured; `--vp` unions its
// list on top. The text-zoom pass runs at the NARROWEST size in that union as well as at 1900x1200
// — before round 2 it ran only at 1900x1200, the one width where 20 px text has room to reflow.
//        --inject "<css>"  mutation-test: inject CSS into every page of the run (nothing on disk is
//                          touched) and check the net still fires. See notes/AUDIT.md "Trusting the net".
//
// Output: qa/audit/report.json, qa/audit/png/<state>-<vp>-<theme>-<engine>.png (only for states WITH
// findings), a printed summary, exit code 1 if any BLOCKER or MAJOR remains unwaived.
//
// Detectors and waivers: see notes/AUDIT.md. Waivers live in qa/audit-allow.json and every one needs a
// REASON; waived hits are still printed (as "waived") so the net never goes quietly blind.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);      // playwright is installed under qa/
const playwright = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const AUDIT_DIR = path.join(__dirname, 'audit');
const PNG_DIR = path.join(AUDIT_DIR, 'png');

/* ------------------------------------------------------------------ CLI */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const VP_ALL = [
  [320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932],
  [768, 1024], [834, 1112], [844, 390],
  [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1512, 982], [1728, 1117],
  [1900, 1200],   // the student's own Safari window — the width that produced the vertical question
  [2560, 1440],
];
const VP_GROUPS = {
  all: VP_ALL,
  phone: VP_ALL.filter(([w, h]) => w <= 430 || h <= 430),        // portrait phones + the landscape phone
  tablet: VP_ALL.filter(([w, h]) => w >= 768 && w <= 1024 && h > 430),
  desktop: VP_ALL.filter(([w]) => w >= 1024),
};

function parseVps(spec) {
  if (!spec || spec === 'all') return VP_ALL;
  if (VP_GROUPS[spec]) return VP_GROUPS[spec];
  const out = [];
  for (const tok of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)x(\d+)$/.exec(tok);
    if (!m) throw new Error(`--vp: cannot parse "${tok}" (use all|phone|tablet|desktop or WxH,WxH)`);
    out.push([+m[1], +m[2]]);
  }
  return out;
}

const CFG = {
  only: (opt('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
  vpSpec: opt('vp', 'all'),
  vps: parseVps(opt('vp', 'all')),
  engines: (() => { const e = opt('engine', 'both'); return e === 'both' ? ['chromium', 'webkit'] : [e]; })(),
  themes: (() => { const t = opt('theme', 'both'); return t === 'both' ? ['light', 'dark'] : [t]; })(),
  maxFindings: +opt('max-findings', '4000'),
  jsonPath: opt('json', path.join(AUDIT_DIR, 'report.json')),
  workers: Math.max(1, +opt('workers', '4')),
  confirm: !flag('no-confirm'),
  selftestOnly: flag('selftest'),
  selftest: !flag('no-selftest'),
  extra: !flag('no-extra'),
  quiet: flag('quiet'),
  // --inject "<css>": mutation-test the net. The CSS is injected into EVERY page the run opens (sweep,
  // clean-load confirm and screenshot alike) via addInitScript, so a deliberately broken rule behaves
  // exactly like a real regression in site/css. Nothing on disk is touched. Used by ticket TRIAGE to
  // prove the detectors catch a live defect, not just the planted ones in selftest.html.
  inject: opt('inject', ''),
};
const VP_LABEL = ([w, h]) => `${w}x${h}`;
const say = (...a) => { if (!CFG.quiet) console.log(...a); };

/* ------------------------------------------------------- static server */
// Copied from qa/shot.mjs, and like shot.mjs it serves `site/` AT THE ORIGIN ROOT — the app's own
// absolute paths (and a state catalog's `import('/data/cards.js')`) must resolve exactly as they do on
// Pages. The auditor's own dev pages ride along under the reserved `/__qa/` prefix, which the deployed
// artifact never contains.
const QA_PREFIX = '/__qa/';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
};
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const root = p.startsWith(QA_PREFIX) ? __dirname : SITE;
  const file = path.join(root, p.startsWith(QA_PREFIX) ? p.slice(QA_PREFIX.length) : p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const BASE = `${ORIGIN}/`;

/* ------------------------------------------------------------ harness */

const settle = async (page, ms = 130) => {
  try {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(ms);
  } catch { /* navigation raced us; caller re-measures */ }
};

const H = {
  base: BASE,
  async gotoRoute(page, hash) {
    const h = String(hash || '#/today');
    const target = h.startsWith('#') ? h : '#' + (h.startsWith('/') ? h : '/' + h);
    await page.goto(BASE + target, { waitUntil: 'load' });
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch { /* fine */ }
  },
  async setSave(page, json) {
    const s = typeof json === 'string' ? json : JSON.stringify(json);
    // Warm up on a non-app URL first (see qa/shot.mjs): the app must not boot and write a fresh
    // save over the fixture before the real load.
    await page.goto(BASE + 'version.js', { waitUntil: 'load' });
    await page.evaluate((j) => localStorage.setItem('u1a.save', j), s);
  },
  async waitReady(page) {
    try {
      await page.waitForFunction(() => {
        const v = document.getElementById('view');
        return !!v && v.children.length > 0;
      }, null, { timeout: 8000 });
    } catch { /* screen may legitimately render nothing; detectors still run */ }
    try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch { /* ignore */ }
    await settle(page, 260);
  },
  async readFixture(name) {
    const n = String(name);
    const tries = [
      path.join(__dirname, 'fixtures', n.endsWith('.json') ? n : n + '.json'),
      path.join(__dirname, 'screenshots', 's9', n.endsWith('.json') ? n : n + '.json'),
      path.isAbsolute(n) ? n : path.join(REPO, n),
    ];
    for (const t of tries) { if (existsSync(t)) return await readFile(t, 'utf8'); }
    throw new Error(`readFixture: no such fixture "${n}" (looked in qa/fixtures, qa/screenshots/s9)`);
  },
};

/* ================================================================== */
/* ==================== IN-PAGE DETECTORS =========================== */
/* ================================================================== */
// Runs inside the page via page.evaluate. Everything is MEASURED — no detector is allowed to
// conclude anything from a class name alone. Returns { findings: [...], stats: {...} }.
// phase 'top'   = document scrolled to 0: all detectors.
// phase 'bottom'= document scrolled to its end: only the fixed-dock overlap + vertical reach checks
//                 (a fixed bottom dock legitimately covers mid-page content at scroll 0; what it must
//                  never cover is content the reader cannot scroll any further to reveal).

function pageDetect(opts) {
  const { tags = [], allow = [], phase = 'top', maxCands = 1000 } = opts || {};
  const F = [];
  /* THE FOLD IS THE VISUAL VIEWPORT, not the layout one (round 3, layout-safari). `innerHeight` does
     not move when a soft keyboard opens — iOS Safari and Android Chrome shrink the VISUAL viewport
     only (`site/js/widgets/base.js:234`), and `site/index.html` carries no `interactive-widget`, so
     Chrome's resizes-visual default applies too. Every detector that asks "is this below the fold"
     was therefore asking about a fold 336 px below the student's on a keyboard-open state. With no
     keyboard the two are identical, so nothing else in the corpus moves. */
  const vw = innerWidth;
  const vh = window.visualViewport
    ? Math.round(window.visualViewport.offsetTop + window.visualViewport.height)
    : innerHeight;
  const de = document.documentElement;
  const VIEW = document.getElementById('view') || document.body;
  const HDR = document.querySelector('header.hdr, header[role="banner"]');
  const DOCK = document.getElementById('dock');
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  const STEMISH = '.card-stem, .stem, .q, .question, .prompt, h1, h2, h3, .card-title, .run-title, [data-stem]';

  /* ---------- primitives ---------- */
  const cvs = document.createElement('canvas'), c2d = cvs.getContext('2d');
  const chCache = new Map();
  const chOf = (st) => {
    const f = st.font || `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
    let v = chCache.get(f);
    if (v == null) {
      try { c2d.font = f; v = c2d.measureText('0').width; } catch { v = 0; }
      if (!v || !isFinite(v)) v = parseFloat(st.fontSize) * 0.5 || 8;
      chCache.set(f, v);
    }
    return v;
  };

  const selOf = (el) => {
    if (!el || el.nodeType !== 1) return '?';
    const part = (e) => {
      const tag = (e.tagName || '').toLowerCase();
      if (e.id) return tag + '#' + e.id;
      const cls = (typeof e.className === 'string' ? e.className : (e.getAttribute && e.getAttribute('class')) || '')
        .trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => '.' + c).join('');
      return tag + cls;
    };
    const chain = [];
    let e = el;
    for (let i = 0; e && e.nodeType === 1 && i < 4; i++) { chain.unshift(part(e)); if (e.id) break; e = e.parentElement; }
    return chain.join(' > ');
  };

  const hiddenUp = (el) => {
    let prev = null;
    for (let e = el; e && e.nodeType === 1; prev = e, e = e.parentElement) {
      if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true') return true;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0 || s.contentVisibility === 'hidden') return true;
      // A CLOSED <details> hides everything but its <summary>, and browsers do it on the
      // `::details-content` pseudo-element — there is no real ancestor carrying display:none or
      // content-visibility:hidden, so walking computed styles alone does not see it. Chromium still
      // reports real geometry for that content, which made the Stats screen's collapsed trophy groups
      // look like 300 overlapping blockers stacked on their own summaries.
      if (e.tagName === 'DETAILS' && !e.open && prev && prev.tagName !== 'SUMMARY') return true;
    }
    return false;
  };
  const rendered = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' || tag === 'HEAD' || tag === 'LINK' || tag === 'META') return false;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 && r.width <= 0) return false;
    return !hiddenUp(el);
  };
  const ownTextNodes = (el) => {
    const out = [];
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) out.push(n);
    return out;
  };
  const ownText = (el) => ownTextNodes(el).map((n) => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim();
  const isInteractive = (el) => { try { return el.matches(INTERACTIVE); } catch { return false; } };
  const inSvg = (el) => !!(el.closest && el.closest('svg'));
  // The screen-reader-only pattern (1px box + clip / clip-path: inset(50%)) is text that is SUPPOSED to be
  // unreadable on screen: .sr-only in base.css, .run-quit-label in polish.css. Measuring it as collapsed
  // or clipped text would be a permanent false alarm on every screen that labels an icon button.
  const srHidden = (el, st) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) {
      if (st.overflow === 'hidden' || st.overflowX === 'hidden' || st.clip !== 'auto' || st.clipPath !== 'none') return true;
    }
    if (st.clipPath && /inset\(\s*50%/.test(st.clipPath)) return true;
    if (st.clip && /rect\(0px?,? 0px?,? 0px?,? 0px?\)/.test(st.clip.replace(/\s+/g, ' '))) return true;
    try { if (el.closest('.sr-only, [class*="sr-only"], [class*="visually-hidden"]')) return true; } catch { /* ignore */ }
    return false;
  };
  /** Is anything between `el` and `stop` taken out of flow? An absolutely/fixed positioned descendant
   *  does not size its ancestor's grid track and is painted somewhere else entirely, so it must not be
   *  counted as "content this track is failing to show". That is the difference between the placement's
   *  0px stem (in flow, text really is squashed) and the mock's 0px `.rail` row, whose only child is the
   *  fixed bottom-sheet the reader is looking at. */
  const outOfFlowBetween = (el, stop) => {
    for (let e = el; e && e !== stop; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'absolute' || p === 'fixed') return true;
    }
    return false;
  };
  /** Does this subtree put any IN-FLOW text on the screen? (textContent lies: it includes `hidden`
   *  children, which is how a `.card-foot` whose every child is hidden looked like "0px tall but
   *  carries text".) */
  const hasVisibleText = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      const p = n.parentElement;
      if (p && !hiddenUp(p) && !outOfFlowBetween(p, el)) return true;
    }
    return false;
  };
  const hasVisibleInteractive = (el) => {
    if (isInteractive(el) && rendered(el)) return true;
    for (const c of el.querySelectorAll(INTERACTIVE)) if (rendered(c) && !outOfFlowBetween(c, el)) return true;
    return false;
  };
  const boxOf = (el, st) => {
    const r = el.getBoundingClientRect();
    const pad = (k) => parseFloat(st[k]) || 0;
    const cw = Math.max(0, r.width - pad('paddingLeft') - pad('paddingRight') - pad('borderLeftWidth') - pad('borderRightWidth'));
    return { r, cw };
  };
  const scrollableX = (el) => {
    for (let e = el.parentElement; e && e !== de; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };

  const waiverFor = (type, el) => {
    for (const w of allow) {
      if (w.type !== type) continue;
      try { if (el.matches(w.selector)) return w; } catch { /* bad selector in allow file */ }
    }
    return null;
  };
  const push = (type, severity, el, detail, extra) => {
    const f = { type, severity, selector: selOf(el), detail };
    if (extra) f.extra = extra;
    const w = el && el.nodeType === 1 ? waiverFor(type, el) : null;
    if (w) { f.waived = true; f.waiveReason = w.reason || '(no reason given — fix the allow file)'; }
    F.push(f);
  };

  /* ---------- collect once ---------- */
  // The whole document, not just #view: the app header and the dock carry their own tap targets,
  // contrast and overflow, and the reported symptom involved the header on top of card content.
  const nodes = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!rendered(el)) continue;
    const st = getComputedStyle(el);
    const { r, cw } = boxOf(el, st);
    nodes.push({ el, st, r, cw, t: ownText(el), inter: isInteractive(el), inView: VIEW.contains(el) });
  }

  /* ---------- 1. collapsed-text (BLOCKER) ---------- */
  if (phase === 'top') {
    for (const n of nodes) {
      const t = n.t;
      if (t.length < 8) continue;
      if (/vertical/.test(n.st.writingMode) || n.st.textOrientation === 'upright') continue;   // deliberately vertical
      if (srHidden(n.el, n.st)) continue;
      const ch = chOf(n.st);
      const floor = Math.max(60, 6 * ch);
      const width = n.st.display.includes('inline') && !n.st.display.includes('flex') && !n.st.display.includes('grid')
        ? n.r.width : n.cw;
      // rendered line count: one letter per line is len/1 lines, sane wrapping is far fewer.
      const tops = new Set();
      for (const tn of ownTextNodes(n.el)) {
        const range = document.createRange();
        range.selectNodeContents(tn);
        for (const rr of range.getClientRects()) { if (rr.width > 0 || rr.height > 0) tops.add(Math.round(rr.top)); }
        range.detach && range.detach();
      }
      const lines = tops.size;
      // +8px, not +2: a pill whose 8-char label needs 57px inside a 55px content box reads perfectly
      // well, and reporting it teaches people to ignore the detector. The real bug spills by hundreds.
      const spills = n.el.scrollWidth > n.el.clientWidth + 8;
      if (width < floor && (lines > 1 || spills)) {
        // A narrow box is only a defect if the text is actually stacking or spilling out of it: a 51px
        // chip that fits "Sheet 1a" on one line reads fine and must not drown the real findings.
        push('collapsed-text', 'BLOCKER', n.el,
          `text (${t.length} chars) in a ${Math.round(width)}px content box (floor ${Math.round(floor)}px = max(60px, 6ch)); ${lines} rendered line(s)${spills ? ', and it spills out of the box' : ''}`,
          { text: t.slice(0, 60), width: Math.round(width), floor: Math.round(floor), lines });
        continue;
      }
      if (lines > t.length / 3) {
        push('collapsed-text', 'BLOCKER', n.el,
          `${t.length} chars rendered across ${lines} lines (>${Math.ceil(t.length / 3)} = text is stacking vertically)`,
          { text: t.slice(0, 60), lines, chars: t.length, width: Math.round(width) });
      }
    }
  }

  /* ---------- 2. zero-track (BLOCKER) ---------- */
  if (phase === 'top') {
    for (const n of nodes) {
      const d = n.st.display;
      if (d !== 'grid' && d !== 'inline-grid') continue;
      const cols = n.st.gridTemplateColumns, rows = n.st.gridTemplateRows;
      const px = (s) => String(s || '').split(/\s+/).map((v) => parseFloat(v)).filter((v) => isFinite(v));
      const thinCol = px(cols).some((v) => v < 8), thinRow = px(rows).some((v) => v < 8);
      if (!thinCol && !thinRow) continue;
      for (const kid of n.el.children) {
        if (!rendered(kid)) continue;
        const kr = kid.getBoundingClientRect();
        const hasText = hasVisibleText(kid);
        const hasInter = hasVisibleInteractive(kid);
        if (!hasText && !hasInter) continue;
        if (thinCol && kr.width < 8) {
          push('zero-track', 'BLOCKER', kid,
            `grid child collapsed to ${kr.width.toFixed(1)}px wide but carries ${hasText ? 'text' : 'controls'}; parent grid-template-columns: ${cols}`,
            { parent: selOf(n.el), cols, childWidth: +kr.width.toFixed(1), text: (kid.textContent || '').trim().slice(0, 60) });
        } else if (thinRow && kr.height < 8) {
          push('zero-track', 'BLOCKER', kid,
            `grid child collapsed to ${kr.height.toFixed(1)}px tall but carries ${hasText ? 'text' : 'controls'}; parent grid-template-rows: ${rows}`,
            { parent: selOf(n.el), rows, childHeight: +kr.height.toFixed(1), text: (kid.textContent || '').trim().slice(0, 60) });
        }
      }
    }
  }

  /* ---------- 3. overlap ---------- */
  // In-flow (static/relative) text/controls must never sit on top of each other. Absolutely or fixed
  // positioned things legitimately overlay (badges, ticks, chips), so for those we demand heavy
  // coverage of a text element before we call it a defect. The app header and the fixed dock are
  // checked separately, at the scroll position where the reader can do nothing more about it.
  const isFloat = (n) => n.st.position === 'absolute' || n.st.position === 'fixed' || n.st.position === 'sticky';
  // >4px across and >6px down. The vertical bar is the taller one because a Range's client rect is the
  // LINE BOX, leading included: two texts on consecutive lines can share a few pixels of leading
  // without a single glyph touching.
  const box2 = (a, b) => {
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return ix > 4 && iy > 6 ? ix * iy : 0;
  };
  // LINE boxes, not the bounding box. An inline <span> whose text wraps over five lines has a bounding
  // box as wide as the paragraph and as tall as all five lines, which "contains" every sibling on those
  // lines — that union box is how `li > b` appeared to cover `li > span.muted` by 100%. getClientRects()
  // gives the real per-line geometry, so only genuine collisions survive.
  const rectsOf = (el) => {
    let rs = [];
    try { rs = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0); } catch { /* ignore */ }
    return rs.length ? rs.slice(0, 16) : [el.getBoundingClientRect()];
  };
  /**
   * Where the element's OWN TEXT is actually inked, line by line — a Range over its own text nodes.
   * This is the geometry the overlap detector compares, because a box is mostly empty space: a
   * full-width `.weak-name` row whose short label sits on the left "contains" the `.weak-m` badge on
   * its right, 100 % of it, while nothing visible collides. Text-vs-text is the symptom the student
   * reported; box-vs-box is a guess. Elements with no own text (icon buttons, inputs) fall back to
   * their line boxes, which for them IS the thing on screen.
   */
  const inkRectsOf = (el, hasOwnText) => {
    if (!hasOwnText) return rectsOf(el);
    const out = [];
    for (const tn of ownTextNodes(el)) {
      const range = document.createRange();
      range.selectNodeContents(tn);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
      range.detach && range.detach();
    }
    return out.length ? out.slice(0, 24) : rectsOf(el);
  };
  /**
   * INK THAT IS CLIPPED AWAY IS NOT PAINTED, AND WHAT IS NOT PAINTED CANNOT COLLIDE.
   * A `-webkit-line-clamp: 2` row still hands `Range.getClientRects()` a rect for its third,
   * invisible line, and that ghost line lands on whatever is drawn below it. That single fact
   * produced the ten Binder list "row stem covers the panel hint" blockers, the five Home rail
   * "skill name covers the next skill name" blockers and the drill "title covers the progress
   * counter" blocker in the first full run — 2 000+ measurements of text nobody can see. Clipping
   * the ink to the clip box of its clipping ancestors cannot hide a real collision: a line a
   * student can actually read is, by definition, inside its own clip.
   */
  const CLIPPY = new Set(['hidden', 'clip', 'auto', 'scroll']);
  const FAR = 1e6;
  const clipCache = new Map();
  const clipBoxOf = (el) => {
    if (clipCache.has(el)) return clipCache.get(el);
    let box = null;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      const cx = CLIPPY.has(s.overflowX), cy = CLIPPY.has(s.overflowY);
      if (!cx && !cy) continue;
      const r = e.getBoundingClientRect();
      // OVERFLOW CLIPS AT THE PADDING EDGE, NOT THE BORDER EDGE (CSS Overflow §3). getBoundingClientRect
      // is the BORDER box, so crediting it gave every clipper its border widths as extra painted area —
      // and a 1px hairline was enough to hide a real defect: `#dock .boss-miss { max-height: 44px;
      // overflow: hidden; border-block: 1px }` measured a 43.8px clip box, the link inside it scored
      // 43.8 (the detector's own floor is 43.5), and the tap target a student can really hit was 41.8.
      // Hit-tested in both engines; see notes/FIX-boss-miss-dock.md. Plant: #plant-hairline-hit.
      const bw = (k) => parseFloat(s['border' + k + 'Width']) || 0;
      const pad = { left: r.left + bw('Left'), right: r.right - bw('Right'), top: r.top + bw('Top'), bottom: r.bottom - bw('Bottom') };
      const b = { left: cx ? pad.left : -FAR, right: cx ? pad.right : FAR, top: cy ? pad.top : -FAR, bottom: cy ? pad.bottom : FAR };
      box = box ? {
        left: Math.max(box.left, b.left), right: Math.min(box.right, b.right),
        top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom),
      } : b;
    }
    clipCache.set(el, box);
    return box;
  };
  const clipInk = (el, rs) => {
    const c = clipBoxOf(el);
    if (!c) return rs;
    const out = [];
    for (const r of rs) {
      const left = Math.max(r.left, c.left), right = Math.min(r.right, c.right);
      const top = Math.max(r.top, c.top), bottom = Math.min(r.bottom, c.bottom);
      if (right - left > 0.5 && bottom - top > 0.5) out.push({ left, right, top, bottom, width: right - left, height: bottom - top });
    }
    return out;
  };
  const inter4 = (A, B) => {
    const as = Array.isArray(A) ? A : [A], bs = Array.isArray(B) ? B : [B];
    let best = 0;
    for (const a of as) for (const b of bs) { const v = box2(a, b); if (v > best) best = v; }
    return best;
  };
  const areaOf = (rs) => (Array.isArray(rs) ? rs : [rs]).reduce((s, r) => s + r.width * r.height, 0);
  /**
   * Is `el` actually the thing the reader sees somewhere inside `rect`? Hit-testing is what separates a
   * LAYOUT COLLISION from INTENTIONAL STACKING. When two in-flow texts land on each other, both are
   * topmost at some pixel. When a modal sheet (the mock's Question map, say) slides over the paper, the
   * sheet is opaque and the paper is topmost nowhere — the reader is looking at the sheet, on purpose.
   * Returns null when the region is off-screen and cannot be hit-tested; the caller then reports the
   * overlap rather than assuming it is fine.
   */
  /**
   * The opaque positioned surface `el` is painted on, if any — a modal sheet, a popover, a dropdown.
   * Two elements on DIFFERENT surfaces are stacked by design: the mock's Question map sheet is
   * `position: fixed` with an opaque background, so the exam paper "under" it is not a collision.
   *
   * This is deliberately NOT done by hit-testing. `document.elementFromPoint` returns the topmost box
   * regardless of whether its background is transparent, and in any overlap both boxes cover the shared
   * region — so "is the lower one topmost anywhere in the overlap" is false for EVERY overlap, modal or
   * not, and using it as a filter would have silenced the entire detector. (It nearly shipped: the
   * self-test only passed because the planted labels sat below the fold, where elementFromPoint returns
   * null. The plant now sits on screen so that trap cannot be re-laid.)
   *
   * Trade-off, on purpose: a positioned opaque panel that covers content BY MISTAKE is not reported
   * here. Reachability of covered content is what `offscreen`, `unreachable-answer` and the
   * header/dock checks below are for, and those never consult this.
   */
  const opaqueBg = (st) => { const m = String(st.backgroundColor || '').match(/[\d.]+/g); return !!(m && (m.length < 4 || Number(m[3]) >= 0.9)); };
  const surfaceOf = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.position !== 'fixed' && st.position !== 'absolute' && st.position !== 'sticky') continue;
      if (opaqueBg(st) || (st.backdropFilter && st.backdropFilter !== 'none')
        || e.tagName === 'DIALOG' || e.getAttribute('role') === 'dialog' || e.getAttribute('aria-modal') === 'true') return e;
    }
    return null;
  };

  const cands = [];
  for (const n of nodes) {
    if (!n.t && !n.inter) continue;
    if (n.t && n.t.replace(/[\s.,:;·—–|/]+/g, '').length < 2) continue;
    // Screen-reader-only text keeps its FULL ink geometry: the 1px box clips the paint, not the layout,
    // so a Range over `.sr-only` inside an icon button returns a full-width line that "covers" the
    // button next to it. It is invisible by design and has no business in a collision test.
    if (n.t && srHidden(n.el, n.st)) continue;
    if (inSvg(n.el)) continue;                        // hand-drawn figures overlap on purpose
    if (n.r.width <= 0 || n.r.height <= 0) continue;
    if (n.st.pointerEvents === 'none' && !n.t) continue;
    // Everything inside the app header or the fixed dock is excluded: those two chrome bars are
    // SUPPOSED to float over the page, and they get their own, scroll-aware checks below. Including
    // their buttons here would report "dock button overlaps the card" on every long phone screen.
    // Chrome-vs-CONTENT pairs are excluded — the header and the dock are SUPPOSED to float over the
    // page, and they get their own scroll-aware checks below; including them here would report "dock
    // button overlaps the card" on every long phone screen. Chrome-vs-ITS-OWN-BAR pairs are not
    // excluded, and used not to be checked at all: that hole is why the header's "set test date" chip
    // printing straight through the level ring at 320 px was only ever caught sideways, by
    // collapsed-text noticing the chip box had been squeezed. A crowded bar is exactly the defect the
    // student reported ("the run header, card chips and Scratch heading overlapping each other").
    n.chrome = (HDR && HDR.contains(n.el)) ? 'hdr' : (DOCK && DOCK.contains(n.el)) ? 'dock' : null;
    n.rects = clipInk(n.el, inkRectsOf(n.el, !!n.t));
    if (!n.rects.length) continue;                    // every line of it is clipped away: nothing is painted
    n.surface = surfaceOf(n.el);
    cands.push(n);
    if (cands.length >= maxCands) break;
  }
  // If the cap was hit, SAY SO. A pair check that silently covered only part of the page is a net with
  // a hole in it, and a hole nobody is told about is worse than a false positive.
  if (phase === 'top' && cands.length >= maxCands) {
    push('harness', 'MINOR', document.body,
      `overlap pairs were only checked for the first ${maxCands} text/interactive elements on this screen — raise maxCands in pageDetect if this screen matters`,
      { cap: maxCands });
  }
  if (phase === 'top') {
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const A = cands[i], B = cands[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        // chrome vs content is by design (and separately checked); chrome vs its own bar is not
        if (A.chrome !== B.chrome) continue;
        const area = inter4(A.rects, B.rects);
        if (!area) continue;
        const minArea = Math.max(1, Math.min(areaOf(A.rects), areaOf(B.rects)));
        const cov = area / minArea;
        const texts = (A.t ? 1 : 0) + (B.t ? 1 : 0);
        if (isFloat(A) || isFloat(B)) { if (!(texts >= 1 && cov >= 0.4)) continue; }
        // different opaque stacking surfaces → one is drawn over the other by design
        if (A.surface !== B.surface
          && ((A.surface && !A.surface.contains(B.el)) || (B.surface && !B.surface.contains(A.el)))) continue;
        // A grazing collision is real but is not "text is covered"; say which one it is.
        const hidesText = (texts === 2 && cov >= 0.15) || (texts === 1 && cov >= 0.25);
        push('overlap', hidesText ? 'BLOCKER' : 'MAJOR', A.el,
          `overlaps ${selOf(B.el)} by ${Math.round(area)}px² (${Math.round(cov * 100)}% of the smaller box)${hidesText ? ' — text is covered' : texts === 2 ? ' — the two texts graze each other' : ''}`,
          { other: selOf(B.el), coverage: +cov.toFixed(2), aText: A.t.slice(0, 40), bText: B.t.slice(0, 40) });
      }
    }
    // sticky/fixed header vs content at scrollY 0: content under it here can never be scrolled clear.
    if (HDR && rendered(HDR) && (getComputedStyle(HDR).position === 'sticky' || getComputedStyle(HDR).position === 'fixed')) {
      const hr = HDR.getBoundingClientRect();
      for (const n of cands) {
        if (HDR.contains(n.el)) continue;
        const area = inter4([hr], n.rects);
        if (!area) continue;
        push('overlap', n.t ? 'BLOCKER' : 'MAJOR', n.el,
          `sits under the app header at scrollY 0 (header bottom ${Math.round(hr.bottom)}px, element top ${Math.round(n.r.top)}px) — unreachable`,
          { other: selOf(HDR), text: n.t.slice(0, 40) });
      }
    }
  }
  if (phase === 'bottom' && DOCK && rendered(DOCK)) {
    const dpos = getComputedStyle(DOCK).position;
    if (dpos === 'fixed' || dpos === 'sticky') {
      const dr = DOCK.getBoundingClientRect();
      for (const n of cands) {
        if (DOCK.contains(n.el)) continue;
        const area = inter4([dr], n.rects);
        if (!area) continue;
        push('overlap', n.t ? 'BLOCKER' : 'MAJOR', n.el,
          `covered by the fixed dock with the page scrolled to its end (dock top ${Math.round(dr.top)}px, element ${Math.round(n.r.top)}–${Math.round(n.r.bottom)}px) — unreachable`,
          { other: selOf(DOCK), text: n.t.slice(0, 40), atScrollEnd: true });
      }
    }
  }

  /* ---------- 4. doc-overflow (BLOCKER) ---------- */
  if (phase === 'top' && de.scrollWidth > vw + 1) {
    const offenders = [];
    for (const n of nodes) {
      if (n.r.right > vw + 1 || n.r.left < -1) {
        const p = n.el.parentElement;
        const pr = p ? p.getBoundingClientRect() : null;
        const parentAlsoOver = pr ? (pr.right > vw + 1 || pr.left < -1) : false;
        offenders.push({ n, over: Math.round(Math.max(n.r.right - vw, -n.r.left)), parentAlsoOver });
      }
    }
    offenders.sort((a, b) => b.over - a.over);
    const culprit = offenders.find((o) => !o.parentAlsoOver) || offenders[0];
    push('doc-overflow', 'BLOCKER', culprit ? culprit.n.el : de,
      `document scrollWidth ${de.scrollWidth}px > viewport ${vw}px (horizontal scrollbar). Widest offender overflows by ${culprit ? culprit.over : de.scrollWidth - vw}px`,
      {
        scrollWidth: de.scrollWidth, viewport: vw,
        offenders: offenders.slice(0, 5).map((o) => ({ sel: selOf(o.n.el), overBy: o.over, width: Math.round(o.n.r.width) })),
      });
  }

  /* ---------- 5. clipped-text ---------- */
  if (phase === 'top') {
    for (const n of nodes) {
      const ox = n.st.overflowX, oy = n.st.overflowY;
      const clips = ox === 'hidden' || ox === 'clip' || oy === 'hidden' || oy === 'clip';
      // `-webkit-line-clamp: N` IS ellipsis intent: the browser paints a "…" at the end of the last
      // kept line exactly as `text-overflow: ellipsis` does. Reading only `text-overflow` called every
      // deliberate two-line clamp (Binder list rows, Home rail skill names, the card's skill meta) an
      // accidental clip. Intent is not a licence, though — a clamped QUESTION is still a blocker
      // below, and now on the vertical overflow a clamp actually causes, not only on x.
      const clamp = n.st.webkitLineClamp || n.st.lineClamp;
      const ell = n.st.textOverflow === 'ellipsis' || !!(clamp && clamp !== 'none');
      const overX = n.el.scrollWidth > n.el.clientWidth + 2;
      const overY = n.el.scrollHeight > n.el.clientHeight + 2;
      if (!(clips || ell)) continue;
      if (srHidden(n.el, n.st)) continue;            // .sr-only / .run-quit-label are clipped ON PURPOSE
      const text = (n.el.textContent || '').trim();
      if (!text) continue;
      let stemish = false;
      try { stemish = n.el.matches(STEMISH) || !!n.el.closest('.card-stem, .stem, .question, [data-stem]'); } catch { /* ignore */ }
      if (ell && (overX || (overY && n.t)) && stemish) {
        push('clipped-text', 'BLOCKER', n.el,
          `the question/title itself is truncated with an ellipsis (${overX ? `scrollWidth ${n.el.scrollWidth} > clientWidth ${n.el.clientWidth}` : `scrollHeight ${n.el.scrollHeight} > clientHeight ${n.el.clientHeight}`})`,
          { text: text.slice(0, 80) });
      } else if (clips && !ell && (overX || (overY && n.t))) {
        push('clipped-text', 'MAJOR', n.el,
          `text is clipped with no ellipsis intent (overflow ${overX ? `x: ${n.el.scrollWidth}>${n.el.clientWidth}` : `y: ${n.el.scrollHeight}>${n.el.clientHeight}`})`,
          { text: text.slice(0, 80), overflowX: ox, overflowY: oy });
      }
    }
  }

  /* ---------- 6. offscreen (BLOCKER) ---------- */
  for (const n of nodes) {
    if (!n.inter) continue;
    if (n.r.width <= 0 || n.r.height <= 0) continue;
    if (scrollableX(n.el)) continue;                     // reachable by scrolling its own carousel
    if (phase === 'top' && (n.r.left < -1 || n.r.right > vw + 1)) {
      push('offscreen', 'BLOCKER', n.el,
        `interactive control extends outside the viewport horizontally (${Math.round(n.r.left)}–${Math.round(n.r.right)}px, viewport 0–${vw}px)`,
        { rect: [Math.round(n.r.left), Math.round(n.r.top), Math.round(n.r.width), Math.round(n.r.height)] });
    }
    if (phase === 'bottom' && n.r.top > vh + 1) {
      push('offscreen', 'BLOCKER', n.el,
        `interactive control is still below the fold with the page scrolled to its end (top ${Math.round(n.r.top)}px, viewport height ${vh}px) — unreachable`,
        { rect: [Math.round(n.r.left), Math.round(n.r.top), Math.round(n.r.width), Math.round(n.r.height)] });
    }
  }

  /* ---------- 7. unreachable-answer (BLOCKER on card-bearing states) ---------- */
  // Runs in the 'bottom' phase and scrolls the control into the middle of the screen FIRST: a fixed
  // bottom dock covers whatever happens to be at the bottom of the window, which is normal and
  // scrollable-away. What is a blocker is a control that is STILL behind the dock or the header once
  // the reader has scrolled it as far into view as the page allows.
  if (phase === 'bottom' && tags.includes('card')) {
    const roots = ['.card-parts', '.card-paper', '.part', '.widget', '.mock-main', '.run-stage', '.card-screen'];
    let ctrl = null;
    for (const sel of roots) {
      const root = VIEW.querySelector(sel);
      if (!root) continue;
      ctrl = [...root.querySelectorAll(INTERACTIVE)].find((e) => {
        if (!rendered(e)) return false;
        const href = e.getAttribute && e.getAttribute('href');
        if (href && /^#\/(today|binder|onboard|settings)/.test(href)) return false;   // nav, not an answer
        return true;
      }) || null;
      if (ctrl) break;
    }
    if (ctrl) {
      try { ctrl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch { /* ignore */ }
      const cr = ctrl.getBoundingClientRect();
      if (DOCK && rendered(DOCK)) {
        const dr = DOCK.getBoundingClientRect();
        if (cr.top >= dr.top - 1 && dr.height > 0) {
          push('unreachable-answer', 'BLOCKER', ctrl,
            `the first answer control starts at y ${Math.round(cr.top)}px, at or below the dock top (${Math.round(dr.top)}px) — it is behind the dock`,
            { dock: selOf(DOCK) });
        }
      }
      if (HDR && rendered(HDR)) {
        const hr = HDR.getBoundingClientRect();
        if (cr.top < hr.bottom - 1 && cr.bottom > hr.top + 1) {
          push('unreachable-answer', 'BLOCKER', ctrl,
            `the first answer control (y ${Math.round(cr.top)}px) is under the app header (bottom ${Math.round(hr.bottom)}px)`,
            { header: selOf(HDR) });
        }
      }
      if (cr.top > de.scrollHeight + 1) {
        push('unreachable-answer', 'BLOCKER', ctrl,
          `the first answer control sits at y ${Math.round(cr.top)}px, past the end of the document (${de.scrollHeight}px)`, {});
      }
    }
  }

  /* ---------- 8. tap-target (MAJOR) ---------- */
  if (phase === 'top') {
    /**
     * A NEGATIVE-INSET PSEUDO ONLY GROWS THE HIT AREA WHERE IT IS ACTUALLY PAINTED.
     * `.chip::before { position: absolute; inset: -6px }` is how this app buys a 44 px target for a
     * 32 px pill — but base.css also says `.chip { overflow: hidden }` ("truncates before it can
     * overlap"), and an element's overflow clips its own absolutely positioned pseudo whenever the
     * element is that pseudo's containing block. The extension is then painted nowhere and hit-tested
     * nowhere: the target is still 32 px tall. The first version of this detector added the insets to
     * the measured box unconditionally, so Stats' six section chips measured a perfect 44×44 and the
     * whole matrix returned ZERO tap-target findings — the detector was reporting the CSS author's
     * intention instead of the geometry (fix:qa r2; the same trap is what fix:B1 had to undo by hand
     * on the header chip, where `overflow: visible` bought the hit box by letting the TEXT escape too).
     *
     * So the grown rect is intersected with the clip box that applies to the pseudo, reusing the
     * overlap detector's clipBoxOf(). Three rules make that intersection honest:
     *   * WHICH element's overflow counts. An absolutely positioned box is only clipped by ancestors
     *     its containing-block chain passes through, so the walk starts at the pseudo's containing
     *     block — the nearest ancestor (the originating element included) that is positioned, or
     *     transformed/filtered/contained/a query container. An `overflow: hidden` wrapper between the
     *     control and that containing block clips nothing, and claiming otherwise would invent defects.
     *   * `inset: -6px` only means "6 px around this control" when the control IS its pseudo's
     *     containing block. When it is not, the pseudo is laid out against some ancestor's padding box
     *     and its rect cannot be derived from the control's box at all, so the extension is not
     *     credited (and the finding says so) rather than guessed at. All three of this app's hatches
     *     set `position: relative` on the control, which is the case that means what it looks like.
     *   * The element's own border box is never clipped by its OWN overflow, so the hit area is the
     *     union of that box and whatever survives of the extension — never smaller than the box.
     */
    const ABS_CB = (s) => s.position !== 'static'
      || (s.transform && s.transform !== 'none') || (s.filter && s.filter !== 'none')
      || (s.backdropFilter && s.backdropFilter !== 'none') || (s.perspective && s.perspective !== 'none')
      || /\b(layout|paint|strict|content)\b/.test(s.contain || '')
      || (s.containerType && s.containerType !== 'normal')
      || /\b(transform|filter|perspective)\b/.test(s.willChange || '');
    /**
     * The pseudo's containing block, the clip box that applies to it (null = nothing clips it), and the
     * nearest element imposing that clip (for the finding's detail).
     */
    const pseudoClip = (el) => {
      let cb = null;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        let s; try { s = getComputedStyle(e); } catch { break; }
        if (ABS_CB(s)) { cb = e; break; }
      }
      if (!cb) return { cb: null, box: null, by: null };   // laid out against the initial containing block
      const box = clipBoxOf(cb);
      let by = null;
      if (box) {
        for (let e = cb; e && e.nodeType === 1; e = e.parentElement) {
          let s; try { s = getComputedStyle(e); } catch { break; }
          if (CLIPPY.has(s.overflowX) || CLIPPY.has(s.overflowY)) { by = e; break; }
        }
      }
      return { cb, box, by };
    };
    /** Per-side extension of the painted pseudos, MAXed (two pseudos on the same side do not stack). */
    const pseudoGrow = (el) => {
      const ext = { top: 0, right: 0, bottom: 0, left: 0 };
      let any = false;
      for (const which of ['::before', '::after']) {
        let ps; try { ps = getComputedStyle(el, which); } catch { continue; }
        if (!ps || ps.content === 'none' || ps.position !== 'absolute') continue;
        if (ps.display === 'none' || ps.visibility === 'hidden') continue;   // not painted, not hit-tested
        for (const k of ['top', 'right', 'bottom', 'left']) {
          const v = parseFloat(ps[k]);
          if (isFinite(v) && v < 0) { ext[k] = Math.max(ext[k], -v); any = true; }
        }
      }
      return any ? ext : null;
    };
    /** The real hit box: the border box grown by the pseudos, clipped to where they are painted. */
    const hitBoxOf = (el, r) => {
      const own = { w: r.width, h: r.height, rawW: r.width, rawH: r.height, clip: null, offCb: false };
      const ext = pseudoGrow(el);
      if (!ext) return own;
      const g = { left: r.left - ext.left, right: r.right + ext.right, top: r.top - ext.top, bottom: r.bottom + ext.bottom };
      const raw = { w: g.right - g.left, h: g.bottom - g.top };
      const ci = pseudoClip(el);
      // The insets are measured from someone else's padding box: the extension is unknowable from here.
      if (ci.cb !== el) return { ...own, rawW: raw.w, rawH: raw.h, offCb: true };
      if (!ci.box) return { w: raw.w, h: raw.h, rawW: raw.w, rawH: raw.h, clip: null, offCb: false };
      const c = ci.box;
      const v = {
        left: Math.max(g.left, c.left), right: Math.min(g.right, c.right),
        top: Math.max(g.top, c.top), bottom: Math.min(g.bottom, c.bottom),
      };
      const painted = (v.right - v.left > 0.5 && v.bottom - v.top > 0.5);
      const box = painted ? {
        left: Math.min(r.left, v.left), right: Math.max(r.right, v.right),
        top: Math.min(r.top, v.top), bottom: Math.max(r.bottom, v.bottom),
      } : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      return {
        w: box.right - box.left, h: box.bottom - box.top, rawW: raw.w, rawH: raw.h, offCb: false,
        clip: (box.right - box.left < raw.w - 0.5 || box.bottom - box.top < raw.h - 0.5) ? (ci.by || el) : null,
      };
    };
    for (const n of nodes) {
      if (!n.inter) continue;
      if (n.r.width <= 0 || n.r.height <= 0) continue;
      if (n.r.bottom < -vh || n.r.top > de.scrollHeight) continue;
      if (n.st.display === 'contents') continue;
      // a control wrapped by a bigger control/label is tapped through its wrapper
      const wrapper = n.el.parentElement && n.el.parentElement.closest('label, a[href], button, [role="button"]');
      if (wrapper && wrapper !== n.el) {
        const wr = wrapper.getBoundingClientRect();
        if (wr.width >= 44 && wr.height >= 44) continue;
      }
      // …and so is a control driven by a big enough `label[for]` elsewhere in the DOM, which is how a
      // styled file input works: <input id=set-file> hidden, <label for=set-file class=btn> visible.
      if (n.el.id) {
        let big = false;
        for (const lab of document.querySelectorAll(`label[for="${CSS.escape(n.el.id)}"]`)) {
          if (!rendered(lab)) continue;
          const lr = lab.getBoundingClientRect();
          if (lr.width >= 44 && lr.height >= 44) { big = true; break; }
        }
        if (big) continue;
      }
      const hb = hitBoxOf(n.el, n.r);
      const w = hb.w, h = hb.h;
      const dx = w - n.r.width, dy = h - n.r.height;
      // 0.5px tolerance: a 44px target measures 43.99 often enough, and differently in webkit than in
      // chromium. Reporting "hit box 44x44 (< 44x44)" teaches people to ignore the detector.
      if (w < 43.5 || h < 43.5) {
        const fmt = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
        const grew = dx > 0.5 || dy > 0.5 ? ` including a painted pseudo-element extension of ${fmt(dx)}x${fmt(dy)}` : '';
        // "But it is 44x44 in the CSS" is the first thing the reader will think, so the finding says why
        // the browser disagrees: the negative-inset pseudo that was supposed to buy the pixels is either
        // clipped away (named clipper) or positioned against something other than this control.
        const cut = hb.clip
          ? ` — its negative-inset pseudo-element would grow the box to ${fmt(hb.rawW)}x${fmt(hb.rawH)}, but ${hb.clip === n.el ? "the element's own overflow" : selOf(hb.clip) + "'s overflow"} clips it away, so nothing out there is painted or tappable`
          : hb.offCb
            ? ` — it has a negative-inset pseudo-element (a ${fmt(hb.rawW)}x${fmt(hb.rawH)} hatch on paper), but the element is not that pseudo's containing block, so the insets are measured from an ancestor's padding box and buy this control nothing predictable`
            : '';
        push('tap-target', 'MAJOR', n.el,
          `hit box ${fmt(w)}x${fmt(h)} (< 44x44)${grew}${cut}`,
          { w: +w.toFixed(1), h: +h.toFixed(1), rawW: +hb.rawW.toFixed(1), rawH: +hb.rawH.toFixed(1),
            clippedBy: hb.clip ? selOf(hb.clip) : undefined, pseudoOffContainingBlock: hb.offCb || undefined,
            label: (n.el.getAttribute('aria-label') || n.t || n.el.textContent || '').trim().slice(0, 40) });
      }
    }
  }

  /* ---------- 9. contrast (MAJOR) ---------- */
  if (phase === 'top') {
    const lum = (c) => {
      const m = String(c || '').match(/[\d.]+/g);
      if (!m) return null;
      let [r, g, b, a = 1] = m.map(Number);
      if (/^color\(srgb/.test(String(c))) { r *= 255; g *= 255; b *= 255; }
      if (a === 0) return null;
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const opaque = (c) => { const m = String(c || '').match(/[\d.]+/g); return m && (m.length < 4 || Number(m[3]) >= 0.95); };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor;
        if (lum(bg) !== null && opaque(bg)) return bg;
      }
      return getComputedStyle(de).backgroundColor || 'rgb(255,255,255)';
    };
    for (const n of nodes) {
      if (!n.t || n.t.length < 2) continue;
      if (n.r.bottom < 0 || n.r.top > vh) continue;                 // only what is on screen now
      if (srHidden(n.el, n.st)) continue;                           // never rendered for sighted readers
      if (n.st.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || n.st.color === 'rgba(0, 0, 0, 0)') continue;  // gradient text
      const lf = lum(n.st.color), lb = lum(bgOf(n.el));
      if (lf === null || lb === null) continue;
      const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
      const fs = parseFloat(n.st.fontSize);
      const big = fs >= 24 || (fs >= 18.66 && +n.st.fontWeight >= 700);
      const need = big ? 3 : 4.5;
      if (ratio < need) {
        push('contrast', big && ratio >= 3 ? 'MINOR' : 'MAJOR', n.el,
          `contrast ${ratio.toFixed(2)}:1 (needs ${need}:1 for ${Math.round(fs)}px${big ? ' large' : ''} text) — ${n.st.color} on ${bgOf(n.el)}`,
          { ratio: +ratio.toFixed(2), need, text: n.t.slice(0, 40) });
      }
    }
  }

  /* ---------- 11. squeeze (MAJOR) ---------- */
  if (phase === 'top') {
    for (const n of nodes) {
      if (n.t.length < 20) continue;
      const ch = chOf(n.st);
      if (!ch) continue;
      const mine = n.cw / ch;
      if (mine >= 18) continue;
      const d = n.st.display;
      if (!(d.startsWith('block') || d === 'flow-root' || d === 'list-item' || d.includes('flex') || d.includes('grid'))) continue;
      const p = n.el.parentElement;
      if (!p) continue;
      const ps = getComputedStyle(p);
      // A multi-track row is not "available width": a 2-column grid's cell is as wide as its track,
      // and flagging that would fire on every legitimate two-column layout and drown the real bugs.
      const tracks = String(ps.gridTemplateColumns || '').split(/\s+/).filter((v) => parseFloat(v) > 0).length;
      const multiTrack = (ps.display.includes('grid') && tracks > 1)
        || (ps.display.includes('flex') && String(ps.flexDirection).startsWith('row') && p.children.length > 1);
      if (multiTrack) continue;
      const avail = boxOf(p, ps).cw / ch;
      if (avail < 24) continue;
      push('squeeze', 'MAJOR', n.el,
        `text block is only ${mine.toFixed(1)}ch wide while its container offers ${avail.toFixed(1)}ch — reads as a column of fragments`,
        { ch: +mine.toFixed(1), containerCh: +avail.toFixed(1), text: n.t.slice(0, 60) });
    }
  }

  return {
    findings: F,
    stats: {
      vw, vh, phase,
      nodes: nodes.length, cands: cands.length,
      scrollWidth: de.scrollWidth, scrollHeight: de.scrollHeight,
      truncatedCandidates: cands.length >= maxCands,
    },
  };
}

/* ================================================================== */
/* ========================== runner ================================ */
/* ================================================================== */

const IGNORE_CONSOLE = [
  /service worker/i, /serviceworker/i, /sw\.js/i,
  /Failed to load resource.*favicon/i,
  /\[Report Only\]/i,
];

async function newPage(browser, { theme, motion, vp }) {
  const ctx = await browser.newContext({
    viewport: { width: vp[0], height: vp[1] },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: motion ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  if (CFG.inject) {
    // Applied on every document this context loads, at the very end of the cascade, so it overrides
    // site CSS the way a bad rule shipped in polish.css would.
    await ctx.addInitScript((css) => {
      const put = () => {
        if (!document.head) return false;
        const s = document.createElement('style');
        s.id = '__qa-inject';
        s.textContent = css;
        document.head.appendChild(s);
        return true;
      };
      if (!put()) document.addEventListener('DOMContentLoaded', put, { once: true });
    }, CFG.inject);
  }
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push({ kind: 'console', text: m.text() }); });
  page.on('pageerror', (e) => logs.push({ kind: 'pageerror', text: String(e && e.message || e) }));
  page.on('requestfailed', (r) => logs.push({ kind: 'requestfailed', text: `${r.url()} — ${(r.failure() && r.failure().errorText) || '?'}` }));
  return { ctx, page, logs };
}

async function measure(page, { tags, allow }) {
  const out = [];
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 60);
  const top = await page.evaluate(pageDetect, { tags, allow, phase: 'top' });
  out.push(...top.findings);
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle(page, 80);
  const bot = await page.evaluate(pageDetect, { tags, allow, phase: 'bottom' });
  out.push(...bot.findings);
  await page.evaluate(() => window.scrollTo(0, 0));
  return { findings: out, stats: { ...top.stats, scrollable } };
}

// Identity of a finding for the resize-pass / clean-load comparison. Deliberately does NOT include the
// rendered text: a generated card draws a different question on every fresh save, so keying on text
// would make every stable defect look like a resize artefact.
const keyOf = (f) => `${f.type}|${f.selector}|${(f.extra && f.extra.other) || ''}`;

/** One (engine, theme, state) task: prepare once, then sweep the viewport list by resizing.
 *  Any viewport that produces findings is RE-NAVIGATED at that exact size and re-measured, so a
 *  finding only lands in the report if it survives a clean load (resize-only layout artefacts are
 *  kept separately as `unconfirmed` — never silently dropped). */
async function runState({ browser, engine, theme, state, allow: allEntries, vps, extraPasses, out, motion = true, vpSuffix = '' }) {
  const { ctx, page, logs } = await newPage(browser, { theme, motion, vp: [1280, 800] });
  const tags = state.tags || [];
  const allow = allEntries.filter((e) => !e.states || e.states.includes('*') || e.states.some((p) => state.id.startsWith(p)));
  const add = (vpLabel, findings, note) => {
    for (const f of findings) out.push({ ...f, state: state.id, describe: state.describe, viewport: vpLabel, theme, engine, ...(note ? { note } : {}) });
  };
  try {
    await state.prepare(page);
    // THE STATE HAS TO HAVE ARRIVED (ticket fix:tests r1, layout-safari finding 2).
    // `state.root` is the catalog's own proof that it did — audit-states.mjs:15 "the CSS selector that
    // proves the state actually happened (prepare waits for it)". That wait swallows its timeout
    // (`.catch(() => {})`), and `prepare` does not throw on a state that never arrived, so without this
    // check an unreachable state silently measures whatever screen happened to be up and contributes
    // ZERO findings — a PASS that means nothing. That is exactly how `job-payout` reported clean for
    // three rounds while sitting on the answer screen. Fail loudly and skip the sweep: measuring the
    // wrong screen is worse than not measuring at all.
    if (state.root && !(await page.$(state.root))) {
      out.push({
        type: 'unreached', severity: 'BLOCKER', state: state.id, describe: state.describe,
        viewport: 'n/a', theme, engine, selector: state.root,
        detail: 'the state never arrived: prepare() finished but its declared root is not in the DOM, '
          + 'so nothing below was measured on the screen this state names',
      });
      return;
    }
    const suspects = [];
    for (const vp of vps) {
      await page.setViewportSize({ width: vp[0], height: vp[1] });
      await settle(page, 150);
      const { findings } = await measure(page, { tags, allow });
      if (findings.length) suspects.push({ vp, findings });
    }
    /* TEXT ZOOM (`html{font-size:20px}`) — at the student's own window size AND at the narrowest
       viewport this state is measured at.
       ROUND 2 (layout-safari). This pass used to run at 1900x1200 and nowhere else, which is the one
       width where text zoom cannot bite: a desktop has horizontal room to spare, so 20 px text
       reflows into it. The same net, the same CSS, at 320–390 px:

         node qa/layout-audit.mjs --only job --vp all --engine both --theme both
           → 0 findings, PASS
         node qa/layout-audit.mjs --only job --vp 375x667,320x568,390x844 --engine both --theme light \
              --no-extra --inject "html{font-size:20px !important}"
           → 8 findings, all BLOCKER, FAIL

       States with their OWN `vps` were skipped entirely, on the grounds that resizing to 1900x1200
       un-pins the configuration they exist to measure. True — and the fix is to zoom at their own
       size rather than to skip them: a pinned keyboard and a text-zoom setting are independent
       things a student can have at once. */
    if (extraPasses) {
      const narrowest = vps.slice().sort((a, b) => a[0] - b[0])[0];
      const zoomVps = [narrowest, [1900, 1200]]
        .filter(Boolean)
        .filter((vp, i, xs) => xs.findIndex((o) => o[0] === vp[0] && o[1] === vp[1]) === i);
      for (const vp of zoomVps) {
        await page.setViewportSize({ width: vp[0], height: vp[1] });
        const handle = await page.addStyleTag({ content: 'html{font-size:20px !important}' });
        await settle(page, 200);
        const z = await measure(page, { tags, allow });
        if (z.findings.length) suspects.push({ vp, findings: z.findings, pass: 'zoom20' });
        await handle.evaluate((el) => el.remove()).catch(() => {});
        await settle(page, 120);
      }
    }

    // Confirm by re-navigating at the offending size. Viewports that produced the SAME set of findings
    // are one group confirmed once: the placement bug fires identically at 1024/1180/1280/1440/1512/
    // 1728/1900/2560, and re-preparing a card eight times to learn the same thing is how an audit
    // becomes too slow to run. Per-viewport measurements are still reported individually — only the
    // is-this-a-resize-artefact question is answered per group, on the group's widest viewport.
    const groups = new Map();
    for (const s of suspects) {
      const sig = (s.pass || '') + ' ' + [...new Set(s.findings.map(keyOf))].sort().join('\n');
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(s);
    }
    for (const group of groups.values()) {
      const rep = group[group.length - 1];                          // the widest viewport in the group
      const repLabel = VP_LABEL(rep.vp) + (rep.pass ? '@' + rep.pass : vpSuffix);
      let confirmed = [], ok = false, shotTaken = false;
      if (!CFG.confirm) {
        ok = false;                                                 // nothing was re-checked
        shotTaken = await shoot(browser, { engine, theme, state, vp: rep.vp, label: repLabel, motion });
      } else {
        const fresh = await newPage(browser, { theme, motion, vp: rep.vp });
        try {
          await state.prepare(fresh.page);
          if (rep.pass === 'zoom20') { await fresh.page.addStyleTag({ content: 'html{font-size:20px !important}' }); await settle(fresh.page, 200); }
          const r = await measure(fresh.page, { tags, allow });
          confirmed = r.findings;
          for (const l of fresh.logs) logs.push(l);
          ok = true;
          // shoot from the page that is already prepared, rather than preparing the state a third time
          if (confirmed.length) shotTaken = await shootHere(fresh.page, { engine, theme, state, label: repLabel });
        } catch { /* the clean load failed; fall back to trusting the resize sweep */ } finally {
          await fresh.ctx.close().catch(() => {});
        }
        if (!ok && !shotTaken) shotTaken = await shoot(browser, { engine, theme, state, vp: rep.vp, label: repLabel, motion });
      }
      const seen = new Set(confirmed.map(keyOf));
      const png = shotTaken ? path.relative(REPO, pngPath(state, repLabel, theme, engine)) : undefined;
      for (const s of group) {
        const label = VP_LABEL(s.vp) + (s.pass ? '@' + s.pass : vpSuffix);
        for (const f of s.findings) {
          if (!ok || seen.has(keyOf(f))) {
            out.push({ ...f, state: state.id, describe: state.describe, viewport: label, theme, engine, png, confirmedAt: repLabel });
          } else {
            out.push({ ...f, state: state.id, describe: state.describe, viewport: label, theme, engine, unconfirmed: true, severity: 'MINOR', note: `seen on the resize sweep only; a clean load at ${repLabel} did not reproduce it` });
          }
        }
      }
      // findings that only the clean load saw are real too — that is the load the student gets
      const swept = new Set(rep.findings.map(keyOf));
      for (const f of confirmed) {
        if (swept.has(keyOf(f))) continue;
        out.push({ ...f, state: state.id, describe: state.describe, viewport: repLabel, theme, engine, png, note: 'seen on a clean load at this size (the resize sweep missed it)' });
      }
    }

    // console findings (per state/theme/engine)
    for (const l of logs) {
      if (IGNORE_CONSOLE.some((re) => re.test(l.text))) continue;
      out.push({
        type: 'console', severity: 'MAJOR', state: state.id, describe: state.describe,
        viewport: 'any', theme, engine, selector: l.kind, detail: l.text.slice(0, 400),
      });
    }
  } catch (e) {
    out.push({
      type: 'harness', severity: 'BLOCKER', state: state.id, describe: state.describe,
      viewport: 'n/a', theme, engine, selector: '(state.prepare)',
      detail: `could not reach this state: ${String(e && e.message || e).slice(0, 300)}`,
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** Where a state's PNG lives. Only states WITH findings ever get one. */
const pngPath = (state, label, theme, engine) =>
  path.join(PNG_DIR, `${state.id}-${label.replace(/[^\w@.-]/g, '')}-${theme}-${engine}.png`);

/** Shoot from a page that is ALREADY sitting at the state (no third prepare). */
async function shootHere(page, { engine, theme, state, label }) {
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 150);
    await page.screenshot({ path: pngPath(state, label, theme, engine), fullPage: false });
    return true;
  } catch { return false; /* a screenshot failure must never mask a finding */ }
}

/** Shoot when there is no prepared page to reuse (--no-confirm). */
async function shoot(browser, { engine, theme, state, vp, label, motion = true }) {
  const { ctx, page } = await newPage(browser, { theme, motion, vp });
  try {
    await state.prepare(page);
    if (/@zoom20$/.test(label)) { await page.addStyleTag({ content: 'html{font-size:20px !important}' }); await settle(page, 200); }
    return await shootHere(page, { engine, theme, state, label });
  } catch { return false; /* ditto */ } finally { await ctx.close().catch(() => {}); }
}

/* --------------------------------------------------------- self-test */

const PLANTED = [
  { needle: 'plant-collapsed', type: 'collapsed-text', what: 'a 12px-wide div holding a paragraph' },
  { needle: 'plant-track', type: 'zero-track', what: 'a 0px grid track holding the stem text' },
  { needle: 'plant-overlap', type: 'overlap', what: 'two in-flow labels on top of each other' },
  { needle: 'plant-wide', type: 'doc-overflow', what: 'a 1200px table inside a 320px body' },
  { needle: 'plant-tiny', type: 'tap-target', what: 'a 30x20 button' },
  // The 44px hit box that only exists in the CSS: a 30x20 control with `inset: -12px` on its ::before
  // and `overflow: hidden` on itself, i.e. the app's Stats chips. Before fix:qa r2 the detector added
  // the insets to the box with no check that the pseudo was painted, computed 44x44, and the entire
  // matrix reported zero tap-target findings. Its un-clipped twin (#ctl-pill) is on the CLEAN page, so
  // "ignore pseudo-elements" fails there instead of passing here.
  { needle: 'plant-clipped-hit', type: 'tap-target', what: 'a 30x20 control whose 44px ::before hit area is clipped away' },
  // The same defect one hairline deep: a 19px link inside an `overflow: hidden` strip whose BORDER box
  // is exactly 44px. Crediting the border box scored it 44 (above the 43.5 floor) and said nothing,
  // which is how the Boss's dock miss strip stayed a 41.8px tap target through two audit rounds. The
  // detector now clips at the padding edge, where the browser actually clips (ticket fix:boss-miss-dock).
  { needle: 'plant-hairline-hit', type: 'tap-target', what: 'a 19px link whose hit area is clipped by a 44px strip\'s PADDING edge (a 1px border of slack)' },
  { needle: 'plant-clip', type: 'clipped-text', what: 'a box that hides the end of its line with no ellipsis' },
  { needle: 'plant-clamp-stem', type: 'clipped-text', what: 'a line-clamped QUESTION stem (ellipsis is not a licence on a stem)', severity: 'BLOCKER' },
];

async function selftest(engineName) {
  const browser = await playwright[engineName].launch();
  const allow = [];      // the self-test must NOT be waivable
  const result = { engine: engineName, caught: [], missed: [], controlFindings: [], ok: false };
  try {
    // planted page at 320x568 (so the 1200px table really does overflow the document)
    {
      const { ctx, page } = await newPage(browser, { theme: 'light', motion: true, vp: [320, 568] });
      await page.goto(`${ORIGIN}${QA_PREFIX}audit/selftest.html`, { waitUntil: 'load' });
      await settle(page, 200);
      // The overlap and tap-target plants must be ON SCREEN, or they test nothing: geometry APIs
      // behave differently below the fold (elementFromPoint returns null there), and a rule that only
      // passes off-screen looks calibrated while being blind. Guard it here, not in a comment.
      result.offScreenPlants = await page.evaluate(() => ['plant-overlap-a', 'plant-overlap-b', 'plant-tiny', 'plant-clipped-hit', 'plant-hairline-hit']
        .filter((id) => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return !r || r.bottom > innerHeight || r.top < 0; }));
      const { findings } = await measure(page, { tags: [], allow });
      for (const p of PLANTED) {
        const hit = findings.some((f) => f.type === p.type && JSON.stringify(f).includes(p.needle)
          && (!p.severity || f.severity === p.severity));
        (hit ? result.caught : result.missed).push(p);
      }
      result.plantedFindings = findings.map((f) => `${f.severity} ${f.type} ${f.selector}`);
      await ctx.close();
    }
    // clean control page at 320x568 — must be silent
    {
      const { ctx, page, logs } = await newPage(browser, { theme: 'light', motion: true, vp: [320, 568] });
      await page.goto(`${ORIGIN}${QA_PREFIX}audit/selftest-clean.html`, { waitUntil: 'load' });
      await settle(page, 200);
      // A negative control that has drifted off screen proves nothing either (fix:qa r2): #ctl-pill is
      // the 32px pill whose 44px ::before hit area really IS painted, and the tap-target detector has to
      // stay silent on it while it is on screen and fully measurable.
      result.offScreenControls = await page.evaluate(() => ['ctl-pill', 'ctl-hairline']
        .filter((id) => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return !r || r.bottom + 8 > innerHeight || r.top < 8; }));
      const { findings } = await measure(page, { tags: [], allow });
      result.controlFindings = findings.map((f) => `${f.severity} ${f.type} ${f.selector} — ${f.detail}`);
      result.controlConsole = logs.filter((l) => !IGNORE_CONSOLE.some((re) => re.test(l.text))).map((l) => l.text);
      await ctx.close();
    }
    result.ok = result.missed.length === 0 && result.controlFindings.length === 0
      && (result.controlConsole || []).length === 0 && (result.offScreenPlants || []).length === 0
      && (result.offScreenControls || []).length === 0;
  } finally { await browser.close(); }
  return result;
}

/* ------------------------------------------------------------- main */

await mkdir(PNG_DIR, { recursive: true });

let allowEntries = [];
try {
  const raw = JSON.parse(await readFile(path.join(__dirname, 'audit-allow.json'), 'utf8'));
  allowEntries = (raw.entries || []).filter((e) => {
    if (!e || !e.type || !e.selector) return false;
    if (!e.reason) { console.error(`allow-list entry for ${e.type} ${e.selector} has NO reason — ignored (a waiver without a reason is a blindfold)`); return false; }
    return true;
  });
} catch (e) { say('(no qa/audit-allow.json — nothing waived)'); }

const t0 = Date.now();
const selftests = [];
if (CFG.selftest || CFG.selftestOnly) {
  for (const eng of CFG.engines) {
    say(`self-test (${eng}) …`);
    let r;
    try { r = await selftest(eng); } catch (e) { r = { engine: eng, ok: false, error: String(e && e.message || e) }; }
    selftests.push(r);
    if (r.error) { console.error(`  self-test could not run: ${r.error}`); continue; }
    for (const c of r.caught) say(`  ok    caught ${c.type} (${c.what})`);
    for (const m of r.missed) console.error(`  FAIL  MISSED ${m.type} (${m.what}) — this detector is worthless until it catches its plant`);
    for (const c of r.controlFindings) console.error(`  FAIL  false positive on the clean control: ${c}`);
    for (const c of (r.controlConsole || [])) console.error(`  FAIL  console noise on the clean control: ${c}`);
    for (const id of (r.offScreenPlants || [])) console.error(`  FAIL  planted #${id} is off screen at 320x568 — move it above the fold in qa/audit/selftest.html, it is not testing the detector where it matters`);
    for (const id of (r.offScreenControls || [])) console.error(`  FAIL  negative control #${id} is off screen (or within 8px of an edge) at 320x568 — move it inside the fold in qa/audit/selftest-clean.html, a control nobody measures proves nothing`);
    say(`  self-test ${r.ok ? 'PASS' : 'FAIL'} (${eng})`);
  }
}
const selftestOk = selftests.length > 0 && selftests.every((r) => r.ok);

if (CFG.selftestOnly) {
  await writeFile(path.join(AUDIT_DIR, 'selftest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), selftests }, null, 1));
  server.close();
  console.log(`\nself-test: ${selftestOk ? 'PASS' : 'FAIL'}  (qa/audit/selftest.json)`);
  process.exit(selftestOk ? 0 : 1);
}
if (CFG.selftest && !selftestOk) {
  server.close();
  console.error('\nRefusing to run the matrix on broken detectors. Fix the self-test first (qa/audit/selftest.html).');
  process.exit(1);
}

// state catalog
const statesMod = await import('./audit-states.mjs');
const statesFn = statesMod.states || statesMod.default;
if (typeof statesFn !== 'function') throw new Error('qa/audit-states.mjs must export `states(h)`');
const ALL_STATES = statesFn(H);
let STATES = ALL_STATES;
if (CFG.only.length) STATES = STATES.filter((s) => CFG.only.some((p) => s.id.startsWith(p)));
if (!STATES.length) { server.close(); console.error('no states matched --only ' + CFG.only.join(',')); process.exit(1); }

/* Clear stale PNGs, so the folder never claims a defect that has since been fixed.
 *
 * TWO SWEEPS, and the second one is round 3's fix (layout-safari, MINOR). A PNG is named
 * `${state.id}-${label}-${theme}-${engine}.png` (see `pngPath`), and the old code cleared a file
 * only when some id in THIS RUN was a prefix of it. That can never remove a file whose id has been
 * RENAMED: `'run-page-1900x1200-light-chromium.png'.startsWith('run-page-item-1-')` is false, so
 * four PNGs from `onboard-3-placement` and `run-page` — ids that stopped existing when the catalog
 * was rewritten — survived every run, for ever. They were the ONLY pictures in the folder, because
 * a clean state writes none, so a reader told to "look at the PNGs" found four pictures of screens
 * that no longer exist and nothing else.
 *
 *   1. the states in THIS run are cleared by prefix, exactly as before (a filtered run must not
 *      delete the evidence of states it is not re-auditing);
 *   2. and on a FULL, unfiltered run, any file that NO id in the whole catalog can own is an
 *      orphan and goes too. That is the only run that can tell an orphan from a state it simply
 *      did not visit.
 */
try {
  const { readdir } = await import('node:fs/promises');
  const ids = new Set(STATES.map((s) => s.id));
  const owners = ALL_STATES.map((s) => s.id + '-');
  const orphans = [];
  for (const f of await readdir(PNG_DIR)) {
    if (!f.endsWith('.png')) continue;
    if ([...ids].some((i) => f.startsWith(i + '-'))) { await rm(path.join(PNG_DIR, f), { force: true }); continue; }
    if (!CFG.only.length && !owners.some((o) => f.startsWith(o))) {
      await rm(path.join(PNG_DIR, f), { force: true });
      orphans.push(f);
    }
  }
  if (orphans.length) say(`cleared ${orphans.length} orphaned PNG(s) — no state id owns them: ${orphans.join(', ')}`);
  /* and the folder says why it is usually empty, so "no pictures" stops reading as "not audited" */
  await writeFile(path.join(PNG_DIR, 'README.md'), [
    '# qa/audit/png',
    '',
    'A screenshot lands here only for a state/viewport/theme that produced a FINDING.',
    'A clean run writes no PNG, so an EMPTY folder means "audited, nothing found" — not "not audited".',
    '',
    'Filenames are `<state id>-<viewport>[@zoom20]-<theme>-<engine>.png`. A full, unfiltered run',
    'deletes any file no current state id owns (see the two sweeps in qa/layout-audit.mjs).',
  ].join('\n') + '\n');
} catch { /* first run: nothing to clear */ }

say(`\nmatrix: ${STATES.length} states x ${CFG.vps.length} viewports x ${CFG.themes.length} themes x ${CFG.engines.length} engines`
  + `${CFG.extra ? ' (+ text-zoom and reduced-motion passes)' : ''} — ${CFG.workers} workers`);

const findings = [];
for (const engine of CFG.engines) {
  let browser;
  try { browser = await playwright[engine].launch(); }
  catch (e) { console.error(`cannot launch ${engine}: ${String(e && e.message || e).slice(0, 200)} — skipping engine`); continue; }
  const tasks = [];
  for (const theme of CFG.themes) for (const state of STATES) {
    // A state may declare its OWN viewport list (`vps`). The keyboard-open phone is the case that
    // forced it: J6's acceptance is "375×667 with the keyboard open", and an open keyboard leaves
    // ~331 px of height — a size no row of VP_ALL carries, and one that would invent a configuration
    // no student can reach if it were swept across every state (a 2560 px desktop with a soft
    // keyboard). An explicit `--vp` on the command line still wins, so `--vp 375x667` means what it
    // says. (ticket fix:tests r1, layout-safari finding 4.)
    /* ROUND 2 (layout-safari, second half of finding 9): a state's own `vps` used to be dropped
       ENTIRELY whenever `--vp` was given (`CFG.vpSpec === 'all'`), silently. So `--vp phone`
       measured `job-answer-kb` / `job-payout-kb` at seven phone widths and NOT at 375x331 — the
       keyboard height those two states exist to measure — and the flag help said nothing about it.
       The pinned rows are now UNIONED with whatever `--vp` asks for, so an explicit `--vp` adds
       sizes instead of removing the one that matters. */
    const own = (Array.isArray(state.vps) && state.vps.length) ? state.vps : null;
    const vps = own
      ? [...own, ...(CFG.vpSpec === 'all' ? [] : CFG.vps)]
        .filter((vp, i, xs) => xs.findIndex((o) => o[0] === vp[0] && o[1] === vp[1]) === i)
      : CFG.vps;
    /* main sweep: the whole viewport list, reduced motion (stable geometry), + the text-zoom pass.
       A state with its own sizes gets the zoom pass too, at its own narrowest size — see runState. */
    tasks.push({ theme, state, vps, extraPasses: CFG.extra, motion: true, vpSuffix: '' });
    // animations-enabled pass at the student's own window (a transform mid-animation can overlap text)
    if (CFG.extra) tasks.push({ theme, state, vps: own ? [own[0]] : [[1900, 1200]], extraPasses: false, motion: false, vpSuffix: '@motion' });
  }
  let next = 0, done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      const t = tasks[i];
      await runState({
        browser, engine, theme: t.theme, state: t.state, allow: allowEntries,
        vps: t.vps, extraPasses: t.extraPasses, motion: t.motion, vpSuffix: t.vpSuffix, out: findings,
      });
      done++;
      say(`  [${engine}] ${done}/${tasks.length} ${t.state.id} (${t.theme}${t.vpSuffix}) — ${findings.length} findings so far`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CFG.workers, tasks.length) }, worker));
  await browser.close();
}

/* ----------------------------------------------------------- report */

const SEV_ORDER = { BLOCKER: 0, MAJOR: 1, MINOR: 2 };
// A console error is a property of the state, not of a viewport: the main and motion passes both see it.
{
  const seen = new Set();
  for (let i = findings.length - 1; i >= 0; i--) {
    const f = findings[i];
    if (f.type !== 'console') continue;
    const k = `${f.state}|${f.theme}|${f.engine}|${f.selector}|${f.detail}`;
    if (seen.has(k)) findings.splice(i, 1); else seen.add(k);
  }
}
const live = findings.filter((f) => !f.waived);
live.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || a.type.localeCompare(b.type) || a.state.localeCompare(b.state));
const waived = findings.filter((f) => f.waived);
const capped = live.slice(0, CFG.maxFindings);

const countBy = (arr, k) => arr.reduce((m, f) => (m[f[k]] = (m[f[k]] || 0) + 1, m), {});
const bySev = countBy(live, 'severity');
const byType = countBy(live, 'type');
const blockers = live.filter((f) => f.severity === 'BLOCKER');
const majors = live.filter((f) => f.severity === 'MAJOR');

// One defect measured at 17 viewports is 17 findings, which is unreadable. Group them: one row per
// (type, state, theme, engine, selector) carrying the list of viewports it was seen at — that is the
// row a fix lane acts on, and the viewport list is what tells you which breakpoint is wrong.
const gmap = new Map();
for (const f of live) {
  const k = [f.type, f.state, f.theme, f.engine, f.selector].join('|');
  let g = gmap.get(k);
  if (!g) {
    g = { type: f.type, severity: f.severity, state: f.state, describe: f.describe, theme: f.theme, engine: f.engine, selector: f.selector, detail: f.detail, png: f.png, viewports: [] };
    gmap.set(k, g);
  }
  g.viewports.push(f.viewport);
  if (SEV_ORDER[f.severity] < SEV_ORDER[g.severity]) { g.severity = f.severity; g.detail = f.detail; }
  if (!g.png && f.png) g.png = f.png;
}
const groups = [...gmap.values()].sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || a.type.localeCompare(b.type) || a.state.localeCompare(b.state));

const report = {
  generatedAt: new Date().toISOString(),
  command: 'node qa/layout-audit.mjs ' + argv.join(' '),
  durationSec: Math.round((Date.now() - t0) / 1000),
  config: { ...CFG, vps: CFG.vps.map(VP_LABEL) },
  states: STATES.map((s) => ({ id: s.id, describe: s.describe, tags: s.tags || [] })),
  selftests,
  counts: { total: live.length, defects: groups.length, waived: waived.length, bySeverity: bySev, byType },
  groups,
  findings: capped,
  waived,
};
await writeFile(CFG.jsonPath, JSON.stringify(report, null, 1));

const pad = (s, n) => String(s).padEnd(n);
console.log('\n' + '='.repeat(78));
console.log(`LAYOUT AUDIT — ${live.length} findings (${waived.length} waived) in ${report.durationSec}s`);
console.log('='.repeat(78));
console.log('by severity:  ' + (Object.keys(bySev).length ? Object.entries(bySev).map(([k, v]) => `${k} ${v}`).join('   ') : 'none'));
console.log('by type:');
for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(t, 20)} ${n}`);
if (waived.length) {
  console.log('waived (NOT hidden — each has a reason in qa/audit-allow.json):');
  for (const [t, n] of Object.entries(countBy(waived, 'type')).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(t, 20)} ${n}  waived`);
}
const worst = Object.entries(countBy(live.filter((f) => f.severity !== 'MINOR'), 'state')).sort((a, b) => b[1] - a[1]);
if (worst.length) {
  console.log('worst states (blockers + majors):');
  for (const [s, n] of worst.slice(0, 12)) console.log(`  ${pad(s, 28)} ${n}`);
  if (worst.length > 12) console.log(`  … ${worst.length - 12} more states with findings`);
}
console.log('-'.repeat(78));
console.log(`top findings (${groups.length} distinct defects behind ${live.length} measurements):`);
const vpSpan = (vs) => {
  const u = [...new Set(vs)];
  return u.length <= 3 ? u.join(',') : `${u.length} vps ${u[0]}…${u[u.length - 1]}`;
};
for (const g of groups.slice(0, 30)) {
  console.log(`  ${pad(g.severity, 8)} ${pad(g.type, 17)} ${pad(g.state, 22)} ${pad(g.theme + '/' + g.engine, 16)} ${pad(vpSpan(g.viewports), 24)}`);
  console.log(`           ${g.selector}`);
  console.log(`           ${String(g.detail).slice(0, 150)}`);
}
if (groups.length > 30) console.log(`  … ${groups.length - 30} more defects in ${path.relative(REPO, CFG.jsonPath)} (see .groups)`);
console.log('-'.repeat(78));
console.log(`report: ${path.relative(REPO, CFG.jsonPath)}   pngs: ${path.relative(REPO, PNG_DIR)}/`);
console.log(`verdict: ${blockers.length} blockers, ${majors.length} majors → ${blockers.length || majors.length ? 'FAIL' : 'PASS'}`);

server.close();
process.exit(blockers.length || majors.length ? 1 : 0);
