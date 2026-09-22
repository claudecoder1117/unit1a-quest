// qa/job-clock.mjs — J8's measured acceptance, in a real browser. Dev-only; nothing under site/
// imports it, and it is never part of the deployed artifact.
//
//   node qa/job-clock.mjs                      # chromium, the default JOB shape
//   node qa/job-clock.mjs --engines chromium,webkit
//   node qa/job-clock.mjs --hold 4000          # how long the hidden tab stays hidden (ms)
//   node qa/job-clock.mjs --realtime           # spend the published answer seconds (~13 min): the
//                                              # only mode where board-vs-debrief is a hard check
//   node qa/job-clock.mjs --trace              # one line per beat
//   node qa/job-clock.mjs --keep               # leave the browser open on a failure
//
// `tests/job-split.test.mjs` proves the arithmetic against a scripted clock; this file proves the
// two things a scripted clock cannot:
//
//   1. **The accumulators are real wall clock.** The walk parks on a phase for a measured number of
//      milliseconds and the phase's accumulator has to grow by the same number (±120 ms of browser
//      scheduling), so `tGame`/`tAnswer` are `Date.now()` deltas and not tick counts.
//   2. **They survive a visibilitychange.** The page is hidden, the save is flushed by `store.js`'s
//      own `visibilitychange` handler, the tab is reloaded mid-job, and the job resumes: both
//      accumulators must come back byte-identical and the hidden interval must land in the phase
//      that was live, because the delta is `now − phaseAt` and hiding a tab does not move either.
//   3. **The split the board printed BEFORE the job and the split the debrief printed after it
//      agree within 5 points**, read off the rendered DOM of both surfaces — not off the save.
//   4. **The debrief prints the decision count and 0 ms idle.**
//   5. **0 ms of any state where the app is neither accepting input nor showing a result**, measured
//      by sampling the live DOM at every beat: a beat with no enabled control AND no result node is
//      dead time, and its wall clock is accumulated.
//
// Nothing here writes to the save. Every number is read from the rendered page or from
// `localStorage` exactly as the app left it.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUILDERS, FIX_DIR, buildAll, freshen } from './fixtures/audit-build.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const ENGINES_BY_NAME = { chromium, webkit };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(__dirname, '..', 'site');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const ENGINES = opt('engines', 'chromium').split(',').filter(Boolean);
const HOLD_MS = Number(opt('hold', 4000));
const TOLERANCE_MS = 120;               // browser scheduling slack on a parked phase
/**
 * `--realtime` makes the walk spend the seconds G1 publishes — `LIMITS.minutesPerTier` on every
 * stem AND `DECISION_SECONDS` on every call and payout beat. Pacing only one side is worse than
 * pacing neither: a walk that parks 30 s on a stem and 0 s on the call row measures a 2 % split.
 * It is the only mode in which board-vs-debrief is a statement about a STUDENT, and it costs the
 * shape's own wall clock — about 18 minutes for an 11-target JOB.
 */
const REALTIME = flag('realtime');

/* `site/data/job.js` is data-only and DOM-free by its own house rules, so the harness imports the
   shipped constants rather than re-typing or regexing them. */
const JOB_DATA = await import(pathToFileURL(path.join(SITE, 'data', 'job.js')).href);
const { DECISION_SECONDS, DECISION_PARTS_T1, ANSWER_MINUTES_PER_TIER, SPLIT } = JOB_DATA;
const AGREE_POINTS = SPLIT.agreeWithinPoints;

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

/** The live record, straight out of the save the app just wrote. */
const PROBE_CLOCK = () => {
  try {
    const s = JSON.parse(localStorage.getItem('u1a.save'));
    const g = s?.inProgress?.game ?? null;
    const last = (s?.game?.log ?? []).slice(-1)[0] ?? null;
    return {
      phase: g?.phase ?? null, phaseAt: g?.phaseAt ?? null,
      tGame: g?.tGame ?? null, tAnswer: g?.tAnswer ?? null,
      ph: g ? { ...g.ph } : null,
      idx: s?.inProgress?.idx ?? null, of: s?.inProgress?.queue?.length ?? null,
      log: last, means: s?.game?.ledger?.phaseMeans ?? null,
      domPhase: document.querySelector('.job-screen')?.dataset.phase ?? null,
    };
  } catch (e) { return { error: String(e) }; }
};

/**
 * Is this beat accepting input, or showing a result? Anything else is DEAD TIME.
 *   · input  — an enabled, visible, focusable control anywhere in the screen
 *   · result — a payout line, a debrief, a guard reveal, the worked solution: something to read
 */
const PROBE_ALIVE = () => {
  const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  const controls = [...document.querySelectorAll('.job-screen button, .job-screen a[href], .job-screen input, .job-screen select, .job-screen textarea, .job-screen [tabindex]')]
    .filter((el) => vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
  const results = [...document.querySelectorAll('.job-payout, .job-debrief, .job-guard, .job-getaway, .card-solution, .card-continue, .sum-job-take, .job-beat')]
    .filter(vis);
  return {
    input: controls.length, result: results.length,
    alive: controls.length > 0 || results.length > 0,
    phase: document.querySelector('.job-screen')?.dataset.phase ?? null,
  };
};

/** Every printed percentage on the board, and the primary button's own line. */
const PROBE_BOARD_SPLIT = () => {
  const text = (sel) => document.querySelector(sel)?.textContent ?? '';
  const all = (document.querySelector('.job-screen')?.textContent ?? '').replace(/\s+/g, ' ');
  const pct = [...all.matchAll(/(\d+(?:\.\d+)?)\s*%\s*game/g)].map((m) => Number(m[1]));
  return { primary: text('.job-primary').replace(/\s+/g, ' ').trim(), splits: pct };
};

/** The debrief's own line: the credited split, the measured one, the decision count, the idle ms. */
const PROBE_DEBRIEF = () => {
  /* the split LINE, never the whole screen: the collapsed board strip also prints a `% game` */
  const line = document.querySelector('.job-debrief-split')
    ?? [...document.querySelectorAll('.sum-job-facts .sum-fact')].find((n) => /split/i.test(n.textContent))
    ?? document.querySelector('.job-debrief, .sum-job-take');
  /* innerText, NOT textContent: the debrief is `run.js`'s Page Summary now, so adjacent blocks
     concatenate without whitespace and `textContent` yields "… 3 decisionsRating5.00 …" — which no
     `\bdecisions\b` can match. innerText inserts the line breaks the student actually reads. */
  const flat = (el) => ((el && (el.innerText ?? el.textContent)) ?? '').replace(/\s+/g, ' ');
  const t = flat(line);
  const whole = flat(document.querySelector('.job-debrief, .sum-job-take'));
  const pct = [...t.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  return {
    text: t.slice(0, 300),
    splits: pct,                                  // [session, measured]
    idle: (/(\d+)\s*ms idle/.exec(t) ?? [])[1] ?? null,
    decisions: (/(\d+)\s*decisions\b/.exec(t + ' ' + whole) ?? [])[1] ?? null,
    perItem: (/([\d.]+)\s*(?:decisions )?per item/.exec(t + ' ' + whole) ?? [])[1] ?? null,
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

/** The tier of a queue item, read out of the save the app is running on. */
async function tierAt(page, idx) {
  return page.evaluate((i) => {
    try {
      const s = JSON.parse(localStorage.getItem('u1a.save'));
      return s?.inProgress?.queue?.[i]?.tier ?? 1;
    } catch { return 1; }
  }, idx);
}

/** G1's default fixed-phase column for the JOB shape — what a tap-through student spends. */
const FIXED = JOB_DATA.FIXED_PHASES.JOB.default.phases;

async function openJob(page) {
  await page.goto(BASE + 'version.js', { waitUntil: 'load' });
  await page.evaluate(async () => {
    try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister(); } catch { /* blocked */ }
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { /* none */ }
  });
  await page.evaluate((json) => localStorage.setItem('u1a.save', json), SAVE);
  await page.goto(BASE + '#/run/job', { waitUntil: 'networkidle' });
  await page.waitForSelector('.job-screen', { timeout: 20000 });
  await nap(page, 250);
}

/** Answer the live card from its own data; fall back to an honest, well-formed miss. */
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
  if (filled) await tap(page, '.card-submit:not([hidden])', 650);
  if (await has(page, '.card-continue:not([hidden])')) return 'clear';
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
        slots.forEach((slot, i) => {
          slot.click();
          const chips = live('.wd-chip, .w-cz-opt, .w-strip-opt');
          if (chips.length) chips[(i + k + 1) % chips.length].click();
        });
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
  return (await has(page, '.card-continue:not([hidden])')) ? 'miss' : 'stuck';
}

/* ---------------------------------------------------------------- one walk */

async function walk(engineName, out) {
  const browser = await ENGINES_BY_NAME[engineName].launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const fail = (what, detail) => out.fails.push(`${engineName}: ${what} — ${detail}`);
  const row = (k, v) => out.rows.push({ engine: engineName, measure: k, value: v });
  page.on('pageerror', (e) => fail('pageerror', String(e?.message ?? e)));

  try {
    await openJob(page);

    /* ---- 3a. the split the board prints BEFORE the job ---- */
    const before = await page.evaluate(PROBE_BOARD_SPLIT);
    const boardSplit = before.splits[0] ?? null;
    row('board split', boardSplit == null ? 'NOT PRINTED' : `${boardSplit} %`);
    row('primary', before.primary.slice(0, 90));
    if (boardSplit == null) fail('board', 'the board printed no `% game` projection');

    /* ---- 5. dead time, sampled from here to the debrief ---- */
    let deadMs = 0;
    let deadBeats = 0;
    const sample = async (label) => {
      const t0 = Date.now();
      const a = await page.evaluate(PROBE_ALIVE);
      if (!a.alive) { deadMs += Date.now() - t0; deadBeats++; out.dead.push(`${label}/${a.phase}`); }
      return a;
    };
    await sample('board');

    /* ---- 1a. the board read: G1 counts it, the RECORD cannot own it (notes/J8.md §5.8) ----
       `screens/job.js startOrGo()` calls `startJob(now)` and `beginTargets(now)` in the same tick,
       so the seconds the student spent reading the board are before the record exists. Parked here,
       and REPORTED rather than failed: the fix is one argument, and it is J6's (Request 5). */
    const parkStart = Date.now();
    await nap(page, HOLD_MS);
    const parked = Date.now() - parkStart;
    await tap(page, '.job-primary', 900);                        // the tap that starts the job
    const afterBoard = await page.evaluate(PROBE_CLOCK);
    const banked = (afterBoard.ph?.board ?? 0) + (afterBoard.ph?.guard ?? 0);
    row('parked on the board', `${parked} ms → banked ${banked} ms`);
    if (banked < parked - TOLERANCE_MS) {
      out.warns.push(`the board read is not measured: parked ${parked} ms, banked ${banked} ms `
        + '— screens/job.js startOrGo() starts the clock at the primary tap (notes/J8.md §5.8, Request 5)');
    }

    /* ---- 2. the visibilitychange, mid-answer ---- */
    let hiddenChecked = false;
    let target = 0;
    let beats = 0;
    let stuck = 0;
    let parkedGame = false;
    const MAX = 48;
    const started = Date.now();
    /* a fast walk should never need four minutes; `--realtime` parks `LIMITS.minutesPerTier` on
       every stem, so a JOB-12 legitimately takes twenty. */
    const WALK_BUDGET_MS = REALTIME ? 1800000 : 240000;
    while (target < MAX && beats < 400 && Date.now() - started < WALK_BUDGET_MS) {
      const clockNow = await page.evaluate(PROBE_CLOCK);
      const ph = clockNow.domPhase;
      if (ph === 'debrief' || ph == null) break;
      beats++;
      if (flag('trace')) console.log(`  [${beats}] ${ph} ${clockNow.idx}/${clockNow.of}`);
      await sample(`t${target}`);

      if (ph === 'envelope' || ph === 'call') {
        if (REALTIME) await nap(page, DECISION_PARTS_T1.call * 1000);
        if (!parkedGame) {
          /* 1b. a GAME phase the record DOES own, parked: `tGame` has to grow by the wall clock.
             The sealed envelope is the natural one — it is where G1 spends the 5 s call. */
          parkedGame = true;
          const t0 = Date.now();
          const pre = clockNow.tGame ?? 0;
          await nap(page, HOLD_MS);
          await page.keyboard.press('Digit2');
          await nap(page, 420);
          const held = Date.now() - t0;
          const post = (await page.evaluate(PROBE_CLOCK)).tGame ?? 0;
          row('parked on the envelope', `${held} ms → tGame +${post - pre} ms`);
          if (post - pre < HOLD_MS - TOLERANCE_MS) {
            fail('wall clock', `parked ${held} ms on the envelope, tGame grew only ${post - pre} ms`);
          }
          target++;
          continue;
        }
        await page.keyboard.press('Digit2');                      // CALL 70
        await nap(page, 420);
        target++;
        continue;
      }
      if (ph === 'answer') {
        if (!hiddenChecked) {
          hiddenChecked = true;
          const pre = await page.evaluate(PROBE_CLOCK);
          /* hide the tab: `store.js` flushes on `visibilitychange`, which is all a hidden tab does */
          await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
          });
          const t0 = Date.now();
          await nap(page, HOLD_MS);
          /* and come back the hard way: a full reload, mid-answer */
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('.job-screen', { timeout: 20000 });
          const hiddenFor = Date.now() - t0;
          const post = await page.evaluate(PROBE_CLOCK);
          row('hidden for', `${hiddenFor} ms`);
          row('tGame across the hide', `${pre.tGame} → ${post.tGame}`);
          row('tAnswer across the hide', `${pre.tAnswer} → ${post.tAnswer}`);
          if (post.tGame !== pre.tGame) fail('visibilitychange', `tGame moved across the flush: ${pre.tGame} → ${post.tGame}`);
          if (post.tAnswer !== pre.tAnswer) fail('visibilitychange', `tAnswer moved across the flush: ${pre.tAnswer} → ${post.tAnswer}`);
          if (post.phase !== pre.phase) fail('visibilitychange', `the phase did not resume: ${pre.phase} → ${post.phase}`);
          if (post.idx !== pre.idx) fail('visibilitychange', `the pointer moved: ${pre.idx} → ${post.idx}`);
          const r = await answerOne(page);
          await tap(page, '.card-continue:not([hidden])', 700);
          const done = await page.evaluate(PROBE_CLOCK);
          const grew = (done.tAnswer ?? 0) - (post.tAnswer ?? 0);
          row('the hidden interval', `${grew} ms banked into ANSWER (held ${hiddenFor} ms), result ${r}`);
          if (grew < hiddenFor - TOLERANCE_MS) {
            fail('visibilitychange', `the hidden ${hiddenFor} ms did not reach the live phase (banked ${grew} ms)`);
          }
          continue;
        }
        if (REALTIME) {
          const tier = await tierAt(page, clockNow.idx ?? 0);
          await nap(page, Math.round((ANSWER_MINUTES_PER_TIER[tier] ?? 0.5) * 60000));
        }
        const r = await answerOne(page);
        if (r === 'stuck') {
          /* a widget this filler cannot drive (qa/job-screen.mjs has the same escape hatch). The
             debrief is what the rest of this file measures, so WALK out of the job and read it —
             the exit is a real one and the accumulators are the ones the student earned. */
          stuck++;
          row('stuck on a widget', `target ${clockNow.idx} — walked out to reach the debrief`);
          await page.keyboard.press('KeyW');
          await nap(page, 400);
          if (!(await tap(page, '.job-quit-bag', 900))) await tap(page, '.job-quit-leave', 900);
          continue;
        }
        await tap(page, '.card-continue:not([hidden])', 600);
        /* the payout line: the rest of this tier's published decision seconds after the 5 s call.
           It is parked HERE, right after the continue that produced it, because the payout beat is
           not separately observable in this screen's flow — the continue tap carries the target
           through `applyTarget` and the next probe already reads the following envelope. */
        if (REALTIME) {
          const tier = await tierAt(page, Math.max(0, (clockNow.idx ?? 1) - 0));
          await nap(page, Math.max(0, (DECISION_SECONDS[tier] ?? 14) - DECISION_PARTS_T1.call) * 1000);
        }
        continue;
      }
      if (ph === 'payout' || ph === 'bagpush') {
        if (REALTIME) {
          const tier = clockNow.idx > 0 ? await tierAt(page, clockNow.idx - 1) : 1;
          await nap(page, Math.max(0, (DECISION_SECONDS[tier] ?? 14) - DECISION_PARTS_T1.call) * 1000);
        }
        await page.keyboard.press('Enter'); await nap(page, 450); continue;
      }
      if (ph === 'brief') {
        if (REALTIME) await nap(page, FIXED.brief * 1000);
        await page.keyboard.press('Enter'); await nap(page, 450); continue;
      }
      if (ph === 'getaway') {
        if (REALTIME) await nap(page, FIXED.getaway * 1000);
        await page.keyboard.press('KeyK'); await nap(page, 600); continue;
      }
      await nap(page, 250);
      target++;
    }
    row('beats walked', `${beats} (${Math.round((Date.now() - started) / 1000)} s)${stuck ? `, ${stuck} stuck` : ''}`);
    if (beats >= 400 || Date.now() - started >= WALK_BUDGET_MS) fail('walk', `the walk did not reach the debrief in ${beats} beats`);

    /* ---- 3b + 4. the debrief ---- */
    await page.waitForSelector('.job-debrief, .sum-job-take', { timeout: 20000 }).catch(() => {});
    const after = await page.evaluate(PROBE_DEBRIEF);
    const clock = await page.evaluate(PROBE_CLOCK);
    const debriefSplit = after.splits[0] ?? null;          // the headline: the MEASURED split
    const debriefSession = after.splits[1] ?? null;         // beside it: the same with this screen
    row('debrief split', debriefSplit == null ? 'NOT PRINTED' : `${debriefSplit} % measured · ${debriefSession ?? '—'} % with this screen`);
    row('debrief line', after.text.slice(0, 170));
    row('log entry', clock.log ? `tGame ${clock.log.tGame} · tAnswer ${clock.log.tAnswer}` : 'none');
    if (debriefSplit == null) fail('debrief', 'the debrief printed no split');
    if (debriefSession == null) fail('debrief', 'the debrief printed only one basis');
    /* THE AGREEMENT CRITERION IS ONLY MEANINGFUL AT HUMAN PACE. This walk answers a tier-1 target in
       about two seconds where `LIMITS.minutesPerTier` budgets thirty, so its measured split is the
       filler's arithmetic, not a student's — exactly the trap notes/J6b.md §5 flagged. The ±5-point
       criterion is carried, cell by cell, by `tests/job-split.test.mjs` §3; here it is a hard check
       only under `--realtime`, which makes the walk spend the published seconds. */
    if (debriefSplit != null && boardSplit != null) {
      const d = Math.abs(debriefSplit - boardSplit);
      row('board vs debrief', `${boardSplit} % → ${debriefSplit} % (${d.toFixed(0)} points)`);
      if (d > AGREE_POINTS) {
        const msg = `board printed ${boardSplit} %, debrief printed ${debriefSplit} % (> ${AGREE_POINTS} points)`;
        if (REALTIME) fail('agreement', msg);
        else out.warns.push(`${msg} — fast walk: the filler does not spend the published answer `
          + 'seconds, so this is not the criterion. Re-run with --realtime, or see tests/job-split.test.mjs §3.');
      }
    }
    if (after.decisions == null) fail('debrief', 'the decision count is not printed');
    else row('decisions', after.decisions);
    if (after.idle == null) fail('debrief', 'the idle measurement is not printed');
    else {
      row('printed idle', `${after.idle} ms`);
      if (Number(after.idle) !== 0) fail('idle', `the debrief printed ${after.idle} ms idle`);
    }
    row('sampled dead beats', `${deadBeats} (${deadMs} ms)`);
    if (deadBeats > 0) fail('dead time', `${deadBeats} sampled beats were neither input nor result: ${out.dead.join(' ')}`);
  } catch (e) {
    fail('threw', String(e?.message ?? e));
  } finally {
    if (!(flag('keep') && out.fails.length)) await browser.close();
  }
}

/* ---------------------------------------------------------------- main */

const out = { rows: [], fails: [], warns: [], dead: [] };
for (const e of ENGINES) {
  if (!ENGINES_BY_NAME[e]) { out.fails.push(`unknown engine ${e}`); continue; }
  await walk(e, out);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\nJ8 — the clock, measured in a browser\n');
for (const r of out.rows) console.log(`  ${pad(r.engine, 9)} ${pad(r.measure, 26)} ${r.value}`);
console.log('');
for (const w of out.warns) console.log('  ! ' + w);
if (out.warns.length) console.log('');
if (out.fails.length) {
  console.log(`FAIL (${out.fails.length})`);
  for (const f of out.fails) console.log('  ✖ ' + f);
} else {
  console.log(`PASS — wall-clock deltas, a survived visibilitychange, 0 ms idle${REALTIME ? ', board ≈ debrief' : ''}`
    + (out.warns.length ? ` (${out.warns.length} warning${out.warns.length > 1 ? 's' : ''} above)` : ''));
}
server.close();
process.exit(out.fails.length ? 1 : 0);
