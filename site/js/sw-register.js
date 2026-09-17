// sw-register.js — the page side of `sw.js` (T15). app.js calls registerSW() once at the end of boot;
// Settings reads swState() and drives checkForUpdate() / applyUpdate() / clearCaches().
//
// Why a module of its own rather than four lines inside app.js: the update flow has real states (waiting,
// installing, controlled, blocked) and a piece of UI (the "new version — reload" pill), and app.js is the
// shell every other ticket reads. BUILD-POLICY §2 — app.js gets exactly ONE line (see notes/T15.md).
//
// The S6 contract in one paragraph: GitHub Pages serves the HTML with `Cache-Control: max-age=600`, so a
// push is live within ten minutes — but `sw.js`'s own bytes never change between deploys (only the list
// does), which is why the registration passes `updateViaCache: 'none'`: the browser then re-fetches
// `sw.js` AND its `importScripts('version.js')` past the HTTP cache on every update check, sees the new
// APP_VERSION, and installs a new worker immediately. The new worker WAITS (sw.js never calls
// skipWaiting on its own), we show the pill, and only the student's tap swaps and reloads — so a version
// never changes under a half-finished Mock.

const SW_URL = new URL('../sw.js', import.meta.url);          // site/js/ → site/sw.js, wherever the site is mounted
const SW_SCOPE = new URL('./', SW_URL);                        // site/ — the scope the worker will control
const CHECK_EVERY_MS = 10 * 60 * 1000;                         // S6: the HTML is at most 10 minutes stale

const state = {
  supported: false,     // navigator.serviceWorker exists and the page is in the worker's scope
  registered: false,
  controlled: false,    // a worker is driving this page (i.e. it is genuinely offline-ready)
  updateReady: false,   // a new version is installed and waiting
  installing: false,
  version: null,        // APP_VERSION reported by the ACTIVE worker (may lag the page after a bump)
  scope: SW_SCOPE.href,
  error: null,
};

const listeners = new Set();
let registration = null;
let lastCheck = 0;
let reloading = false;
let dismissed = false;

/** subscribe(fn) → off. fn(swState()) on every state change. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { const s = swState(); for (const fn of [...listeners]) { try { fn(s); } catch (e) { console.error('sw listener', e); } } }

/** A snapshot of what the worker layer is doing. Safe before (and without) registration. */
export function swState() { return { ...state }; }

/* ---------------- the "new version — reload" pill ---------------- */

function pillEl() {
  let el = document.getElementById('sw-pill');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'sw-pill';
  el.className = 'sw-pill';
  el.setAttribute('role', 'status');
  el.hidden = true;

  const label = document.createElement('span');
  label.className = 'sw-pill-text';
  label.textContent = 'New version';        // the button says the rest; the pill must not wrap at 375 px

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn btn-primary sw-pill-go';
  go.textContent = 'Reload';
  go.addEventListener('click', () => { go.disabled = true; applyUpdate(); });

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'sw-pill-x';
  later.setAttribute('aria-label', 'Not now');
  later.textContent = '✕';
  later.addEventListener('click', () => { dismissed = true; el.hidden = true; });

  el.append(label, go, later);
  document.body.append(el);
  return el;
}

function showPill() {
  if (dismissed || typeof document === 'undefined' || !document.body) return;
  pillEl().hidden = false;
}
function hidePill() { const el = typeof document !== 'undefined' ? document.getElementById('sw-pill') : null; if (el) el.hidden = true; }

/* ---------------- registration ---------------- */

function watchWorker(worker) {
  if (!worker) return;
  state.installing = worker.state === 'installing';
  worker.addEventListener('statechange', () => {
    state.installing = worker.state === 'installing';
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      // Installed while another worker is in charge → this is an UPDATE, not a first install.
      state.updateReady = true;
      state.installing = false;
      showPill();
    }
    if (worker.state === 'activated') { state.controlled = !!navigator.serviceWorker.controller; readVersion(); }
    emit();
  });
  emit();
}

/**
 * registerSW() — register `sw.js` with `updateViaCache: 'none'` (S6), wire the update pill, and check
 * for a new version when the tab comes back to the foreground (at most once every 10 minutes).
 * Never throws and never blocks first paint: a browser without service workers, a `file://` open or a
 * page outside the worker's scope (the dev pages under qa/) simply does nothing.
 * @returns {Promise<object>} the state snapshot
 */
export async function registerSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) { state.error = 'unsupported'; emit(); return swState(); }
  if (!location.protocol.startsWith('http')) { state.error = 'needs http'; emit(); return swState(); }
  if (!location.href.startsWith(SW_SCOPE.href)) { state.error = 'out of scope'; emit(); return swState(); }
  state.supported = true;

  try {
    registration = await navigator.serviceWorker.register(SW_URL.href, { updateViaCache: 'none', scope: SW_SCOPE.href });
  } catch (e) {
    state.error = String(e && e.message ? e.message : e);
    emit();
    return swState();
  }

  state.registered = true;
  state.error = null;
  state.controlled = !!navigator.serviceWorker.controller;
  lastCheck = Date.now();

  if (registration.waiting && navigator.serviceWorker.controller) { state.updateReady = true; showPill(); }
  if (registration.installing) watchWorker(registration.installing);
  registration.addEventListener('updatefound', () => watchWorker(registration.installing));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    state.controlled = !!navigator.serviceWorker.controller;
    // Only reload when WE asked for the swap (applyUpdate). The very first install claims the page too,
    // and reloading a student mid-answer because the app just went offline-ready would be absurd.
    if (reloading) { location.reload(); return; }
    readVersion();
    emit();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate({ throttle: true });
  });

  readVersion();
  emit();
  return swState();
}

/** Ask the active worker which APP_VERSION it was built from (it may lag this page after a bump). */
function readVersion() {
  const sw = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!sw || typeof MessageChannel !== 'function') return;
  try {
    const ch = new MessageChannel();
    ch.port1.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'VERSION') { state.version = ev.data.version; state.cache = ev.data.cache; state.files = ev.data.files; emit(); }
    };
    sw.postMessage({ type: 'VERSION' }, [ch.port2]);
  } catch { /* the worker went away between the check and the post */ }
}

/**
 * checkForUpdate({ throttle }) — poll the server for a new worker.
 * @returns {Promise<'update'|'current'|'unsupported'|'throttled'|'error'>}
 */
export async function checkForUpdate({ throttle = false } = {}) {
  if (!registration) return 'unsupported';
  if (throttle && Date.now() - lastCheck < CHECK_EVERY_MS) return 'throttled';
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch (e) {
    state.error = String(e && e.message ? e.message : e);
    emit();
    return 'error';
  }
  if (registration.waiting && navigator.serviceWorker.controller) { state.updateReady = true; showPill(); emit(); return 'update'; }
  if (registration.installing) { watchWorker(registration.installing); return 'update'; }
  emit();
  return 'current';
}

/**
 * applyUpdate() — tell the waiting worker to take over, then reload when it does (via controllerchange).
 * Falls back to a plain reload if there is nothing waiting.
 */
export function applyUpdate() {
  hidePill();
  const waiting = registration && registration.waiting;
  if (!waiting) { location.reload(); return; }
  reloading = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Safety net: if the swap never lands (a worker stuck in "waiting" because another tab holds the old
  // one), reload anyway after a moment — the student asked for the new version.
  setTimeout(() => { if (reloading) location.reload(); }, 2500);
}

/**
 * clearCaches() — delete every cache this app made and unregister the worker (Settings → "Clear the
 * offline copy"). The next load re-installs from the network.
 * @returns {Promise<number>} how many caches were deleted
 */
export async function clearCaches() {
  let n = 0;
  try {
    if (typeof caches !== 'undefined') {
      for (const key of await caches.keys()) if (key.startsWith('packet-')) { await caches.delete(key); n++; }
    }
    if (registration) { await registration.unregister(); registration = null; state.registered = false; state.updateReady = false; state.controlled = false; }
  } catch (e) { state.error = String(e && e.message ? e.message : e); }
  emit();
  return n;
}

export default { registerSW, swState, subscribe, checkForUpdate, applyUpdate, clearCaches };
