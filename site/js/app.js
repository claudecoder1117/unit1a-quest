// app.js — shell: hash router (the 13 routes of COMPOSED S1), `mount`, the global `bus`, theme wiring,
// header slots (Readiness ring, T−N chip, level ring, XP, combo pip, streak arc), storage banner.
// Screens register in js/screens/index.js and overlay the placeholders below.
import { load, update, subscribe, flags, getState } from './store.js';
import { daysUntilTest } from './days.js';
import { screens } from './screens/index.js';
import { xpForLevel, levelFor, rankFor } from './xp.js';   // T09/Wave 3: the S4 ladder lives in one file
import { readiness as readinessOf } from './readiness.js';   // W4 integration: the ring is the SHELL's, not a screen's
import { housekeep } from './schedule.js';   // fix5 integrate: owed decay is charged at boot, not inside an answer's save
import { todayISO } from './days.js';

export const APP_VERSION = (typeof self !== 'undefined' && self.APP_VERSION) || 'dev';

/* ---------------- bus ---------------- */
/** Tiny event emitter: on(evt, fn) → off; once; off; emit(evt, ...args). Events used by the shell:
 *  'route' (info), 'state' (state, reason), 'theme' (effective), 'header' (hdr). */
function createBus() {
  const m = new Map();
  const on = (evt, fn) => { (m.get(evt) ?? m.set(evt, new Set()).get(evt)).add(fn); return () => off(evt, fn); };
  const off = (evt, fn) => { m.get(evt)?.delete(fn); };
  const once = (evt, fn) => { const f = (...a) => { off(evt, f); fn(...a); }; return on(evt, f); };
  const emit = (evt, ...args) => { for (const fn of [...(m.get(evt) ?? [])]) { try { fn(...args); } catch (e) { console.error(`bus:${evt}`, e); } } };
  return { on, off, once, emit };
}
export const bus = createBus();

/* ---------------- routes ---------------- */
/** The 13 route patterns (S1). `?` marks an optional segment. /night and /morning are aliases (ALIASES). */
export const ROUTE_PATTERNS = Object.freeze([
  '/today', '/binder', '/card/:id', '/variant/:template', '/run/:kind/:id?', '/boss/:id',
  '/mock', '/mock/report/:n', '/stats', '/sheet', '/settings', '/onboard', '/night|/morning',
]);
export const ALIASES = Object.freeze({ '/night': '/run/night', '/morning': '/run/morning' });
const PATTERNS = ROUTE_PATTERNS.flatMap(p => p.split('|')).filter(p => !(p in ALIASES));

/** Human names + owning ticket for titles and placeholders. */
const ROUTE_META = {
  '/today': ['Today', 'T10'], '/binder': ['Binder', 'T11'], '/card/:id': ['Card', 'T09'], '/variant/:template': ['Variant', 'T09'],
  '/run/:kind/:id?': ['Run', 'T16'], '/boss/:id': ['Boss', 'T12'], '/mock': ['Mock', 'T13'], '/mock/report/:n': ['Mock report', 'T13'],
  '/stats': ['Stats', 'T11'], '/sheet': ['Sheet', 'T14'], '/settings': ['Settings', 'T15'], '/onboard': ['Onboarding', 'T14'],
};

/** routes[pattern] = (params, query, ctx) => render | Node | string | void.  A returned function is
 *  mounted via mount(view, render) (render(el) may return a cleanup fn); a Node/string is appended;
 *  void means the handler mounted into ctx.view itself. */
export const routes = {};

const compiled = PATTERNS.map(p => ({ pattern: p, segs: p.split('/').filter(Boolean).map(s => ({ name: s.startsWith(':') ? s.replace(/^:|\?$/g, '') : null, lit: s.startsWith(':') ? null : s, opt: s.endsWith('?') })) }));

/** '#/card/ang-10?x=1' → { path:'/card/ang-10', query: URLSearchParams } */
export function parseHash(hash = location.hash) {
  let h = String(hash || '');
  if (h.startsWith('#')) h = h.slice(1);
  if (!h.startsWith('/')) h = '/' + h;
  const q = h.indexOf('?');
  const path = (q >= 0 ? h.slice(0, q) : h).replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(q >= 0 ? h.slice(q + 1) : '');
  return { path, query };
}

/** Match a path against the route table → { pattern, params } | null. */
export function matchRoute(path) {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  for (const { pattern, segs } of compiled) {
    const min = segs.filter(s => !s.opt).length;
    if (parts.length < min || parts.length > segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], v = parts[i];
      if (v === undefined) { if (!s.opt) { ok = false; } break; }
      if (s.lit !== null) { if (s.lit !== v) { ok = false; break; } }
      else params[s.name] = v;
    }
    if (ok) return { pattern, params };
  }
  return null;
}

/** navigate('/card/ang-10', { query: {seed:'x'}, replace }) — sets the hash (the router does the rest). */
export function navigate(path, { query = null, replace = false } = {}) {
  let h = '#' + (path.startsWith('/') ? path : '/' + path);
  if (query) { const qs = new URLSearchParams(query).toString(); if (qs) h += '?' + qs; }
  if (replace) history.replaceState(null, '', h); else location.hash = h;
  if (replace) route();
}

let current = null;
/** The current route: { path, pattern, params, query } (null before boot). */
export const currentRoute = () => current;

/* ---------------- mount ---------------- */
/**
 * mount(el, render) — unmount whatever is in `el` (calling the cleanup its render returned), clear it,
 * run render(el) (may return a cleanup function, a Node to append, or an HTML string), then play the
 * 24 px slide + fade. Returns el.
 */
export function mount(el, render, { animate = true } = {}) {
  if (typeof el.__unmount === 'function') { try { el.__unmount(); } catch (e) { console.error(e); } }
  el.__unmount = null;
  el.replaceChildren();
  const r = typeof render === 'function' ? render(el) : render;
  if (typeof r === 'function') el.__unmount = r;
  else if (r instanceof Node) el.append(r);
  else if (typeof r === 'string') el.innerHTML = r;
  if (animate) { el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter'); }
  return el;
}

/** h('div.cls#id', {attr, onclick}, ...children) — small element helper for screens that do not want innerHTML. */
export function h(tag, attrs = {}, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  for (const t of (m[2] || '').match(/[.#][\w-]+/g) || []) t[0] === '.' ? el.classList.add(t.slice(1)) : (el.id = t.slice(1));
  if (attrs instanceof Node || typeof attrs === 'string' || Array.isArray(attrs)) { children.unshift(attrs); attrs = {}; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof el[k] !== 'object' && k !== 'list' && k !== 'form') el[k] = v === true ? true : v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/**
 * softWrap('Always/Sometimes/Never: Angles') → ['Always/', <wbr>, 'Sometimes/', <wbr>, 'Never: Angles']
 *
 * A break opportunity after each '/', for names that are one long unbreakable token. Two of the
 * nineteen skill names are "Always/Sometimes/Never: …", a 23-character run with no space in it: CSS
 * has no way to break after a slash, so a 170 px column (Home's Skills rail) had to fall back to
 * `overflow-wrap: anywhere` and cut the word in half — "Always/Sometimes/Neve" / "r: Points, Lines,
 * Planes", at every desktop width, in both engines (ticket FINAL; notes/LAYOUT-PERFECT.md). Giving the
 * slash a real break opportunity means the last-resort break is never reached.
 *
 * <wbr> and not a zero-width space on purpose: it adds NO character, so textContent, aria names,
 * copy-paste and every test that compares a skill name are byte-identical. Returns an array, so call
 * it spread: h('span.skill-name', ...softWrap(name)).
 */
export function softWrap(text) {
  const s = String(text ?? '');
  if (!s.includes('/')) return [s];
  const out = [];
  // Keep the slash on the end of the preceding chunk (a line may end on '/'), then offer the break.
  for (const part of s.split(/(?<=\/)/)) {
    out.push(part);
    if (part.endsWith('/')) out.push(document.createElement('wbr'));
  }
  if (typeof out[out.length - 1] !== 'string') out.pop();   // a trailing slash needs no break after it
  return out;
}

/* ---------------- theme ---------------- */
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || t === 'light' ? t : (mq?.matches ? 'dark' : 'light');
}
/** applyTheme('auto'|'light'|'dark') — data-theme on <html> (removed for auto) + theme-color metas. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    if (theme === 'light' || theme === 'dark') m.setAttribute('content', bg);
    else m.setAttribute('content', m.dataset.default || bg);
  }
  const eff = effectiveTheme();
  const btn = document.getElementById('theme-toggle');
  if (btn) { btn.setAttribute('aria-label', eff === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); btn.dataset.theme = eff; }
  bus.emit('theme', eff);
}
/** Flip between light and dark from whatever is showing now; persists to settings.theme. */
export function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  update(s => { s.settings.theme = next; });
  applyTheme(next);
  return next;
}
mq?.addEventListener?.('change', () => { if (!document.documentElement.dataset.theme) applyTheme('auto'); });

/* ---------------- levels (S4) ---------------- */
// One implementation of the S4 ladder, in js/xp.js (T09's request, wired at Wave 3 integration). Re-exported
// here because home.js and the header have always imported it from the shell.
export { xpForLevel, levelFor, rankFor } from './xp.js';

/* ---------------- header ---------------- */
const hdr = { readiness: null, provisional: true, tminus: null, testDate: null, level: 1, levelPct: 0, xp: 0, combo: 0, streak: 0 };
const $ = id => document.getElementById(id);
const C36 = 2 * Math.PI * 16, C28 = 2 * Math.PI * 12;

function renderHeader() {
  const r = $('hdr-readiness');
  if (r) {
    r.dataset.provisional = String(hdr.readiness == null || hdr.provisional);
    const rf = r.querySelector('.ring-fill');
    rf.style.strokeDashoffset = C36 * (1 - (hdr.readiness ?? 0) / 100);
    rf.dataset.empty = String(!(hdr.readiness > 0));
    r.querySelector('.ring-num').textContent = hdr.readiness == null ? '—' : String(Math.round(hdr.readiness));
    r.setAttribute('aria-label', hdr.readiness == null ? 'Readiness: not scored yet' : `Readiness ${Math.round(hdr.readiness)}${hdr.provisional ? ' (provisional)' : ''}`);
  }
  const t = $('hdr-tminus');
  if (t) {
    t.classList.toggle('mono', hdr.tminus != null && hdr.tminus >= 0);
    if (hdr.tminus == null) { t.textContent = 'set test date'; t.dataset.tone = 'warn'; t.setAttribute('href', '#/settings'); t.hidden = false; }
    else if (hdr.tminus > 0) { t.textContent = `T−${hdr.tminus}`; t.dataset.tone = hdr.tminus <= 2 ? 'warn' : ''; t.setAttribute('href', '#/today'); t.hidden = false; }
    else if (hdr.tminus === 0) { t.textContent = 'TEST DAY'; t.dataset.tone = 'accent'; t.setAttribute('href', '#/today'); t.hidden = false; }
    else { t.textContent = 'after the test'; t.dataset.tone = ''; t.setAttribute('href', '#/settings'); t.hidden = false; }
  }
  const l = $('hdr-level');
  if (l) {
    const lf = l.querySelector('.ring-fill');
    lf.style.strokeDashoffset = C28 * (1 - Math.min(1, Math.max(0, hdr.levelPct)));
    lf.dataset.empty = String(!(hdr.levelPct > 0));
    l.querySelector('.ring-num').textContent = String(hdr.level);
    l.setAttribute('aria-label', `Level ${hdr.level} ${rankFor(hdr.level)}`);
    l.title = `Level ${hdr.level} · ${rankFor(hdr.level)}`;
  }
  const x = $('hdr-xp'); if (x) x.textContent = `${Math.round(hdr.xp)} XP`;
  const c = $('hdr-combo');
  if (c) { c.dataset.tier = hdr.combo >= 10 ? '3' : hdr.combo >= 5 ? '2' : hdr.combo >= 1 ? '1' : '0'; c.querySelector('.combo-n').textContent = hdr.combo >= 1 ? `×${(1 + 0.1 * Math.min(hdr.combo, 10)).toFixed(1)}` : ''; c.setAttribute('aria-label', `Combo ${hdr.combo}`); }
  const s = $('hdr-streak');
  if (s) {
    s.dataset.count = String(hdr.streak);
    const deg = Math.min(180, hdr.streak * 10);   // protractor arc opens 10° per day
    const a = Math.PI * deg / 180, cx = 14, cy = 18, R = 12;
    const ex = cx - R * Math.cos(a), ey = cy - R * Math.sin(a);
    s.querySelector('.arc-fill').setAttribute('d', deg <= 0 ? '' : `M ${cx - R} ${cy} A ${R} ${R} 0 ${deg > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`);
    s.querySelector('.streak-n').textContent = String(hdr.streak);
    s.setAttribute('aria-label', `Streak ${hdr.streak} day${hdr.streak === 1 ? '' : 's'}`);
  }
  renderJobHeader();
  bus.emit('header', { ...hdr });
}

/** setHeader({ readiness, provisional, combo, … }) — screens push what only they know (Readiness from T10, combo from T09). */
export function setHeader(patch) { Object.assign(hdr, patch); renderHeader(); }
export const getHeader = () => ({ ...hdr });

/* ---------------- the game header ---------------- */
/**
 * **DURING A GAME SESSION THE SHELL PRINTS NO NUMBER AT ALL.**
 *
 * CUT-BRIEF's first hard limit: *"at most three numbers on screen at once during play: the pile, the
 * streak multiplier, and what the current question pays. Nothing else numeric."* Those three live in
 * the screen's own strip (`screens/job.js`). The header is on screen during play, so every read-out
 * in it steps aside and NOTHING takes their place. (The header used to add `loose` / `bag` /
 * `chain` beside them; all three are cut.)
 *
 * `notes/DEMOLISH.md` §6.5 left one decision open — whether the limit reaches the app shell — and
 * this is the decision. It has to be yes: `hdr-readiness` prints `57` and `hdr-tminus` prints `T−3`,
 * so keeping "just those two" would put FIVE numbers on a phone screen that is allowed three.
 * `hdr-tminus` goes with them rather than being special-cased on the day it happens to read
 * "TEST DAY": one rule, no state in which the shell prints a number during a session.
 */
export const HDR_JOB_HIDE = Object.freeze(['hdr-readiness', 'hdr-tminus', 'hdr-level', 'hdr-streak', 'hdr-xp', 'hdr-combo']);
/** Nothing survives into a session — the strip is the only place a number may appear. */
export const HDR_JOB_KEEP = Object.freeze([]);
const HDR_ALL = Object.freeze([...HDR_JOB_KEEP, ...HDR_JOB_HIDE]);

const job = { on: false };

/** `setJobHeader(true)` swaps the header into game mode; `null` swaps it back. */
export function setJobHeader(patch) {
  job.on = patch != null && patch !== false;
  renderHeader();
}
export const getJobHeader = () => ({ ...job });

/** The header items that are actually on screen right now — 6 outside a session, 2 during one. */
export function headerItems() {
  if (typeof document === 'undefined') return [];
  return HDR_ALL.filter((id) => { const el = $(id); return !!el && !el.hidden; });
}

function renderJobHeader() {
  if (typeof document === 'undefined') return;
  const bar = document.querySelector('.hdr');
  if (bar) { if (job.on) bar.dataset.job = 'true'; else delete bar.dataset.job; }
  for (const id of HDR_JOB_HIDE) { const el = $(id); if (el) el.hidden = job.on; }
}

function syncHeaderFromState(s) {
  const L = levelFor(s.xp), lo = xpForLevel(L), hi = xpForLevel(L + 1);
  Object.assign(hdr, {
    xp: s.xp, level: L, levelPct: (s.xp - lo) / (hi - lo),
    streak: s.streak?.count ?? 0,
    testDate: s.settings?.testDate ?? null,
    tminus: daysUntilTest(s.settings?.testDate),
  });
  // W4 integration: the Readiness ring used to be pushed by each screen that happened to compute it
  // (Home, Binder, Stats, Settings, the Card, Run, Night). A deep link straight to #/mock, #/boss/:id or
  // a report therefore showed "—" while the app knew the number perfectly well. Readiness is a pure
  // function of the save, so the shell derives it here and no screen has to remember; the screens' own
  // setHeader({readiness}) calls stay valid and write the same value.
  try { const r = readinessOf(s); hdr.readiness = r.r; hdr.provisional = r.provisional; } catch { /* keep the last */ }
  renderHeader();
}

/* ---------------- banner ---------------- */
export function showBanner(text, { action = null, onAction = null, dismiss = true } = {}) {
  const b = $('banner'); if (!b) return;
  const inner = b.querySelector('.banner-inner');
  inner.replaceChildren(h('span', text));
  if (action && onAction) inner.append(h('button.btn', { type: 'button', onclick: onAction }, action));
  if (dismiss) inner.append(h('button.btn', { type: 'button', 'aria-label': 'Dismiss', onclick: () => { b.hidden = true; } }, '✕'));
  b.hidden = false;
}
export function hideBanner() { const b = $('banner'); if (b) b.hidden = true; }

function storageBanner() {
  if (flags.corruptRecovered) showBanner('Your save was unreadable and has been backed up (u1a.save.bak). Starting fresh — Settings → Import can restore a copy.');
  else if (flags.memoryOnly) showBanner('Saving is off in this browser (private mode or storage full). Progress lasts until you close the tab — export from Settings.');
}

/* ---------------- placeholders ---------------- */
function placeholder(pattern) {
  const [name, ticket] = ROUTE_META[pattern];
  return (params, query) => (el) => {
    const entries = [...Object.entries(params), ...[...query.entries()].map(([k, v]) => ['?' + k, v])];
    el.append(h('section.screen.placeholder', { 'aria-labelledby': 'ph-title' },
      h('p.muted.fs-1.mono', `#${current?.path ?? pattern}`),
      h('h1#ph-title', name),
      h('p.muted', `This screen lands with ticket ${ticket}. The shell, router, save and theme are live.`),
      entries.length ? h('dl', entries.flatMap(([k, v]) => [h('dt', k), h('dd', v)])) : null,
      pattern === '/today' ? h('p', h('a.btn.btn-primary', { href: '#/run/page' }, 'RUN NEXT')) : null,
      h('nav', { 'aria-label': 'Screens' }, h('ul.route-list',
        [['#/today', 'today'], ['#/binder', 'binder'], ['#/card/ang-10', 'card/ang-10'], ['#/variant/T-wp-07?seed=a91f2c', 'variant'],
         ['#/run/page', 'run/page'], ['#/run/blitz/M1', 'run/blitz/M1'], ['#/boss/B4', 'boss/B4'], ['#/mock', 'mock'], ['#/mock/report/1', 'mock/report/1'],
         ['#/stats', 'stats'], ['#/sheet', 'sheet'], ['#/settings', 'settings'], ['#/onboard', 'onboard'], ['#/night', 'night'], ['#/morning', 'morning']]
          .map(([href, label]) => h('li', h('a', { href, 'aria-current': current && href.slice(1).split('?')[0] === current.path ? 'page' : null }, label))))),
    ));
  };
}

/* ---------------- owed decay (fix5 integrate) ---------------- */
/**
 * Charge any owed idle-day decay (the same schedule.js housekeeping Home runs) BEFORE a screen mounts, once per
 * calendar day. Without it a phone tab restoring #/run/page after idle days showed the undecayed number in the
 * header and charged the decay inside the first CLEAN answer's save (57 → 55 on a GOLD clear; critic home r3).
 * Writes only when a skill decayed or frozen cards were pruned, so an ordinary boot never dirties the save.
 */
let housekeptDay = null;
function chargeOwedDecay() {
  const today = todayISO();
  if (housekeptDay === today) return;
  housekeptDay = today;
  try {
    const r = housekeep(structuredClone(getState()), { today });
    if (r.decayed || r.pruned) update((s) => { housekeep(s, { today }); });
  } catch (e) { console.error('housekeep', e); }
}

/* ---------------- router ---------------- */
function route() {
  chargeOwedDecay();
  const view = $('view');
  const { path, query } = parseHash();
  if (path === '/' || path === '') { navigate('/today', { replace: true }); return; }
  if (path in ALIASES) { navigate(ALIASES[path], { replace: true, query: Object.fromEntries(query) }); return; }
  const m = matchRoute(path);
  if (!m) { navigate('/today', { replace: true }); return; }
  current = { path, pattern: m.pattern, params: m.params, query };
  const handler = routes[m.pattern];
  document.title = `${ROUTE_META[m.pattern]?.[0] ?? 'The Packet'} · The Packet`;
  try {
    const r = handler(m.params, query, { view, state: getState(), path });
    if (r && typeof r.then === 'function') {
      // home r1: lazy screens (screens/index.js) resolve to their render once the module has loaded.
      const mine = current;
      r.then((rr) => { if (current === mine) { if (rr !== undefined) mount(view, rr); window.scrollTo(0, 0); } })
        .catch((e) => { if (current !== mine) return; console.error('route', path, e); mount(view, el => { el.append(h('section.screen.placeholder', h('h1', 'Something broke on this screen'), h('p.muted.mono', String(e?.message || e)), h('p', h('a.btn', { href: '#/today' }, 'Back to Today')))); }); });
    } else if (r !== undefined) mount(view, r); else { view.classList.remove('view-enter'); void view.offsetWidth; view.classList.add('view-enter'); }
  } catch (e) {
    console.error('route', path, e);
    mount(view, el => { el.append(h('section.screen.placeholder', h('h1', 'Something broke on this screen'), h('p.muted.mono', String(e?.message || e)), h('p', h('a.btn', { href: '#/today' }, 'Back to Today')))); });
  }
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
  bus.emit('route', current);
}

/**
 * **A LINK TO THE ROUTE YOU ARE ALREADY ON HAS TO ACT** (verify round 3, player-feel — BLOCKER).
 *
 * The router above was `window.addEventListener('hashchange', route)` and nothing else. An anchor
 * whose href resolves to the URL the browser is already at fires NO `hashchange` — so every
 * "again" control in the app was inert, because each one is rendered by the screen it points at:
 *
 *   · the Page Summary's `Another page` → `#/run/page`, rendered at `#/run/page`.
 *   · `againLabel(kind)` → `#/run/:kind/:id`, rendered at `#/run/:kind/:id`.
 *
 * `screens/onboard.js:624` already carried the workaround in a comment — *"`&intro=1` only makes
 * the hash differ … so the ← anchor fires a hashchange"*. That is the hazard, handled once, here,
 * for every screen instead of per link: the anchor is the control the student sees, so the router
 * listens to the ACTIVATION as well as to the hash. Nothing else changes — a link to a different
 * hash is left entirely to the browser (the `hashchange` above routes it, one history entry, back
 * button intact), and a same-route press adds no history entry at all, which is what running the
 * same thing again should do.
 *
 * Deliberately narrow, so this can never eat a click that means something else: primary button, no
 * modifier, not already handled by a screen (`defaultPrevented`), no `target`/`download`, an
 * in-page `#…` href only, and only when it resolves to the WHOLE current URL — query string
 * included, so `#/run/page?seed=x` still goes through the hash the ordinary way.
 */
export function sameRouteClick(ev) {
  /* GATED ON THE FLAG (round-3 integration). CUT-BRIEF: "settings.game = false returns the app to
     byte-identical COMPOSED behaviour", and this handler is the game layer's — COMPOSED re-mounted
     nothing on a same-route anchor (`screens/onboard.js` carried a per-link workaround instead).
     The flag is read HERE and not at the install above, deliberately: a boot-time gate would leave
     the handler out of step with `plan.pillsFor`, which reads the flag on every paint, for the whole
     of the session in which a student flips the switch in Settings. The predicate is inlined rather
     than imported from `plan.js` (which is `gameOn`, and is the same one line) because `plan.js` is
     a lazy module and the shell must not pull the plan graph into its first paint — `screens/home.js`
     inlines it for the same reason and says so. */
  if (getState()?.settings?.game === false) return;
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const t = ev.target;
  const a = t && typeof t.closest === 'function' ? t.closest('a[href]') : null;
  if (!a || a.target || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href || href[0] !== '#' || href === '#') return;          // in-app hash links only
  if (a.href !== location.href) return;                          // a different route: hashchange has it
  ev.preventDefault();
  route();
}

/* ---------------- boot ---------------- */
function boot() {
  for (const p of PATTERNS) routes[p] = placeholder(p);
  for (const [p, fn] of Object.entries(screens)) {
    if (!(p in routes)) { console.warn(`screens/index.js: unknown route pattern "${p}" (must be one of ${PATTERNS.join(' ')})`); continue; }
    routes[p] = fn;
  }
  const state = load();
  applyTheme(state.settings.theme);
  chargeOwedDecay();                                                   // fix5 integrate: before the header's first number
  syncHeaderFromState(getState());
  subscribe((s, reason) => { syncHeaderFromState(s); if (reason !== 'update') applyTheme(s.settings.theme); bus.emit('state', s, reason); });
  storageBanner();
  $('theme-toggle')?.addEventListener('click', toggleTheme);
  const ver = document.querySelector('meta[name="build"]'); if (ver && APP_VERSION !== 'dev') ver.setAttribute('content', APP_VERSION);
  window.addEventListener('hashchange', route);
  document.addEventListener('click', sameRouteClick);                  // verify r3: see `sameRouteClick`
  route();
  // Wave-1 integrator wiring (notes/T03.md → Requests): warm the grader registry once at boot so the
  // lazily imported T04/T05 graders have settled before the first submit. Deliberately NOT a static
  // import — the dynamic import keeps the first paint off the grader module graph. Screens that grade
  // (`screens/card.js`, T09) `await window.packet.graders` (or `await ready` from the module) once
  // before their first grade() call; until it resolves grade() answers `malformed` err:'no-grader'.
  // home r2 (visual QA, S9 #1): the warm-up no longer fires the instant route() returns — 262 KB of graders
  // competed with Home's own lazy page/plan graph on a 3G-class link. `packet.graders` is a getter: the first
  // reader (card.js before its first grade) starts the import at once; otherwise it starts after the window's
  // load event + 2 s, i.e. once the first screen has everything it asked for. Same promise either way.
  let gradersP = null;
  const warmGraders = () => (gradersP ??= import('./grader/index.js')
    .then(async (m) => { await m.ready; if (m.missing.length) console.warn('graders failed to load:', m.missing); return m; })
    .catch((err) => { console.warn('grader registry unavailable:', err); return null; }));
  window.packet = { bus, navigate, currentRoute, getState, update, setHeader, applyTheme, toggleTheme, APP_VERSION, flags, get graders() { return warmGraders(); } };
  const afterLoad = () => setTimeout(warmGraders, 2000);
  if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad, { once: true });
  import('./sw-register.js').then(m => { window.packet.sw = m; return m.registerSW(); }).catch(() => {});   // T15: offline + "new version — reload" pill
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}
