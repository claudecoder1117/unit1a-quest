// qa/cut-integrator.mjs — THE INTEGRATOR'S ACCEPTANCE, in a real browser. Dev-only, never served,
// read-only about the repo: it serves `site/`, seeds saves with the SHIPPED engine verbs in plain
// node, drives chromium at 390×844 and prints the two counts CUT-BRIEF makes hard limits of.
//
//   node qa/cut-integrator.mjs
//
// 1. NUMBERS ON SCREEN (limit 3). The game's own surfaces only — the mounted study question is
//    removed from the clone before the text is read, because the numerals in a geometry stem are
//    the study layer's and are identical on `#/run/page`. Counted as digit-RUNS in visible text:
//    `×3` is one number, `pays 27` is one, an `aria-label` is none (it is read aloud, not drawn).
// 2. TAPS PER QUESTION (limit 2). Counted as CONTROLS THE STUDENT MUST HIT to get from one question
//    to the next: the game's own (a live call on the face-down card) plus the study card's Submit.
//    Bank is counted separately — CUT-BRIEF allows it as "a third control that is always available
//    and never required", and `required` is what is asserted.
//
// Every state below is one the engine reaches on its own: the saves are built by `job/state.js`'s
// own verbs (`startJob`, `call`, `answer`), never by hand, except the widest strip, which writes
// the engine's two scalars the way `qa/audit-states.mjs job-widest` does and reloads.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const require = createRequire(path.join(REPO, 'qa', 'package.json'));
const { chromium } = require('playwright');

const { fresh, migrate } = await import(`${SITE}/js/store.js`);
const { pageOpts } = await import(`${SITE}/js/plan.js`);
const JOB = await import(`${SITE}/js/job/state.js`);

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

const T0 = Date.parse('2026-09-23T16:00:00Z');
const CLEAR = { cleared: true, clean: true, firstTry: true, attempt: 1, hints: 0 };
const MISS = { cleared: false, attempt: 3, hints: 2 };

const { freshen } = await import('./fixtures/audit-build.mjs');
const FIX = ['fixtures/audit/midweek.json', 'fixtures/midweek.json'].map((f) => path.join(REPO, 'qa', f)).find(existsSync);

/**
 * A save with a session open, played with the SHIPPED verbs until `stop` says so.
 *
 * MIGRATE FIRST, THEN PLAY. `qa/fixtures/audit/midweek.json` is a **v1** save and `store.js`'s
 * 2 → 3 migration DELETES `inProgress.game` (it is the door that drops the deleted layer's live
 * session). Seeding a v1 save with the game verbs and handing it to the browser therefore hands it
 * a session the store throws away on load: the screen either starts a brand-new one or bounces to
 * `#/run/page`, and every state below measures something other than what it names. Migrating here
 * is what makes the seeded state survive the door.
 */
function seed(stop, { profile = 'integ', decide = null } = {}) {
  const raw = FIX ? freshen(JSON.parse(readFileSync(FIX, 'utf8'))) : fresh(T0 - 6 * 86_400_000);
  const s = migrate(raw, T0);
  s.profileId = profile;
  s.settings = { ...(s.settings || {}), game: true, testDate: '2026-09-25' };
  delete s.inProgress;
  JOB.startJob(s, { ...pageOpts(s), now: T0 });
  let t = T0;
  for (let i = 0; i < 40 && JOB.targetsLeft(s) > 0; i++) {
    const it = JOB.currentItem(s);
    if (stop(it, s)) return s;
    if (!JOB.stateOf(s).call) {
      const offered = JOB.callsFor(s);
      if (offered.length) JOB.call(s, offered[0], { now: (t += 4000), ms: 4000 });
    }
    const review = !!(it.isReview || it.isRematch);
    const how = decide ? decide(it, s) : (review && !it.requeued ? MISS : CLEAR);
    JOB.answer(s, how, { now: (t += 12_000), ms: 12_000 });
  }
  return s;
}

/* ------------------------------------------------------------------ the probes */

/** The game's own surfaces, with the study question's subtree removed. */
const CHROME = (page) => page.evaluate(() => {
  const root = document.querySelector('.job-screen');
  if (!root) return null;
  const clone = root.cloneNode(true);
  for (const el of clone.querySelectorAll('.card-screen')) el.remove();
  const vis = (el) => {
    let t = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { t += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') continue;
      t += ' ' + vis(n);
    }
    return t;
  };
  const text = vis(clone).replace(/\s+/g, ' ').trim();
  const bankEl = root.querySelector('.job-bank');
  return {
    phase: root.dataset.phase ?? null,
    text,
    nums: text.match(/\d+/g) || [],
    slots: [...root.querySelectorAll('.job-strip .job-slot')].map((s) => `${s.dataset.slot}:${(s.querySelector('.job-slot-v')?.textContent || '').trim()}|${(s.querySelector('.job-slot-k')?.textContent || '').trim()}`),
    marks: root.querySelectorAll('.job-mark').length,
    marksLabel: root.querySelector('.job-marks')?.getAttribute('aria-label') ?? null,
    faceDown: !!root.querySelector('.job-face-down'),
    calls: root.querySelectorAll('.job-call').length,
    liveCalls: [...root.querySelectorAll('.job-call')].filter((b) => !b.disabled).map((b) => b.textContent.trim()),
    bank: bankEl ? (bankEl.disabled ? 'greyed' : 'live') : 'absent',
    /* THE TAPS THIS PHASE REQUIRES OF THE GAME: a control the student must hit before the question
       can appear. Bank is never one — it is optional in every phase it is drawn in. */
    requiredGameTaps: [...root.querySelectorAll('.job-call')].some((b) => !b.disabled) ? 1 : 0,
    question: !!root.querySelector('.card-screen'),
    studySubmit: !!document.querySelector('.card-submit:not([hidden])'),
  };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('   [console.error]', m.text().slice(0, 160)); });

async function open(save) {
  await page.goto(BASE + 'version.js', { waitUntil: 'load' });
  await page.evaluate((j) => localStorage.setItem('u1a.save', j), JSON.stringify(save));
  await page.goto(BASE + '#/run/job', { waitUntil: 'load' });
  await page.waitForSelector('.job-screen', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

const worst = { nums: 0, where: '', taps: 0, tapsWhere: '' };
async function why() {
  const d = await page.evaluate(() => ({
    hash: location.hash,
    screens: [...document.querySelectorAll('.screen')].map((e) => e.className).slice(0, 4),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
    game: (() => { try { return JSON.parse(localStorage.getItem('u1a.save')).inProgress?.game ?? null; } catch { return null; } })(),
    on: (() => { try { return JSON.parse(localStorage.getItem('u1a.save')).settings?.game ?? null; } catch { return null; } })(),
  }));
  console.log('   WHY:', JSON.stringify(d).slice(0, 600));
}

function line(tag, c) {
  if (!c) { console.log(`   ${tag}: no .job-screen`); return; }
  if (c.nums.length > worst.nums) { worst.nums = c.nums.length; worst.where = tag; }
  if (c.requiredGameTaps > worst.taps) { worst.taps = c.requiredGameTaps; worst.tapsWhere = tag; }
  console.log(`   ${tag.padEnd(26)} phase=${String(c.phase).padEnd(6)} nums=${c.nums.length} [${c.nums.join(' ')}]`
    + `  card=${c.faceDown ? 'Y' : '·'} calls=${c.liveCalls.length}/${c.calls} bank=${c.bank.padEnd(6)}`
    + ` marks=${String(c.marks).padEnd(2)} gameTaps=${c.requiredGameTaps} q=${c.question ? 'up' : '· '}  | ${c.text}`);
}

/* ============================== 1. the opening of a cold session ============================ */
console.log('\n=== 1 · THE OPENING OF A COLD SESSION (pile 0) ===');
const cold = seed(() => true, { profile: 'i1' });
await open(cold);
line('mount', await CHROME(page));
await page.waitForTimeout(1600);
line('mount +1.6s', await CHROME(page));

/* ============================== 2. a face-down card with a decision on it =================== */
console.log('\n=== 2 · A FACE-DOWN CARD (the engine played to a pile, no call sealed) ===');
const carded = seed((it, s) => { const g = JOB.stateOf(s); return g.pile > 0 && !g.call; }, { profile: 'i2' });
const g2 = JOB.stateOf(carded);
console.log(`   engine state: pile ${g2.pile} ×${g2.streak}, offered [${JOB.callsFor(carded).join(', ')}]`);
await open(carded);
const c2 = await CHROME(page);
line('the card', c2);
if (!c2) await why();
if (c2) console.log(`   slots: ${JSON.stringify(c2.slots)}   marks aria-label: ${JSON.stringify(c2.marksLabel)}`);
if (c2 && c2.liveCalls.length) {
  await page.$eval('.job-call:not([disabled])', (e) => e.click());
  await page.waitForTimeout(120);
  line('after the call (flip)', await CHROME(page));
  await page.waitForSelector('.job-screen .card-screen', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(700);
  const c3 = await CHROME(page);
  line('the question', c3);
  console.log(`   the question carries ${c3.requiredGameTaps} game control(s); the study card's own Submit is ${c3.studySubmit ? 'present' : 'absent'}`);
}

/* ============================== 3. the widest strip the engine can print ==================== */
console.log('\n=== 3 · THE WIDEST STRIP (pile 496 ×5, written onto the engine`s two scalars) ===');
await open(seed((it, s) => { const g = JOB.stateOf(s); return g.pile > 0 && !g.call; }, { profile: 'i3' }));
await page.goto(BASE + 'version.js', { waitUntil: 'load' });
const wide = await page.evaluate(() => {
  let s = null; try { s = JSON.parse(localStorage.getItem('u1a.save') || 'null'); } catch { return false; }
  if (!s?.inProgress?.game) return false;
  s.inProgress.game.pile = 496; s.inProgress.game.streak = 5; s.inProgress.game.call = null;
  localStorage.setItem('u1a.save', JSON.stringify(s));
  return true;
});
console.log('   seeded:', wide);
await page.goto(BASE + '#/run/job', { waitUntil: 'load' });
await page.waitForSelector('.job-screen', { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(900);
line('the widest card', await CHROME(page));
if ((await page.$$('.job-call:not([disabled])')).length) {
  const btns = await page.$$('.job-call:not([disabled])');
  await btns[btns.length - 1].evaluate((e) => e.click());     // `sure` at ×5 — the biggest `pays`
  await page.waitForSelector('.job-screen .card-screen', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(700);
  line('the widest question', await CHROME(page));
}

/* ============================== 4. the requeued review the game will not price =============== */
console.log('\n=== 4 · THE REPEAT (a missed review`s copy — the game prices it at nothing) ===');
const rep = seed((it) => (it?.requeued ?? 0) > 0, { profile: 'i4' });
const cur = JOB.currentItem(rep);
if (cur && cur.requeued > 0) {
  await open(rep);
  line('the bidless card', await CHROME(page));
  await page.waitForTimeout(2000);
  line('…once it has turned', await CHROME(page));
} else console.log('   no requeued review reached on this fixture');

/* ---- 4b. the same repeat WITH a pile: the beat the screen lane's r4 fix exists for ---------- */
console.log('\n=== 4b · THE REPEAT CARRYING A PILE (bank is the live control, so the card is drawn) ===');
/* clear everything until there is a pile worth losing, THEN throw one review, so its requeued copy
   arrives with the pile still standing — the state the beat's live BANK exists for */
const rep2 = seed((it, s) => (it?.requeued ?? 0) > 0 && JOB.stateOf(s).pile > 0, {
  profile: 'i4b',
  decide: (it, s) => (JOB.stateOf(s).pile >= 24 && (it.isReview || it.isRematch) && !it.requeued ? MISS : CLEAR),
});
const cur2 = JOB.currentItem(rep2);
if (cur2 && cur2.requeued > 0 && JOB.stateOf(rep2).pile > 0) {
  console.log(`   engine state: pile ${JOB.stateOf(rep2).pile} ×${JOB.stateOf(rep2).streak}, sealed bidless`);
  await open(rep2);
  line('the bidless card', await CHROME(page));
  await page.waitForTimeout(2000);
  line('…once it has turned', await CHROME(page));
} else console.log('   no requeued review reached with a pile standing on this fixture');

/* ============================== 5. the bank beat ============================================ */
console.log('\n=== 5 · THE BANK BEAT ===');
const bankable = seed((it, s) => { const g = JOB.stateOf(s); return g.pile >= 16 && !g.call; }, { profile: 'i5' });
await open(bankable);
line('before the bank', await CHROME(page));
if (await page.$('.job-bank:not([disabled])')) {
  await page.$eval('.job-bank:not([disabled])', (e) => e.click());
  await page.waitForTimeout(350);
  line('the receipt', await CHROME(page));
  await page.waitForTimeout(1800);
  line('…and after it', await CHROME(page));
} else console.log('   bank was not live');

/* ============================== 6. the end panel ============================================ */
console.log('\n=== 6 · THE END PANEL (play the session out with the shipped verbs) ===');
const done = seed(() => false, { profile: 'i6' });
await open(done);
await page.waitForTimeout(1200);
const c6 = await CHROME(page);
line('the end', c6);

/* ============================== the verdict ================================================= */
console.log('\n==============================================================================');
console.log(`NUMBERS ON SCREEN — worst paint during play: ${worst.nums}  (CUT-BRIEF limit 3)   at: ${worst.where}`);
console.log(`TAPS PER QUESTION — the game's own, worst: ${worst.taps} (at: ${worst.tapsWhere}); + the study card's Submit = ${worst.taps + 1}  (CUT-BRIEF limit 2)`);
console.log('==============================================================================\n');

await browser.close();
server.close();
