// qa/audit-states.mjs — the catalog of every screen state the layout auditor must check (ticket AUDIT-STATES).
// Dev-only: nothing under site/ imports this, and it is never part of the deployed artifact.
//
//   import { states } from './audit-states.mjs';
//   for (const st of states(h)) { await st.prepare(page); /* measure, shoot, report */ }
//
// CONTRACT (qa/layout-audit.mjs is written against it — do not change the shape without telling that lane):
//   states(h) -> Array<{ id, describe, tags: string[], prepare: async (page) => void }>
//   h = { base, gotoRoute(page, hash), setSave(page, json), waitReady(page), readFixture(name) }
// Every helper in `h` is OPTIONAL: `adapt()` below fills in a working default for anything missing, so the
// catalog also runs from a bare Playwright page (that is what qa/audit-selftest.mjs does). `base` is the
// only thing the caller must supply — the origin the site is being served from.
//
// Two extras ride along on each state, additive and safe to ignore:
//   root  — the CSS selector that proves the state actually happened (prepare waits for it)
//   media — 'print' on the one state that needs print emulation ('screen' everywhere else)
//
// ONE REQUIREMENT ON YOUR CONTEXT: `browser.newContext({ …, serviceWorkers: 'block' })`. With them allowed,
// a WebKit navigation served by the app's own service worker never finishes and `page.goto` hangs for ever
// (details on killServiceWorkers below; qa/shot.mjs and qa/s9-walk.mjs already block them).
//
// WHY THE CATALOG EXISTS: every responsive rule in the app is keyed to the VIEWPORT, but a component is
// hosted at widths that have nothing to do with it — a card lives inside #/card, inside a run, inside the
// onboarding placement, inside a boss, inside a mock. The placement bug (one letter per line at 1900 px:
// `.card-stem` 0 px wide inside a 336 px content column) was invisible to every #/card check. So the states
// below deliberately open the SAME components through EVERY host they live in.
//
// Fixtures: built, never hand-typed (qa/fixtures/audit-build.mjs). They are re-anchored onto today's date
// as they are loaded, so they never go stale. `readFixture` (yours or ours) is also tried for foreign names
// like 'midweek.json' or 's9:after-ace.json'.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDERS, FIX_DIR, buildAll, freshen } from './fixtures/audit-build.mjs';

const QA = dirname(fileURLToPath(import.meta.url));
const REPO = join(QA, '..');
const SEARCH = [FIX_DIR, join(QA, 'fixtures'), join(QA, 'screenshots', 's9')];

/* ================================================================= plumbing */

function adapt(h = {}) {
  const base = String(h.base || 'http://127.0.0.1:8090/').replace(/#.*$/, '').replace(/\/?$/, '/');
  return {
    base,
    gotoRoute: h.gotoRoute || ((page, hash) => page.goto(base + hash, { waitUntil: 'networkidle' })),
    setSave: h.setSave || (async (page, json) => { await page.evaluate(j => localStorage.setItem('u1a.save', j), json); }),
    waitReady: h.waitReady || (page => page.waitForTimeout(450)),
    readFixture: h.readFixture || null,
  };
}

/** Lazily build qa/fixtures/audit/* the first time a state asks for one. */
let built = null;
async function ensureFixtures() {
  if (built) return built;
  const missing = Object.keys(BUILDERS).filter(n => !existsSync(join(FIX_DIR, n)));
  built = missing.length ? buildAll().then(() => true) : Promise.resolve(true);
  return built;
}

const cache = new Map();
/**
 * fixture('page-mid.json') → the save as a JSON string, re-anchored onto today.
 * A name may be prefixed to force a folder: 's9:after-ace.json' looks in qa/screenshots/s9 only.
 */
async function fixture(H, name) {
  if (cache.has(name)) return cache.get(name);
  if (name in BUILDERS) await ensureFixtures();
  const [folder, file] = name.includes(':') ? name.split(':') : [null, name];
  const dirs = folder === 's9' ? [join(QA, 'screenshots', 's9')] : SEARCH;
  let raw = null;
  for (const d of dirs) { const p = join(d, file); if (existsSync(p)) { raw = readFileSync(p, 'utf8'); break; } }
  if (raw == null && H.readFixture) { try { const r = await H.readFixture(file); raw = typeof r === 'string' ? r : JSON.stringify(r); } catch { /* fall through */ } }
  if (raw == null) throw new Error(`audit-states: no fixture "${name}" under ${dirs.map(d => d.replace(REPO + '/', '')).join(' · ')}`);
  const json = JSON.stringify(freshen(JSON.parse(raw)));
  cache.set(name, json);
  return json;
}

/**
 * Land on the RESUMED open Mock (question 4 of 20, ~36 min left). The rules screen only grows its
 * "Resume · MM:SS left" button once it has read the open run off the save, and tapping too early starts a
 * BRAND NEW paper at 1/20 — so wait for the resume stats, not for the button alone.
 */
async function resumeMock(H, page) {
  await go(H, page, '#/mock', { save: await freshMockOpen(H), root: '.mock-screen' });
  await page.waitForSelector('.mock-resume-stats', { timeout: 15000 }).catch(() => {});
  await tap(page, '.mock-start', { wait: 900 });
  await page.waitForSelector('.mock-screen[data-phase="run"]', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.mock-body .w, .mock-parts .w, .card-parts .w', { timeout: 15000 }).catch(() => {});
  await nap(page, 400);
}

/** The mid-mock save with its open run's clock restarted, so the paper always has ~36 min left. */
async function freshMockOpen(H) {
  const s = JSON.parse(await fixture(H, 'mock-open.json'));
  const run = (s.runs || []).filter(r => r && r.status === 'open').pop();
  if (run) { run.startedAt = Date.now() - 4 * 60000; run.submittedAt = null; }
  return JSON.stringify(s);
}

/* ---- page driving ---- */

const nap = (page, ms) => page.waitForTimeout(ms);

/** Click by selector without Playwright's actionability wait (a sticky dock never blocks us). */
async function tap(page, sel, { wait = 300 } = {}) {
  const el = await page.$(sel);
  if (!el) return false;
  await el.evaluate(e => e.click());
  if (wait) await nap(page, wait);
  return true;
}
const has = async (page, sel) => !!(await page.$(sel));

/**
 * WEBKIT, READ THIS: create the context with `serviceWorkers: 'block'` (qa/shot.mjs and qa/s9-walk.mjs
 * already do). With service workers allowed, the app's own SW registers on the first load and CONTROLS the
 * second one, and in WebKit that navigation never reports "finished" — `page.goto` hangs for ever, taking
 * the auditor with it (`page.evaluate` has no default timeout, so nothing rescues it). Belt and braces:
 * every `go()` unregisters whatever is registered and empties the caches while it is on the warm-up
 * document, so the catalog survives a context that allows them. Nothing else about the app needs the SW —
 * offline behaviour is `qa/s9-walk.mjs offline`'s job, not the layout auditor's.
 */
async function killServiceWorkers(page) {
  await Promise.race([
    page.evaluate(async () => {
      try {
        for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      } catch { /* blocked or unsupported: nothing to do */ }
    }),
    new Promise(r => setTimeout(r, 3000)),
  ]).catch(() => {});
}

/** Write (or clear) the save on the warm-up document. */
async function putSave(H, page, save) {
  if (save === null) await page.evaluate(() => { try { localStorage.removeItem('u1a.save'); localStorage.clear(); } catch { /* private mode */ } });
  else await H.setSave(page, save);
}

/**
 * Did the app actually BOOT on the save we wrote? It is not always the one on disk: with a live service
 * worker the previous app document can outlive the warm-up navigation long enough for its own flush to
 * overwrite ours, and the next screen then renders the PREVIOUS state's data while looking perfectly
 * healthy — a state that lies is worse than a state that fails. So check, and if it is wrong, write the
 * save again and reload. (Every fixture carries a distinct `profileId`; a fresh state must boot with no
 * cards and no finished placement.)
 */
async function ensureSave(H, page, save) {
  const want = save === null ? null : (() => { try { return JSON.parse(save).profileId ?? null; } catch { return null; } })();
  for (let attempt = 0; attempt < 2; attempt++) {
    const got = await page.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('u1a.save') || 'null');
        return s ? { profileId: s.profileId ?? null, cards: Object.keys(s.cards || {}).length, placed: !!s.placement?.done, runs: (s.runs || []).length } : null;
      } catch { return null; }
    });
    const ok = save === null
      ? (!got || (got.cards === 0 && !got.placed && got.runs === 0))
      : (!!got && (want == null || got.profileId === want));
    if (ok) return true;
    await putSave(H, page, save);
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await H.waitReady(page);
  }
  return false;
}

/** Reset media + save, load the route, wait for the screen to prove it mounted. */
async function go(H, page, hash, { save = null, root = null, media = 'screen', wait = 0 } = {}) {
  try { await page.emulateMedia({ media }); } catch { /* older driver */ }
  await page.goto(H.base + 'version.js', { waitUntil: 'load' });     // a real document load, so the save below is read at boot
  await killServiceWorkers(page);
  await putSave(H, page, save);
  await H.gotoRoute(page, hash.startsWith('#') ? hash : '#' + hash);
  await ensureSave(H, page, save);
  if (root) await page.waitForSelector(root, { timeout: 20000 }).catch(() => { /* the auditor reports the blank */ });
  await H.waitReady(page);
  if (wait) await nap(page, wait);
}

/** Wait for a card (anywhere: #/card, a run, the placement, a boss) to be live with its widgets mounted. */
async function cardLive(page, { timeout = 20000 } = {}) {
  await page.waitForSelector('.card-screen:not([data-state="loading"])', { timeout }).catch(() => {});
  await page.waitForSelector('.card-parts .w, .card-parts .w-field, .card-parts button', { timeout }).catch(() => {});
  await nap(page, 400);
}

/** The card the current route is showing, with its parts — read from the app's own data module. */
function cardInfo(page) {
  return page.evaluate(async () => {
    const id = decodeURIComponent((location.hash.match(/#\/card\/([^?]+)/) || [])[1] || '');
    if (!id) return null;
    try {
      const m = await import('/data/cards.js');
      const c = m.byId[id];
      return c ? { id, parts: (c.parts || []).map(p => ({ id: p.id, type: p.type, answer: p.answer ?? null, fields: (p.fields || []).map(f => ({ key: f.key, answer: f.answer })), valid: p.valid ?? null, rejected: p.rejected ?? null, reason: p.reason ?? null, rows: p.rows ?? null, cols: (p.cols || []).map(c2 => c2.key) })) } : null;
    } catch { return null; }
  });
}

/** Type into the widget fields of the live card: `{ key: value }` (num → key 'value', multi → its keys). */
function typeFields(page, values) {
  return page.evaluate((vals) => {
    let n = 0;
    for (const [key, val] of Object.entries(vals)) {
      const inp = document.querySelector(`.card-parts .w-field[data-key="${key}"] input, .mock-parts .w-field[data-key="${key}"] input`);
      if (!inp || inp.disabled || inp.readOnly) continue;
      inp.focus();
      inp.value = String(val);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      n++;
    }
    return n;
  }, values);
}

/** Every simple text answer this card wants, from its own data (num + multi only — the typed widgets). */
function answersOf(info) {
  const out = {};
  for (const p of info?.parts ?? []) {
    if (p.type === 'num' && p.answer != null) out.value = p.answer;
    if (p.type === 'multi') for (const f of p.fields) if (f.answer != null) out[f.key] = f.answer;
  }
  return out;
}

// card.js does not charge the SAME wrong answer twice (`isRepeatWrong`), so each attempt must differ or
// the third submit never forces the worked solution.
const WRONG = ['999', '111', '7', '404'];
/** Fill every typed field with a well-formed WRONG answer (a blank submit is "malformed" and costs nothing). */
async function typeWrong(page, info, attempt = 0) {
  const vals = {};
  for (const k of Object.keys(answersOf(info))) vals[k] = WRONG[attempt % WRONG.length];
  return Object.keys(vals).length ? typeFields(page, vals) : 0;
}

const submit = (page) => tap(page, '.card-submit:not([hidden])', { wait: 650 });

/**
 * Put a well-formed WRONG answer into whatever the card is asking for. Typed widgets get a number;
 * the tap widgets get a build/pick (an EMPTY submit is "malformed" and is never charged, so a state that
 * needs the card to move on cannot just hit Submit).
 */
async function attemptWrong(page, info, attempt = 0) {
  if (await typeWrong(page, info, attempt)) return true;
  // No card data (a generated Variant inside a run / boss / placement has no entry in data/cards.js):
  // fill every live text field instead — a number is well-formed everywhere and grades WRONG, not malformed.
  const typed = await page.evaluate((v) => {
    let n = 0;
    for (const inp of document.querySelectorAll('.card-parts .w-field input, .mock-parts .w-field input, .mock-body .w-field input')) {
      if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
      inp.focus(); inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); n++;
    }
    return n;
  }, WRONG[attempt % WRONG.length]);
  if (typed) return true;
  return page.evaluate(({ i, wrong }) => {
    const q = (s) => [...document.querySelectorAll(`.card-parts ${s}`)].filter(b => !b.disabled && b.getClientRects().length);
    // The notation builder — matched on the WIDGET, not on an enabled letter: once a build is complete the
    // letter row disables itself, so Clear has to come first. Stay on a TWO-letter kind (ray / line /
    // segment) and vary the letters: a three-letter kind with two letters builds nothing, and a null build
    // grades "malformed", which is free — the card would never reach its third miss.
    if (document.querySelector('.card-parts .w-nt, .card-parts .w-nt-letters')) {
      [...document.querySelectorAll('.card-parts .w-nt-edit')].find(b => /clear/i.test(b.textContent))?.click();
      const deco = q('.w-nt-deco-btn');
      (deco.find(b => /ray/i.test(b.textContent)) || deco.find(b => /line/i.test(b.textContent)) || deco[0])?.click();
      const ls = q('.w-nt-letter');
      if (!ls.length) return false;
      ls[i % ls.length]?.click();
      ls[(i + 2) % ls.length]?.click();
      return true;
    }
    // THE CLOZE, and why it needs its own branch (ticket fix:tests r1, layout-safari finding 1).
    // `.w-cz-slot` is a BLANK, not an answer: clicking it only calls `setActive(i)`, which opens the
    // `.w-cz-picker` underneath. The generic loop below used to match `.w-cz-slot` before `.wd-chip`,
    // so every attempt on a cloze selected a blank, left it empty, and graded `almost` — free by
    // Global law 2, therefore never a rung, therefore never a payout beat. The job's first target off
    // `midweek.json` is the VOC cloze `def-02`, so that fired on EVERY job state in this catalog.
    // Fill every blank (chips through their own picker, typed blanks with a well-formed wrong value)
    // and let Submit grade a complete answer.
    if (document.querySelector('.card-parts .w-cz-slot, .card-parts .w-cz-in')) {
      let filled = 0;
      for (const [k, slot] of [...document.querySelectorAll('.card-parts .w-cz-slot')].entries()) {
        if (slot.disabled || !slot.getClientRects().length) continue;
        slot.click();                                            // opens .w-cz-picker for THIS blank
        const chips = q('.w-cz-picker .wd-chip');
        if (!chips.length) continue;
        // vary with the attempt: card.js refuses to charge the same wrong answer twice, so a fixed
        // pick would stall the card at attempt 2 instead of forcing the worked solution.
        chips[(i + k + 1) % chips.length].click();
        filled++;
      }
      for (const inp of document.querySelectorAll('.card-parts .w-cz-in')) {
        if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
        inp.focus(); inp.value = wrong; inp.dispatchEvent(new Event('input', { bubbles: true })); filled++;
      }
      if (filled) return true;
    }
    // PAIRS: one angle is not an answer — a pair is two, and the part wants `data-count` of them.
    // Clicking a single `.w-pairs-angle` (what the generic loop below did) leaves the submission
    // incomplete, which grades `almost` and is free, so the card never reaches a graded outcome and
    // a job target never reaches its payout beat. (ticket fix:tests r1.)
    const pairsWidget = document.querySelector('.card-parts .w-pairs');
    if (pairsWidget) {
      const need = Math.max(1, Number(pairsWidget.dataset.count) || 1);
      const btns = q('.w-pairs-angle');
      if (btns.length >= 2) {
        for (let k = 0; k < need; k++) {
          btns[(i + 2 * k) % btns.length]?.click();
          btns[(i + 2 * k + 1) % btns.length]?.click();
        }
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

/**
 * Miss the live card until it is finished (three misses → the forced worked solution) and take Continue —
 * the only way to reach the NEXT item of a run/placement without knowing the answer.
 */
async function missOn(page, { max = 5, boss = false } = {}) {
  const info = await cardInfo(page);
  for (let i = 0; i < max; i++) {
    if (await has(page, '.card-continue:not([hidden])')) break;
    await attemptWrong(page, info, i);
    if (!(await submit(page))) break;
    if (boss) {
      if (await has(page, '.boss-continue')) return 'continue';
      await tap(page, '.boss-skip-setup', { wait: 400 });   // B4: an empty equation slot blocks the answer
    }
  }
  return has(page, '.card-continue:not([hidden])') ? 'done' : 'stuck';
}

/* ---- driving a JOB (ticket fix:tests r1 — layout-safari findings 1, 3 and 5) ----------------
   Five job states used to be the whole game layer's layout coverage, and two of them never arrived:
   `job-payout` timed out on its own root on every run (the cloze branch in `attemptWrong` above),
   and `job-debrief` measured the QUIT debrief, which has no regret lines, no mint, no histogram and
   no skill bars. The getaway, the brief window and the vault target had no state at all. These
   helpers make all of them reachable in seconds instead of by answering eleven targets. */

/** The height an open phone keyboard takes off the VISUAL viewport (iOS 15 / Android ≈ 290–340 px).
 *  336 leaves 331 px of a 667 px phone — the band this file used to model as a LAYOUT viewport of
 *  375x331, which is not a configuration any device produces. */
export const KB_PX = 336;

/** The keyboard-open phone — J6's own acceptance configuration ("a full 10-target job at 375×667
 *  **with the keyboard open**"). These are LAYOUT viewports: real phones, at their real heights,
 *  with `pinKeyboard` taking KB_PX off the visual viewport of each. Round 3 (layout-safari): the
 *  list used to be `[[375, 667], [375, 331], [390, 400], [320, 460]]` — a 667 px row with `--kb: 0`
 *  (keyboard open, nothing lifted: impossible) followed by three shrunken LAYOUT viewports (a
 *  keyboard does not resize the layout viewport: every sticky dock rides up with the fold and
 *  nothing can ever be found underneath). Both mistakes hid the same class of defect. */
export const VP_KB = [[375, 667], [390, 844], [360, 640], [320, 568]];

/** Post the board off a fixture and take the job: the first sealed envelope is up. */
async function jobToEnvelope(H, page, { save = 'midweek.json' } = {}) {
  await go(H, page, '#/run/job', { save: await fixture(H, save), root: '.job-screen' });
  await page.waitForSelector('.job-screen .job-primary', { timeout: 20000 }).catch(() => {});
  await tap(page, '.job-screen .job-primary', { wait: 700 });
  await page.waitForSelector('.job-screen .job-envelope', { timeout: 20000 }).catch(() => {});
}

/** Lock a call on the live envelope. The stem is not in the DOM until this happens (G1). */
async function jobLockCall(page) {
  await page.waitForSelector('.job-screen .job-call', { timeout: 20000 }).catch(() => {});
  return tap(page, '.job-screen .job-call[data-call="70"], .job-screen .job-call', { wait: 700 });
}

/**
 * Answer the live target — correctly if the card's own stored answer can drive its widget, by
 * missing out if not — and wait for the payout beat. `cardInfo` cannot help here: it reads the id
 * out of `#/card/<id>`, and inside a job the hash is `#/run/job`, so the target has to be read off
 * the save's own `inProgress.queue[idx]` (state.js `queueOf` / `idxOf` read exactly that).
 */
async function jobAnswerOne(page, { clear = false } = {}) {
  await jobLockCall(page);
  await cardLive(page);
  const cleared = clear ? await jobClearLive(page) : false;
  if (!cleared) await missOn(page);
  await page.waitForSelector('.job-screen .job-beat:not([hidden])', { timeout: 20000 }).catch(() => {});
  return has(page, '.job-screen .job-beat:not([hidden])');
}

/** The job screen's own `data-phase`, or null when the job screen is not mounted. */
const jobPhase = (page) => page.evaluate(() => document.querySelector('.job-screen')?.dataset?.phase ?? null);

/** The debrief's root — the one screen `job-debrief` and `job-debrief-quit` both name. */
const DEBRIEF_ROOT = '.job-screen .sum-job-take, .job-screen .run-summary';

/**
 * Play the live job to its DEBRIEF, driven by the screen's own `data-phase` rather than by a fixed
 * tap sequence (ticket integrate:r1).
 *
 * Why it is a loop. The old choreography was a straight line — answer, push, wait for the getaway,
 * crack, answer, push, wait for the summary — which is only correct when every answer CLEARS. A
 * missed target is requeued (`requeueReview`), so one miss grows the queue, `targetsLeft` never
 * reaches 0, and every later step lands on the wrong screen; the state then reports `unreached`
 * having measured nothing. `trimJob` now keeps the vault clearable, which removes the usual cause,
 * but a fixed line stays wrong in principle: this loop reaches the debrief for ANY queue, whether
 * its targets clear or miss, and it is bounded so it can never hang the audit.
 *
 * It does not paper over a broken app: every exit is a real control the student has, the bound is
 * generous, and reaching the bound still leaves the root absent, so the `unreached` BLOCKER fires
 * exactly as it should when the debrief genuinely cannot be reached.
 */
async function jobPlayToDebrief(page, { max = 16 } = {}) {
  for (let i = 0; i < max; i++) {
    if (await has(page, DEBRIEF_ROOT)) return true;
    const phase = await jobPhase(page);
    if (phase == null) break;                               // the job screen went away: nothing to drive
    if (phase === 'getaway') {                              // the one all-in: CRACK, never WALK
      await tap(page, '.job-screen .job-crack', { wait: 800 });
      continue;
    }
    if (await has(page, '.job-screen .job-beat:not([hidden])')) {
      // the payout beat — PUSH keeps the pile riding; on the last target it banks free
      await tap(page, '.job-screen .job-push, .job-screen .job-bag', { wait: 900 });
      continue;
    }
    if (await has(page, '.job-screen .job-call')) {         // a sealed envelope: call it and answer
      await jobAnswerOne(page, { clear: true });
      continue;
    }
    if (phase === 'brief') { await tap(page, '.job-screen .job-brief-go, .job-screen .btn-primary', { wait: 700 }); continue; }
    await nap(page, 400);                                   // a beat mid-transition: let it land
  }
  await page.waitForSelector(DEBRIEF_ROOT, { timeout: 20000 }).catch(() => {});
  return has(page, DEBRIEF_ROOT);
}

/** Answer the live job target from its own stored answer. Returns true only if it actually cleared. */
async function jobClearLive(page) {
  const filled = await page.evaluate(async () => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return 0; }
    const ip = s?.inProgress;
    const it = Array.isArray(ip?.queue) ? ip.queue[Math.max(0, ip.idx | 0)] : null;
    if (!it?.id) return 0;
    let card = null;
    try { const m = await import('/data/cards.js'); card = m.byId[it.id] || null; } catch { return 0; }
    if (!card) return 0;                                  // a generated Variant has no bank entry
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
            slot.click();                                  // opens this blank's picker
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
  await submit(page);
  // `.card-continue` appears on a clear AND on a forced solution. card.js stamps each part box
  // (`data-state`): 'ok' on a correct part, 'revealed' on one the solution was shown for.
  const ok = await page.evaluate(() => !!document.querySelector('.card-continue:not([hidden])')
    && !!document.querySelector('.card-parts [data-state="ok"]')
    && !document.querySelector('.card-parts [data-state="revealed"]'));
  if (ok) await tap(page, '.card-continue:not([hidden])', { wait: 500 });
  return ok;
}

/**
 * Cut the drafted queue down to `n` targets and re-enter the job. `state.queueOf` reads
 * `inProgress.queue` directly and `setPhase` flips to the getaway at `targetsLeft === 1`, so a
 * two-target queue reaches the getaway, the vault and a FINISHED debrief after one answer instead
 * of eleven. The store's write is debounced (250 ms), so the save is given time to land first.
 *
 * r1 INTEGRATION FIX — the kept targets are chosen, not sliced. `q.slice(0, n)` took whatever the
 * composer happened to put first, and a drafted queue is a mix of bank cards and GENERATED VARIANTS
 * (`T-cs-lin#1cb4fa`). `jobClearLive` can only clear a bank card — it reads the stored answer out of
 * `data/cards.js` and a variant has no entry there ("a generated Variant has no bank entry") — so
 * whenever the slice put a variant last, the VAULT target could only be missed. A missed target is
 * requeued, the two-target queue grows back to three, `targetsLeft` never reaches 0, and the job
 * never finishes: `job-debrief` ended on the getaway and reported BLOCKER `unreached`.
 *
 * It is a CLOCK-dependent failure, which is why it read as an engine or a flake: `composePage`
 * picks by what is due now, so the identity of `q[1]` changes through the day. The full catalog run
 * of 2026-09-21 passed on every chromium unit and on webkit light, then failed on webkit dark
 * twenty minutes later; re-run in isolation afterwards, chromium AND webkit both failed. Nothing
 * about the app changed between those runs — only which card the composer put second.
 *
 * So: prefer bank-backed targets, in the composer's own order, and top up with whatever is left
 * only if there are not `n` of them. The LAST kept target is the vault, and it is bank-backed
 * whenever the queue holds one at all. `reachable` is reported back so a caller that needs a
 * clearable vault can say so instead of silently mis-choreographing.
 */
async function trimJob(H, page, n) {
  await nap(page, 400);
  // Leave the app FIRST. The store flushes its in-memory save on unload, so editing localStorage
  // under a live page and then navigating writes the untrimmed queue straight back over the edit —
  // which is the same trap `H.setSave` documents ("warm up on a non-app URL first").
  await page.goto(H.base + 'version.js', { waitUntil: 'load' });
  await killServiceWorkers(page);
  const ok = await page.evaluate(async (k) => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return false; }
    const q = s?.inProgress?.queue;
    if (!Array.isArray(q) || q.length <= k) return false;
    let byId = null;
    try { byId = (await import('/data/cards.js')).byId; } catch { byId = null; }
    // Bank-backed first, in queue order; then the rest, in queue order. With no bank to consult
    // this degrades to exactly the old `slice(0, k)`.
    const banked = byId ? q.filter((it) => it && byId[it.id]) : [];
    const rest = byId ? q.filter((it) => !(it && byId[it.id])) : q.slice();
    const kept = [...banked, ...rest].slice(0, k);
    if (kept.length < k) return false;
    s.inProgress.queue = kept;
    if (s.inProgress.idx != null) s.inProgress.idx = 0;
    if (s.inProgress.game && kept[k - 1]?.id) s.inProgress.game.vault = kept[k - 1].id;
    localStorage.setItem('u1a.save', JSON.stringify(s));
    return { clearableVault: !!(byId && byId[kept[k - 1]?.id]), kept: kept.map((it) => it.id) };
  }, n);
  if (!ok) return false;
  await H.gotoRoute(page, '#/run/job');                    // a real load, so the store re-reads it
  await page.waitForSelector('.job-screen', { timeout: 20000 }).catch(() => {});
  await H.waitReady(page);
  return ok;                                               // { clearableVault, kept } — truthy
}

/** Drive the rootcase widget on the live card to 'roots' | 'reject' | 'cases'. */
async function rootcaseTo(page, stage) {
  await cardLive(page);
  if (stage === 'roots') return true;
  const info = await cardInfo(page);
  const roots = info?.parts.find(p => p.type === 'roots');
  if (!roots) return false;
  await typeFields(page, { roots: [].concat(roots.answer ?? []).join(', ') });
  await submit(page);
  await page.waitForSelector('.w-rootcase[data-stage="reject"], .w-rootcase[data-stage="cases"]', { timeout: 8000 }).catch(() => {});
  if (stage === 'reject') return has(page, '.w-rootcase[data-stage="reject"], .w-rootcase[data-stage="cases"]');
  // keep/reject: one verdict per row, then the reason chip — all read from the card's own part
  const rej = info.parts.find(p => p.type === 'reject');
  if (rej && await has(page, '.w-rootcase[data-stage="reject"]')) {
    await page.evaluate(({ valid, reason }) => {
      const norm = (s) => String(s).replace(/[−–—]/g, '-').replace(/\s+/g, '');
      const keep = new Set((valid || []).map(norm));
      for (const row of document.querySelectorAll('.w-rej-row')) {
        const x = norm((row.querySelector('.w-rej-x')?.textContent || '').split('=').pop());
        row.querySelector(`.w-segbtn[data-value="${keep.has(x) ? 'keep' : 'reject'}"]`)?.click();
      }
      if (reason) [...document.querySelectorAll('.w-chips .w-chip')].find(b => b.textContent.trim() === String(reason).trim())?.click();
    }, { valid: rej.valid, reason: rej.reason });
    await submit(page);
    await page.waitForSelector('.w-rootcase[data-stage="cases"]', { timeout: 8000 }).catch(() => {});
  }
  // cases: fill every tab from part.rows so the stage is shown with real measures in it
  const cases = info.parts.find(p => p.type === 'cases');
  if (cases?.rows?.length) {
    await page.evaluate(async (rows) => {
      const norm = (s) => String(s).replace(/[−–—]/g, '-').replace(/\s+/g, '');
      const tabs = [...document.querySelectorAll('.w-rootcase .w-tab')];
      for (const row of rows) {
        const xs = norm(row.x ?? Object.values(row)[0]);
        const tab = tabs.find(t => norm(t.textContent.split('=').pop()) === xs) || tabs.find(t => /another case/i.test(t.textContent));
        tab?.click();
        await new Promise(r => setTimeout(r, 120));
        const panel = document.querySelector('.w-rootcase .w-panel:not([hidden])');
        if (!panel) continue;
        for (const [k, v] of Object.entries(row)) {
          const inp = panel.querySelector(`.w-field[data-key="${k}"] input`);
          if (!inp) continue;
          inp.value = String(v);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }, cases.rows);
    await nap(page, 300);
  }
  return has(page, '.w-rootcase[data-stage="cases"]');
}

/* ================================================================= the catalog */

const SHEETS = ['VOC', 'AP-1', 'AP-2', 'AP-3', 'AP-4', 'DOC', 'WP', 'ASN', 'QZ', 'FAC', 'ALG', 'BONUS'];

/**
 * One card per widget type: [id, cardId, the widget this state is FOR, the card's real parts, extra tags].
 * Read off site/data/cards/*.js — most cards carry more than one part (a skippable equation setup is on
 * nearly every word problem), so the describe names the whole card and the tag names the focus.
 */
const WIDGET_CARDS = [
  ['card-num', 'wp-04', 'num', 'equation + num', ['keyboard']],
  ['card-multi', 'wp-01', 'multi', 'equation + multi', ['keyboard']],
  ['card-equation', 'ang-02', 'equation', 'equation + multi', ['keyboard']],
  ['card-factored', 'fac-01', 'factored', 'factored', ['keyboard']],
  ['card-ratio', 'wp-10', 'ratio', 'equation + ratio', ['keyboard']],
  ['card-pairs', 'ang-wu-1', 'pairs', 'pairs', ['figure', 'wedges']],
  ['card-strip', 'doc-05', 'strip', 'strip', ['figure', 'chips']],
  ['card-asn', 'asn-01', 'asn', 'asn', ['chips']],
  ['card-mc', 'voc-01', 'mc', 'mc + term + termmatch', ['options']],
  ['card-term', 'voc-05', 'term', 'mc + term + termmatch', ['keyboard', 'options']],
  ['card-termmatch', 'voc-09', 'termmatch', 'mc + term + termmatch', ['options']],
  ['card-notation', 'not-03', 'notation', 'notation', ['figure', 'builder']],
  ['card-cloze', 'def-01', 'cloze', 'cloze', ['chips']],
  ['card-classify', 'cls-01', 'classify', 'classify', ['figure', 'options']],
  ['card-multipart', 'ang-05', 'rootcase', 'equation + roots + cases + strip', ['figure', 'stages', 'long']],
];

/**
 * states(h) → the catalog. Order is stable: shells first, then the card in each of its hosts, then the
 * long-tail screens. Each entry is independent — the auditor may run one, a tag, or all of them.
 */
export function states(h) {
  const H = adapt(h);
  const fx = (name) => fixture(H, name);
  const list = [];
  const add = (id, describe, tags, root, prepare, extra = {}) => { list.push({ id, describe, tags, root, media: 'screen', prepare, ...extra }); };

  /* ---------------- Home ---------------- */
  add('home-fresh', 'Today on a first visit: no save at all, CTA is the Warm-up', ['home', 'phone-critical', 'fresh'], '.home',
    async (page) => { await go(H, page, '#/today', { save: null, root: '.home' }); await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 }).catch(() => {}); });

  add('home-midweek', 'Today mid-week: T−6, streak, weak spots, plan strip, skill rail', ['home', 'phone-critical', 'fixture'], '.home',
    async (page) => { await go(H, page, '#/today', { save: await fx('midweek.json'), root: '.home' }); await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 }).catch(() => {}); });

  add('home-after-ace', 'Today straight after an aced placement: provisional Readiness, no weak spots yet', ['home', 'fixture'], '.home',
    async (page) => { await go(H, page, '#/today', { save: await fx('aced.json'), root: '.home' }); await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 }).catch(() => {}); });

  add('home-mock-cta', 'Today with the Mock as the primary CTA (T−3, goal met, no Mock taken yet)', ['home', 'fixture'], '.home-primary[data-kind="mock"]',
    async (page) => { await go(H, page, '#/today', { save: await fx('mock-cta.json'), root: '.home' }); await page.waitForSelector('.home-primary[data-kind="mock"]', { timeout: 15000 }).catch(() => {}); });

  add('home-post-test', 'Today after the test: the countdown is gone, the Binder is the action', ['home', 'fixture', 'post'], '.home',
    async (page) => { await go(H, page, '#/today', { save: await fx('post.json'), root: '.home' }); await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 15000 }).catch(() => {}); });

  /* ---------------- Onboarding + placement ---------------- */
  add('onboard-1-setup', 'Onboarding step 1: test date, time and daily goal', ['onboard', 'phone-critical', 'form'], '.ob-step',
    async (page) => { await go(H, page, '#/onboard', { save: null, root: '.ob-step' }); });

  add('onboard-2-sandbox', 'Onboarding step 2: how it works, with a LIVE sandbox card inside the step', ['onboard', 'card', 'host'], '.ob-step',
    async (page) => { await go(H, page, '#/onboard?step=2', { save: null, root: '.ob-step' }); await cardLive(page); });

  add('onboard-3-intro', 'Onboarding step 3: the placement intro and its cluster list', ['onboard', 'placement'], '.ob-step',
    async (page) => { await go(H, page, '#/onboard?step=3', { save: null, root: '.ob-step' }); });

  add('placement-item-1', 'PLACEMENT item 1 — a card hosted inside .ob-run-stage (where the one-letter-per-line bug was)', ['placement', 'card', 'host', 'phone-critical', 'regression'], '.ob-run .card-screen',
    async (page) => {
      await go(H, page, '#/onboard?step=3', { save: null, root: '.ob-step' });
      await tap(page, '.ob-step button.btn-primary, .ob-step .btn-primary', { wait: 700 });
      await page.waitForSelector('.ob-run .card-screen', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
    });

  add('placement-item-2', 'PLACEMENT item 2 — item 1 answered wrong and continued, so the head shows 2 / 8 with a ✗ tick', ['placement', 'card', 'host', 'regression'], '.ob-run .card-screen',
    async (page) => {
      await go(H, page, '#/onboard?step=3', { save: null, root: '.ob-step' });
      await tap(page, '.ob-step button.btn-primary, .ob-step .btn-primary', { wait: 700 });
      await cardLive(page);
      await missOn(page);
      await tap(page, '.card-continue:not([hidden])', { wait: 900 });
      await cardLive(page);
    });

  add('placement-summary', 'PLACEMENT done: the summary with per-module verdicts and the two ways out', ['placement', 'fixture'], '.ob-step',
    async (page) => { await go(H, page, '#/onboard?step=4', { save: await fx('aced.json'), root: '.ob-step' }); });

  /* ---------------- Binder: every sheet, both views ---------------- */
  for (const s of SHEETS) {
    add(`binder-${s.toLowerCase()}-tiles`, `Binder · ${s} · tiles view (the packet's own numbering)`, ['binder', 'grid', 'fixture'], '.bnd-grid, .bnd-list',
      async (page) => { await go(H, page, `#/binder?sheet=${encodeURIComponent(s)}&view=grid`, { save: await fx('midweek.json'), root: '.binder' }); });
    add(`binder-${s.toLowerCase()}-list`, `Binder · ${s} · list view (stem text, two lines then a clamp)`, ['binder', 'list', 'fixture'], '.bnd-list',
      async (page) => { await go(H, page, `#/binder?sheet=${encodeURIComponent(s)}&view=list`, { save: await fx('midweek.json'), root: '.binder' }); await page.waitForSelector('.bnd-list', { timeout: 15000 }).catch(() => {}); });
  }

  add('binder-tile-sheet', 'Binder long-press panel: the Foil rule, this card\'s history and Infinite practice', ['binder', 'overlay', 'fixture'], '.bnd-pop',
    async (page) => {
      await go(H, page, '#/binder?sheet=VOC&view=grid', { save: await fx('midweek.json'), root: '.binder' });
      await page.evaluate(() => {
        const t = document.querySelector('.tile[data-rarity="gold"], .tile[data-rarity="silver"], .tile[data-rarity="bronze"], .tile');
        t?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      });
      await page.waitForSelector('.bnd-pop', { timeout: 8000 }).catch(() => {});
      await nap(page, 350);
    });

  add('binder-tile-sheet-family', 'Binder long-press panel on a FAMILY tile: Gold Variants, not a card history', ['binder', 'overlay', 'fixture'], '.bnd-pop',
    async (page) => {
      await go(H, page, '#/binder?sheet=ALG&view=grid', { save: await fx('midweek.json'), root: '.binder' });
      await page.evaluate(() => {
        const t = document.querySelector('.tile[data-fam="true"]') || document.querySelector('.tile');
        t?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      });
      await page.waitForSelector('.bnd-pop', { timeout: 8000 }).catch(() => {});
      await nap(page, 350);
    });

  /* ---------------- The Card: one per widget type ---------------- */
  for (const [id, cardId, type, parts, extra] of WIDGET_CARDS) {
    add(id, `#/card/${cardId} on its own card screen — for the ${type} widget (the card's parts: ${parts})`, ['card', 'widget', `w:${type}`, ...extra], '.card-screen',
      async (page) => { await go(H, page, `#/card/${cardId}`, { save: await fx('midweek.json'), root: '.card-screen' }); await cardLive(page); });
  }

  /* rootcase: the three progressive stages of ang-10 (the student's own bug card) */
  add('card-rootcase-roots', '#/card/ang-10 — rootcase stage 1 of 3 (Solve), 4 parts draining, figure', ['card', 'widget', 'w:rootcase', 'figure', 'stages', 'long'], '.w-rootcase[data-stage="roots"]',
    async (page) => { await go(H, page, '#/card/ang-10', { save: await fx('midweek.json'), root: '.card-screen' }); await rootcaseTo(page, 'roots'); });

  add('card-rootcase-reject', '#/card/ang-10 — rootcase stage 2 (Keep or reject): verdict rows + reason chips', ['card', 'widget', 'w:rootcase', 'figure', 'stages'], '.w-rootcase[data-stage="reject"]',
    async (page) => { await go(H, page, '#/card/ang-10', { save: await fx('midweek.json'), root: '.card-screen' }); await rootcaseTo(page, 'reject'); });

  add('card-rootcase-cases', '#/card/ang-10 — rootcase stage 3 (Cases): one tab per root, filled measures', ['card', 'widget', 'w:rootcase', 'figure', 'stages', 'tabs'], '.w-rootcase[data-stage="cases"]',
    async (page) => { await go(H, page, '#/card/ang-10', { save: await fx('midweek.json'), root: '.card-screen' }); await rootcaseTo(page, 'cases'); });

  /* the four answer states, on two different cards (a typed num and a two-field multi) */
  for (const [cardId, label] of [['wp-04', 'num'], ['wp-01', 'multi']]) {
    // the root is the MARKED FIELD, not the screen: a state whose point is the wrong-answer line must fail
    // the self-test if the answer never landed, instead of quietly auditing an untouched card
    add(`card-${cardId}-wrong`, `#/card/${cardId} — one wrong answer: the one-line teaching, field marked`, ['card', 'answer', 'wrong', `w:${label}`], '.card-parts .w-field[data-state="bad"], .card-parts [data-state="bad"]',
      async (page) => {
        await go(H, page, `#/card/${cardId}`, { save: await fx('midweek.json'), root: '.card-screen' });
        await cardLive(page);
        await attemptWrong(page, await cardInfo(page));
        await submit(page);
      });

    add(`card-${cardId}-hint`, `#/card/${cardId} — two hints open in the ladder (XP quality, never an attempt)`, ['card', 'answer', 'hint', `w:${label}`], '.hint-list li',
      async (page) => {
        await go(H, page, `#/card/${cardId}`, { save: await fx('midweek.json'), root: '.card-screen' });
        await cardLive(page);
        await tap(page, '.card-hint-btn, .card-dock-hint', { wait: 350 });
        await tap(page, '.card-hint-btn, .card-dock-hint', { wait: 350 });
      });

    add(`card-${cardId}-solution`, `#/card/${cardId} — three misses: the forced worked solution + Bronze strip`, ['card', 'answer', 'solution', 'long', `w:${label}`], '.card-solution',
      async (page) => {
        await go(H, page, `#/card/${cardId}`, { save: await fx('midweek.json'), root: '.card-screen' });
        await cardLive(page);
        const info = await cardInfo(page);
        for (let i = 0; i < 3; i++) { await attemptWrong(page, info, i); if (!(await submit(page))) break; }
        await page.waitForSelector('.card-solution:not([hidden])', { timeout: 8000 }).catch(() => {});
        await nap(page, 300);
      });

    add(`card-${cardId}-cleared`, `#/card/${cardId} — cleared: the result strip (rarity, XP, par) and Continue`, ['card', 'answer', 'cleared', 'result-strip', `w:${label}`], '.card-result',
      async (page) => {
        await go(H, page, `#/card/${cardId}`, { save: await fx('midweek.json'), root: '.card-screen' });
        await cardLive(page);
        const info = await cardInfo(page);
        await typeFields(page, answersOf(info));
        await submit(page);
        await page.waitForSelector('.card-result:not([hidden])', { timeout: 8000 }).catch(() => {});
        await nap(page, 300);
      });
  }

  /* ---------------- Variants ---------------- */
  for (const [tpl, seed, note, tags] of [
    ['T-cs-lin', 'audit-lin', 'a generated linear complement/supplement problem', ['keyboard']],
    ['T-factor-a2', 'audit-fac', 'a generated a≠1 factoring problem', ['keyboard']],
    ['T-fig-pairs', 'audit-fig', 'a generated figure problem (redrawn SVG + wedges)', ['figure', 'wedges']],
  ]) {
    add(`variant-${tpl.replace(/^T-/, '')}`, `#/variant/${tpl} — ${note}`, ['card', 'variant', ...tags], '.card-screen',
      async (page) => { await go(H, page, `#/variant/${tpl}?seed=${seed}`, { save: await fx('midweek.json'), root: '.card-screen' }); await cardLive(page); });
  }

  /* ---------------- Runs ---------------- */
  add('run-page-item-1', "Today's Page, item 1 of 17 — a card hosted inside .run-stage with the run head above", ['run', 'card', 'host', 'phone-critical', 'fixture'], '.run-screen .card-screen',
    async (page) => { await go(H, page, '#/run/page', { save: await fx('page-open.json'), root: '.run-screen' }); await cardLive(page); });

  // the root pins the progress bar to 4-of-N: if the fixture ever stops landing mid-page, this state fails
  // loudly instead of silently auditing item 1 twice
  add('run-page-mid', "Today's Page mid-run (4 done): progress bar part-filled, review chips on the card", ['run', 'card', 'host', 'fixture'], '.run-screen .run-progress[aria-valuenow="4"]',
    async (page) => { await go(H, page, '#/run/page', { save: await fx('page-mid.json'), root: '.run-screen' }); await cardLive(page); });

  add('run-page-summary', "Today's Page Summary: XP hero, rarity histogram, minted tiles incl. a family tile, skill bars", ['run', 'summary', 'mint', 'long', 'fixture'], '.run-summary',
    async (page) => { await go(H, page, '#/run/page', { save: await fx('page-done.json'), root: '.run-summary', wait: 2200 }); });

  add('run-blitz-m1', 'BLITZ · M1 running: 60 s clock, score, strikes, tap answers (the clock is live)', ['run', 'blitz', 'timed', 'fixture'], '.run-screen.blitz',
    async (page) => { await go(H, page, '#/run/blitz/M1', { save: await fx('midweek.json'), root: '.run-screen.blitz' }); await page.waitForSelector('.blitz-answers button, .blitz-answers input', { timeout: 15000 }).catch(() => {}); });

  add('run-drill-cs-lin', 'Drill 5 · CS-LIN: five generated Variants of one weak skill', ['run', 'card', 'host', 'fixture'], '.run-screen .card-screen',
    async (page) => { await go(H, page, '#/run/drill/CS-LIN', { save: await fx('midweek.json'), root: '.run-screen' }); await cardLive(page); });

  add('run-jump-m10', 'JUMP HERE · M10: the 10-item placement run for one module (no hints)', ['run', 'card', 'host', 'placement', 'fixture'], '.ob-run, .run-screen',
    async (page) => { await go(H, page, '#/run/jump/M10', { save: await fx('midweek.json'), root: '.ob-run, .run-screen' }); await cardLive(page); });

  add('run-full36', 'Full 36: every Always / Sometimes / Never statement, reason chips on each', ['run', 'card', 'host', 'chips', 'fixture'], '.run-screen .card-screen',
    async (page) => { await go(H, page, '#/run/full36', { save: await fx('midweek.json'), root: '.run-screen' }); await cardLive(page); });

  add('run-missed', 'Missed originals: the loop of everything not answered first try', ['run', 'card', 'host', 'fixture'], '.run-screen .card-screen',
    async (page) => { await go(H, page, '#/run/missed', { save: await fx('midweek.json'), root: '.run-screen' }); await cardLive(page); });

  add('run-upgrade', 'Upgrade run: every Bronze/Silver original, hints off, first try only', ['run', 'card', 'host', 'fixture'], '.run-screen .card-screen',
    async (page) => { await go(H, page, '#/run/upgrade', { save: await fx('midweek.json'), root: '.run-screen' }); await cardLive(page); });

  /* ---------------- THE JOB (J6) — the game layer's one screen ----------------
     Added by ticket J6 (COMPOSED-GAME G8): `node qa/layout-audit.mjs --only job` is one of that
     ticket's acceptance criteria, and a criterion with no state in this catalog cannot be measured.
     Additive only — nothing above or below is touched. See notes/J6.md → Requests (AUDIT-STATES). */
  add('job-board', "THE JOB · the board: five contracts, the guard's published odds, the token press", ['job', 'game', 'phone-critical', 'fixture'], '.job-screen[data-phase="board"] .job-contracts',
    async (page) => {
      await go(H, page, '#/run/job', { save: await fx('midweek.json'), root: '.job-screen' });
      await page.waitForSelector('.job-screen .job-contracts li', { timeout: 20000 }).catch(() => {});
      await nap(page, 300);
    });

  add('job-envelope', 'THE JOB · the SEALED envelope and the call row — the stem is not in the DOM yet', ['job', 'game', 'phone-critical', 'regression', 'fixture'], '.job-screen .job-envelope .job-calls',
    async (page) => {
      await go(H, page, '#/run/job', { save: await fx('midweek.json'), root: '.job-screen' });
      await page.waitForSelector('.job-screen .job-primary', { timeout: 20000 }).catch(() => {});
      await tap(page, '.job-screen .job-primary', { wait: 700 });
      await page.waitForSelector('.job-screen .job-envelope', { timeout: 20000 }).catch(() => {});
      await nap(page, 300);
    });

  // The regression state: a card hosted inside a NEW container, with the board collapsed above it.
  // This is the shape that printed one letter per line in the placement (notes/LAYOUT-ROOT.md).
  add('job-answer', 'THE JOB · a stem live inside the job stage, board collapsed to one 36 px line', ['job', 'game', 'card', 'host', 'phone-critical', 'regression', 'fixture'], '.job-screen .card-screen',
    async (page) => {
      await go(H, page, '#/run/job', { save: await fx('midweek.json'), root: '.job-screen' });
      await page.waitForSelector('.job-screen .job-primary', { timeout: 20000 }).catch(() => {});
      await tap(page, '.job-screen .job-primary', { wait: 700 });
      await page.waitForSelector('.job-screen .job-call', { timeout: 20000 }).catch(() => {});
      await tap(page, '.job-screen .job-call[data-call="70"], .job-screen .job-call', { wait: 700 });
      await cardLive(page);
    });

  add('job-payout', 'THE JOB · the payout beat: the line, the chain ticks and BAG / PUSH under the card', ['job', 'game', 'card', 'host', 'fixture'], '.job-screen .job-beat:not([hidden])',
    async (page) => {
      await jobToEnvelope(H, page);
      await jobAnswerOne(page);
      await nap(page, 300);
    });

  /* The keyboard-open phone. J6's acceptance is "a full 10-target job at 375×667 WITH THE KEYBOARD
     OPEN, no horizontal scroll", and until this landed the layout net measured neither half of it:
     no job state pinned `data-kb`, and VP_ALL's shortest phone row is 568 px tall. `vps` gives these
     two states the height an open keyboard actually leaves (layout-safari finding 4). */
  add('job-answer-kb', 'THE JOB · the stem and the Answer Dock with the on-screen keyboard open — J6\'s own acceptance configuration', ['job', 'game', 'card', 'host', 'dock', 'keyboard', 'phone-critical', 'fixture'], '.job-screen .card-screen',
    async (page) => {
      await jobToEnvelope(H, page);
      await jobLockCall(page);
      await cardLive(page);
      await pinKeyboard(page);
      await nap(page, 300);
    }, { vps: VP_KB });

  add('job-payout-kb', 'THE JOB · the payout beat and BAG / PUSH with the on-screen keyboard open', ['job', 'game', 'card', 'host', 'dock', 'keyboard', 'phone-critical', 'fixture'], '.job-screen .job-beat:not([hidden])',
    async (page) => {
      await jobToEnvelope(H, page);
      await jobAnswerOne(page);
      await pinKeyboard(page);
      await nap(page, 300);
    }, { vps: VP_KB });

  /* The three beats that had no state at all until fix:tests r1 (layout-safari finding 5): the
     brief window, the getaway and the vault target. Each is a decision G1 counts, each is drawn by
     `screens/job.js` and by nothing else, and none of them was measured by any detector at any
     viewport in either engine. */
  add('job-brief', 'THE JOB · the brief window: guard bars, the token press, the crew re-rank and the walk-away minute', ['job', 'game', 'phone-critical', 'long', 'fixture'], '.job-screen .job-brief',
    async (page) => {
      await jobToEnvelope(H, page);
      for (let i = 0; i < 6; i++) {
        if (await has(page, '.job-screen .job-brief')) break;
        if (!(await jobAnswerOne(page))) break;
        await tap(page, '.job-screen .job-push', { wait: 800 });
      }
      await page.waitForSelector('.job-screen .job-brief', { timeout: 20000 }).catch(() => {});
      await nap(page, 300);
    });

  add('job-getaway', "THE JOB · the getaway: the job's one all-in, CRACK against WALK, with what each banks", ['job', 'game', 'phone-critical', 'fixture'], '.job-screen .job-getaway',
    async (page) => {
      await jobToEnvelope(H, page);
      await trimJob(H, page, 2);
      await jobAnswerOne(page);
      await tap(page, '.job-screen .job-push', { wait: 800 });
      await page.waitForSelector('.job-screen .job-getaway', { timeout: 20000 }).catch(() => {});
      await nap(page, 300);
    });

  add('job-vault', 'THE JOB · the vault target: the last envelope, opened with the whole pile riding on it', ['job', 'game', 'phone-critical', 'fixture'], '.job-screen .job-envelope .job-calls',
    async (page) => {
      await jobToEnvelope(H, page);
      await trimJob(H, page, 2);
      await jobAnswerOne(page);
      await tap(page, '.job-screen .job-push', { wait: 800 });
      await page.waitForSelector('.job-screen .job-getaway', { timeout: 20000 }).catch(() => {});
      await tap(page, '.job-screen .job-crack', { wait: 800 });
      await page.waitForSelector('.job-screen .job-envelope .job-calls', { timeout: 20000 }).catch(() => {});
      await nap(page, 300);
    });

  /* Added at integration: `screens/job.js renderDebrief` now mounts `run.js`'s Page Summary (G7,
     notes/J6b.md R1) instead of a placeholder panel, so the debrief is a REAL screen with blocks
     nothing else in this catalog draws — the take, the two regret lines, the guard redraw and the
     Fault Index deltas. `run-page-summary` covers the shared half; this covers the job half.
     THE QUIT DEBRIEF IS NOT THE DEBRIEF (ticket fix:tests r1, layout-safari finding 3). Walking out
     after one target reaches a Page Summary that says "Left mid-job · 0 of 11 · 0 XP this run" and
     draws NONE of the blocks this state's describe used to promise: no `sum-regret`, no `sum-mint`
     / `sum-tiles`, no `sum-hist`, no `sum-bars`, no `sum-bag-bonus`. Those live on a job that
     FINISHED. So the walk-out keeps its own state under its own name, and `job-debrief` now plays a
     two-target job to the end — which is what the catalog's preamble means by opening the same
     components through every host they live in. */
  add('job-debrief-quit', 'THE JOB · the QUIT debrief: the Page Summary of a job walked out of mid-run — no take, no mint, no bars', ['job', 'game', 'summary', 'fixture'], '.job-screen .sum-job-take, .job-screen .run-summary',
    async (page) => {
      await jobToEnvelope(H, page);
      await jobAnswerOne(page);
      await tap(page, '.job-screen .run-quit', { wait: 400 });
      await tap(page, '.job-screen .job-quit-bag', { wait: 900 });
      await page.waitForSelector('.job-screen .sum-job-take, .job-screen .run-summary', { timeout: 20000 }).catch(() => {});
      await nap(page, 700);                      // the bag drop is 600 ms; measure it settled
    });

  add('job-debrief', 'THE JOB · the debrief of a FINISHED job: the take, the regret lines, the tile mint, the rung histogram, the skill bars and the guard redraw', ['job', 'game', 'summary', 'mint', 'long', 'fixture'], '.job-screen .sum-job-take, .job-screen .run-summary',
    async (page) => {
      await jobToEnvelope(H, page);
      await trimJob(H, page, 2);                 // keeps a CLEARABLE vault — see trimJob's note
      // Phase-driven, not a fixed tap sequence: one missed target is requeued and every later step
      // of a straight line then lands on the wrong screen (integrate:r1 — this state was reporting
      // BLOCKER `unreached` whenever the composer's clock put a generated Variant on the vault).
      await jobPlayToDebrief(page);
      await nap(page, 700);                      // the bag drop is 600 ms; measure it settled
    });

  add('run-baseline', 'Baseline: the 10-item mini-mock under Mock rules (delegated to the Mock engine)', ['run', 'mock', 'fixture'], '.mock-screen, .run-screen',
    async (page) => { await go(H, page, '#/run/baseline', { save: await fx('aced.json'), root: '.mock-screen, .run-screen' }); });

  add('run-night', 'Night Before (T−1): thirty minutes, four blocks, every door open', ['run', 'night', 'fixture'], '.nb-intro, .run-screen',
    async (page) => { await go(H, page, '#/night', { save: await fx('night.json'), root: '.nb-intro, .run-screen' }); });

  add('run-morning', 'Test Morning (T−0): five minutes of things you already know, then Go', ['run', 'morning', 'fixture'], '.tm-intro, .run-screen',
    async (page) => { await go(H, page, '#/morning', { save: await fx('morning.json'), root: '.tm-intro, .run-screen' }); });

  add('run-post-test', 'After the test: enter the real score; the Binder, Bosses and Mock stay open', ['run', 'post', 'fixture'], '.pt, .run-screen',
    async (page) => { await go(H, page, '#/run/post', { save: await fx('post.json'), root: '.pt, .run-screen' }); });

  /* ---------------- Boss ---------------- */
  add('boss-b4-intro', 'Boss B4 intro panel: the rules, the seed and the way in', ['boss', 'fixture'], '.boss-screen',
    async (page) => { await go(H, page, '#/boss/B4', { save: await fx('midweek.json'), root: '.boss-screen' }); await nap(page, 400); });

  add('boss-b4-mid-run', 'Boss B4 mid-run: 3 hearts, item counter, a card hosted inside .boss-stage', ['boss', 'card', 'host', 'phone-critical', 'fixture'], '.boss-screen[data-phase="run"] .card-screen',
    async (page) => {
      await go(H, page, '#/boss/B4?start=1', { save: await fx('midweek.json'), root: '.boss-screen' });
      await page.waitForSelector('.boss-screen[data-phase="run"]', { timeout: 20000 }).catch(() => {});
      await cardLive(page);
    });

  add('boss-b4-heart-lost', 'Boss B4 after wrong answers: the heart-lost line, and CONTINUE? once the hearts are gone', ['boss', 'card', 'host', 'wrong', 'fixture'], '.boss-miss:not([hidden]), .boss-continue',
    async (page) => {
      await go(H, page, '#/boss/B4?start=1', { save: await fx('midweek.json'), root: '.boss-screen' });
      await page.waitForSelector('.boss-screen[data-phase="run"]', { timeout: 20000 }).catch(() => {});
      for (let item = 0; item < 4; item++) {
        await cardLive(page);
        if (await has(page, '.boss-continue')) break;
        if (await missOn(page, { boss: true }) === 'continue') break;
        if (!(await tap(page, '.card-continue:not([hidden])', { wait: 700 }))) break;
      }
      await nap(page, 400);
    });

  /**
   * THE MISS STRIP INSIDE THE DOCK — the three states notes/FIX-qa.md asked for ("it needs a state").
   * `boss-b4-heart-lost` above walks the whole boss until the hearts are gone, so it settles on
   * `.boss-continue` and the probe never saw `#dock .boss-miss` at all: the dock's collapsed miss row
   * (polish.css "mock r2", the `:root[data-kb="open"]` and `@media (max-height: 520px)` copies) was
   * audited by nothing. These stop at the FIRST miss instead, with the card — and therefore the dock —
   * still mounted, in both of the strip's shapes: heart lost (a "Drill 5" link) and the empty equation
   * setup (a "Skip the setup" button).
   *
   * The `-kb` state models an OS keyboard: only while the viewport is phone-sized, and re-applied
   * after every resize, because the app's own keyboardInset() watcher rewrites the attribute on
   * every visualViewport resize and would otherwise wipe it the moment the auditor changed size.
   * Pinning it at every width would invent a configuration (a 2560 px desktop with an on-screen
   * keyboard) that no student can reach.
   *
   * ROUND 3 (layout-safari). It used to set `data-kb="open"` and NOTHING ELSE — never `--kb` — so
   * every dock's `transform: translateY(calc(-1 * var(--kb)))` (css/widgets.css:477) and every
   * `bottom: calc(… + var(--kb))` resolved to 0: the page was STYLED keyboard-open while nothing was
   * actually lifted, which is a state no device produces and the exact state in which a dock cannot
   * be caught sitting under the keys. It now does what the platform does — shrink the VISUAL
   * viewport — and publishes `--kb` beside `data-kb`, so what the auditor measures is a real
   * configuration and `pageDetect`'s fold (the visual viewport, since round 3) is the band the
   * student can see.
   */
  const pinKeyboard = async (page, KB = KB_PX) => {
    /* A keyboard is opened by FOCUSING a field, and the app answers that focus with
       `widgets/base.js keepVisible()`, which scrolls the field back above the keyboard and the dock.
       Pinning the inset without the focus would invent a state no student sits in — keys up, nothing
       focused, nothing scrolled — and every "behind the dock" finding it produced would be an
       artefact of the harness rather than a defect of the page. So the focus comes first. */
    await page.evaluate(() => {
      const f = [...document.querySelectorAll('.card-parts input:not([type="hidden"]), .card-parts textarea')]
        .find((e) => !e.disabled && !e.readOnly && e.getClientRects().length);
      if (f) { f.focus(); f.dispatchEvent(new Event('focus', { bubbles: true })); }
      return !!f;
    });
    return page.evaluate((KB2) => {
    const root = document.documentElement;
    const phone = () => innerWidth <= 480;
    const KB = KB2;
    const vv = window.visualViewport;
    /* the VISUAL viewport shrinks and the LAYOUT viewport does not — the one asymmetry that makes a
       keyboard a keyboard. Patched once; the getters fall through to the real ones off phone. */
    if (vv && !vv.__kbPinned) {
      const proto = Object.getPrototypeOf(vv);
      const realH = Object.getOwnPropertyDescriptor(proto, 'height')?.get;
      if (realH) {
        Object.defineProperty(vv, '__kbPinned', { value: true });
        Object.defineProperty(vv, 'height', {
          configurable: true,
          get() { const h = realH.call(this); return phone() ? Math.max(120, h - KB) : h; },
        });
      }
    }
    const pin = () => {
      const inset = phone() ? KB : 0;
      const want = inset > 80 ? 'open' : 'closed';
      const wantPx = inset + 'px';
      if (root.style.getPropertyValue('--kb') !== wantPx) root.style.setProperty('--kb', wantPx);
      if (root.dataset.kb !== want) root.dataset.kb = want;
    };
    new MutationObserver(pin).observe(root, { attributes: true, attributeFilter: ['data-kb', 'style'] });
    addEventListener('resize', pin);
    vv?.addEventListener('resize', pin);
    pin();
    /* …and let the app's own `keepVisible` answer, exactly as it does on a phone: the focused field
       is scrolled back above the keyboard by the page, not by this harness. */
    document.activeElement?.dispatchEvent?.(new Event('focus', { bubbles: true }));
    }, KB);
  };
  /** Boss B4 at its first miss, card still mounted so the strip is re-homed into the dock. */
  async function bossFirstMiss(page, { setup = false } = {}) {
    await go(H, page, '#/boss/B4?start=1', { save: await fx('midweek.json'), root: '.boss-screen' });
    await page.waitForSelector('.boss-screen[data-phase="run"]', { timeout: 20000 }).catch(() => {});
    await cardLive(page);
    const info = await cardInfo(page);
    for (let i = 0; i < 4; i++) {
      // The empty-setup miss comes free: B4's equation box blocks the answer, so the FIRST bare Submit
      // is the `is-setup` strip. For the heart-lost strip, skip past it and then answer wrong.
      if (setup) await submit(page);
      else {
        if (await has(page, '.boss-miss.is-setup:not([hidden])')) await tap(page, '.boss-skip-setup', { wait: 400 });
        await attemptWrong(page, info, i);
        await submit(page);
      }
      const done = await page.evaluate((wantSetup) => {
        const e = document.querySelector('#dock .boss-miss');
        if (!e || e.hasAttribute('hidden') || !e.getClientRects().length) return false;
        return wantSetup === e.classList.contains('is-setup');
      }, setup);
      if (done) break;
    }
    await nap(page, 400);
  }

  add('boss-b4-miss-dock', 'Boss B4, first heart lost: the miss strip re-homed into the dock above Submit ("Drill 5")', ['boss', 'card', 'host', 'dock', 'wrong', 'fixture'], '#dock .boss-miss:not([hidden])',
    async (page) => { await bossFirstMiss(page); });

  add('boss-b4-miss-dock-kb', 'The same dock miss strip with the on-screen keyboard open: the collapsed one-row form', ['boss', 'card', 'host', 'dock', 'wrong', 'keyboard', 'fixture'], '#dock .boss-miss:not([hidden])',
    async (page) => { await bossFirstMiss(page); await pinKeyboard(page); });

  add('boss-b4-miss-setup-kb', 'Boss B4 submitted with the equation setup empty: the amber strip and "Skip the setup", keyboard open', ['boss', 'card', 'host', 'dock', 'wrong', 'keyboard', 'fixture'], '#dock .boss-miss.is-setup:not([hidden])',
    async (page) => { await bossFirstMiss(page, { setup: true }); await pinKeyboard(page); });

  /* ---------------- Mock + report ---------------- */
  add('mock-rules', 'Mock rules page: what it costs, what it gives, and the score prediction', ['mock', 'phone-critical', 'fixture'], '.mock-screen[data-phase="rules"]',
    async (page) => { await go(H, page, '#/mock', { save: await fx('midweek.json'), root: '.mock-screen' }); });

  add('mock-mid', 'Mid-mock: live clock, question 4 of 20, nav row, a card hosted inside the mock body', ['mock', 'card', 'host', 'timed', 'fixture'], '.mock-screen[data-phase="run"]',
    async (page) => { await resumeMock(H, page); });

  add('mock-mid-map', 'Mid-mock with the question map open (the overlay that has to fit a phone)', ['mock', 'overlay', 'timed', 'fixture'], '.mock-map[aria-hidden="false"], .mock-screen[data-map="open"], .mock-map',
    async (page) => {
      await resumeMock(H, page);
      await tap(page, '.mock-mapbtn', { wait: 500 });
      await page.waitForFunction(() => document.querySelector('.mock-mapbtn')?.getAttribute('aria-expanded') === 'true', { timeout: 6000 }).catch(() => {});
      await nap(page, 250);
    });

  add('mock-report', 'Mock report #1 (70/100): score hero, calibration, per-skill table, every question', ['report', 'table', 'long', 'fixture'], '.report-screen',
    async (page) => { await go(H, page, '#/mock/report/1', { save: await fx('mock-done.json'), root: '.report-screen', wait: 400 }); });

  add('mock-report-expanded', 'Mock report with one missed item expanded: your answer, the scratch, the worked solution', ['report', 'long', 'fixture'], '.report-item-h[aria-expanded="true"]',
    async (page) => {
      await go(H, page, '#/mock/report/1', { save: await fx('mock-done.json'), root: '.report-screen' });
      await page.evaluate(() => {
        const items = [...document.querySelectorAll('.report-item-h')];
        (items.find(b => /✗|miss|0\b/.test(b.innerText)) || items[items.length - 1] || items[0])?.click();
      });
      await nap(page, 450);
      await page.evaluate(() => document.querySelector('.report-item-h[aria-expanded="true"]')?.scrollIntoView({ block: 'center' }));
      await nap(page, 250);
    });

  /* ---------------- Stats · Sheet · Settings ---------------- */
  add('stats', 'Stats mid-week: readiness history, per-skill mastery, run log, coverage tables', ['stats', 'table', 'long', 'fixture'], '.stats',
    async (page) => { await go(H, page, '#/stats', { save: await fx('midweek.json'), root: '.stats', wait: 400 }); });

  add('sheet', 'The cheat sheet you can\'t bring: your own lines plus the fixed ones', ['sheet', 'long', 'fixture'], '.sh',
    async (page) => { await go(H, page, '#/sheet', { save: await fx('midweek.json'), root: '.sh' }); });

  add('sheet-print', 'The cheat sheet under @media print (emulated): one page, no chrome', ['sheet', 'print', 'long', 'fixture'], '.sh',
    async (page) => { await go(H, page, '#/sheet', { save: await fx('midweek.json'), root: '.sh', media: 'print' }); }, { media: 'print' });

  add('settings', 'Settings: test date, goal, theme, sound, readiness formula, danger zone', ['settings', 'form', 'long', 'fixture'], '.settings',
    async (page) => { await go(H, page, '#/settings', { save: await fx('midweek.json'), root: '.settings', wait: 400 }); });

  add('settings-export', 'Settings scrolled to the export box: the whole save as JSON in a textarea', ['settings', 'form', 'long', 'fixture'], '#set-export',
    async (page) => {
      await go(H, page, '#/settings', { save: await fx('midweek.json'), root: '.settings', wait: 400 });
      await page.evaluate(() => document.querySelector('#set-export')?.scrollIntoView({ block: 'center' }));
      await nap(page, 350);
    });

  return list;
}

export default states;
