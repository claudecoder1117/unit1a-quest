// qa/cut-strip.mjs — THE PLAY STRIP IS NOT BEHIND THE DOCK. Dev-only; never served.
//
//   node qa/cut-strip.mjs [--engine chromium|webkit] [--vp 320x568] [--quiet]
//   exit 0 = PASS, 1 = FAIL. `tests/job-screen.test.mjs` runs it behind the repo's Playwright gate.
//
// WHY THIS EXISTS RATHER THAN A LAYOUT-AUDIT ARM. The screen lane's round 3 found the whole three-slot
// strip 100 % behind the dock with the keyboard open, and `node qa/layout-audit.mjs --only job
// --engine both --theme both --vp all` printed `0 findings (136 waived) … PASS` over it. That is not
// a waiver and not a detector bug: the auditor's dock check is gated `phase === 'bottom'`
// (layout-audit.mjs:620), and at scroll-end the STICKY strip has already pinned to top 56 and is
// clear of the dock. The shape is only wrong at scroll 0, which is the only place that check does not
// look, and the generic pairwise overlap rule skips it because the dock is a different opaque
// stacking surface (layout-audit.mjs:598) — drawn over content by design, which a sticky strip is not.
//
// Teaching the auditor that distinction is the right long-term fix and it is filed (notes/cut-screen.md
// Requests 14); it needs a planted defect and a clean control in `qa/audit/selftest.html` to be
// trustworthy, and an uncalibrated detector bolted onto the gate is worse than a blind one. So the
// specific shape is pinned HERE instead, by the lane's own reproduction, promoted out of scratchpad
// and given a verdict — and the strip is measured where it is wrong, at scroll 0, keyboard open.
//
// BOTH SHAPES OF THE STRIP ARE MEASURED, and each arm now ASSERTS which shape it got: the one-line
// `data-form="line"` band during an ordinary question, and the two-line `data-form="stack"` band the
// strip takes when a GRADE lands while the graded card is still on screen (screens/job.js:1149).
//
// THE SECOND ARM USED TO MEASURE THE FIRST SHAPE TWICE. It wrote `inProgress.game.call = { id: null,
// at: 1 }` and called the result a sealed-bidless question, which was the two-line band when it was
// written — but round 4 gave a bidless reading `{ value: '', caption: '', meter: null }`
// (screens/job.js:290) and `renderStrip` keys the form off that caption (job.js:779), so a bidless
// question has taken the ONE-line band ever since. Both arms were the same shape: the run printed
// ALL PASS, `--mutate` still printed two dock failures, and neither the probe nor its own inverted
// guard could see that the coverage had narrowed. Found by layout-safari, round 5.
//
// The grade is the only moment the two-line band and the dock are on a screen together — the strip
// is `stack` on the face-down card too, and there is no dock there — so it is the shape worth
// measuring, and it is also the exact combination `css/job.css` collapses at
// `:root[data-kb="open"] .job-screen[data-phase="answer"][data-form="stack"]`. The keyboard is
// pinned BEFORE the answer is submitted, which is when a phone's keyboard is up: card.js disables
// the fields at grade time, so a pin taken afterwards has nothing to focus and reports `kb=closed`.
// MEASURED at 320x568 chromium: band 43.7 px with the captions computed `display: none` — that
// collapse rule fires here and is the reason it is 43.7 px and not the ~68 px the band is without it.
//
// It drives the audit catalog's own `job-answer-kb` (pinKeyboard, KB_PX = 336) so that what is
// measured is the state the auditor gates, not a configuration invented here.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');            // this file lives in qa/, not two deep
const SITE = path.join(REPO, 'site');
const QA = path.join(REPO, 'qa');
const QA_PREFIX = '/__qa__/';
const require = createRequire(path.join(QA, 'package.json'));
const { chromium, webkit } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ENGINE = arg('--engine', 'chromium');
const QUIET = process.argv.includes('--quiet');
/* MUTATION ARM \u2014 a net nobody has seen fail is not a net. `--mutate` injects the defect this file
   exists for (the strip pushed down behind the dock, exactly what the layout audit passed over) into
   the live page, touching nothing on disk, and the run MUST then print FAIL. `notes/AUDIT.md` calls
   the same idea "Trusting the net" and layout-audit.mjs spells it `--inject`. */
const MUTATE = process.argv.includes('--mutate');
const MUTATION = '.job-strip{position:relative !important;top:120px !important;z-index:1 !important;}';
const [VW, VH] = arg('--vp', '320x568').split('x').map(Number);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
};
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const root = p.startsWith(QA_PREFIX) ? QA : SITE;
  const file = path.join(root, p.startsWith(QA_PREFIX) ? p.slice(QA_PREFIX.length) : p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const settle = async (page, ms = 130) => {
  try {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(ms);
  } catch { /* raced */ }
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
    await page.goto(BASE + 'version.js', { waitUntil: 'load' });
    await page.evaluate((j) => localStorage.setItem('u1a.save', j), s);
  },
  async waitReady(page) {
    try {
      await page.waitForFunction(() => {
        const v = document.getElementById('view');
        return !!v && v.children.length > 0;
      }, null, { timeout: 8000 });
    } catch { /* fine */ }
    try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch { /* fine */ }
    await settle(page, 260);
  },
  async readFixture(name) {
    const n = String(name);
    const f = path.join(QA, 'fixtures', n.endsWith('.json') ? n : n + '.json');
    return await readFile(f, 'utf8');
  },
};

const statesMod = await import(path.join(QA, 'audit-states.mjs'));
const ALL = (statesMod.states || statesMod.default)(H);
const byId = (id) => ALL.find((s) => s.id === id) || (() => { throw new Error('no state ' + id); })();

const MEASURE = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1), pos: cs.position, z: cs.zIndex }; };
  const strip = document.querySelector('.job-strip') || document.querySelector('.run-head');
  const dock = document.getElementById('dock');
  const sr = r(strip); const dr = r(dock);
  const fold = (window.visualViewport?.height ?? innerHeight);
  let visible = 0;
  if (sr) {
    const top = Math.max(sr.top, 0);
    const bot = Math.min(sr.bottom, dr ? Math.min(dr.top, fold) : fold);
    visible = Math.max(0, +(bot - top).toFixed(1));
  }
  const slots = [...document.querySelectorAll('.job-slot')].map((s) => {
    const b = s.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return { slot: s.dataset.slot, hit: el ? (el.className && String(el.className).split(' ')[0]) || el.tagName : null };
  });
  const head = document.querySelector('.job-head');
  const hr = r(head);
  const screen = document.querySelector('.job-screen');
  return {
    strip: sr, dock: dr, fold, scrollY: Math.round(scrollY), stripVisiblePx: visible, slots,
    head: hr, headEmpty: head ? head.childElementCount === 0 : null,
    headDisplay: head ? getComputedStyle(head).display : null,
    kb: document.documentElement.dataset.kb ?? null,
    /* WHICH SHAPE THIS IS, off the screen's own attributes rather than off what the arm meant to
       reach — the r4 narrowing was invisible precisely because nothing read these back. `capK` is
       printed, not asserted: it is the evidence that the `data-kb="open"` collapse rule fires. */
    form: screen?.dataset.form ?? null,
    phase: screen?.dataset.phase ?? null,
    card: !!document.querySelector('.job-screen .card-screen'),
    graded: !!document.querySelector('.card-continue:not([hidden])'),
    capK: [...document.querySelectorAll('.job-slot-k')].map((e) => getComputedStyle(e).display).join('/') || null,
  };
};

/* the catalog's own pinKeyboard, inlined (it is not exported): shrink the VISUAL viewport and
   publish `--kb` / `data-kb`, after a real focus, exactly as qa/audit-states.mjs does. */
const KB_PX = statesMod.KB_PX ?? 336;
const pinKeyboard = async (page) => {
  const focused = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.card-parts input:not([type="hidden"]), .card-parts textarea')]
      .find((e) => !e.disabled && !e.readOnly && e.getClientRects().length);
    if (f) { f.focus(); f.dispatchEvent(new Event('focus', { bubbles: true })); }
    return !!f;
  });
  if (!focused) throw new Error('pinKeyboard: nothing focusable on this state');
  return page.evaluate((KB2) => {
    const root = document.documentElement;
    const phone = () => innerWidth <= 480;
    const vv = window.visualViewport;
    if (vv && !vv.__kbPinned) {
      const proto = Object.getPrototypeOf(vv);
      const realH = Object.getOwnPropertyDescriptor(proto, 'height')?.get;
      if (realH) {
        Object.defineProperty(vv, '__kbPinned', { value: true });
        Object.defineProperty(vv, 'height', { configurable: true, get() { const h = realH.call(this); return phone() ? Math.max(120, h - KB2) : h; } });
      }
    }
    const pin = () => {
      const inset = phone() ? KB2 : 0;
      const want = inset > 80 ? 'open' : 'closed';
      if (root.style.getPropertyValue('--kb') !== inset + 'px') root.style.setProperty('--kb', inset + 'px');
      if (root.dataset.kb !== want) root.dataset.kb = want;
    };
    new MutationObserver(pin).observe(root, { attributes: true, attributeFilter: ['data-kb', 'style'] });
    addEventListener('resize', pin);
    vv?.addEventListener('resize', pin);
    pin();
    document.activeElement?.dispatchEvent?.(new Event('focus', { bubbles: true }));
  }, KB_PX);
};

/**
 * FINISH THE LIVE QUESTION so the strip repaints with the card still under it.
 *
 * It answers the way `qa/audit-states.mjs`'s own `missOn` does — a complete submission of whatever
 * the widget wants, retried until the card is finished (three misses force the worked solution) —
 * and deliberately does NOT take Continue: the card has to stay mounted, because a strip with no
 * card under it has no dock to be behind and this probe would be measuring nothing again.
 *
 * WHY A COMPLETE SUBMISSION AND NOT A KEYSTROKE IN THE FIRST FIELD. An incomplete answer grades
 * `almost`, which is free and does not end the question: `ang-wu-2` (the typed target of
 * `job-answer-kb` on `midweek.json`) is a PAIRS card whose `.w-pairs-input` accepts text while the
 * part still wants `data-count` pairs, so filling the input and submitting six times leaves
 * `data-state="almost"` six times and the grade never lands. That is the same trap audit-states
 * documents at its pairs branch, and it is why the field loop below is the narrow
 * `.w-field input` one rather than every input on the card.
 *
 * The repaint it is after is `screens/job.js:1149`, `if (!fell) renderStrip(modelNow('answer'))`:
 * `fell` is the pile or the streak dropping, and this arm answers the FIRST question of a session,
 * where the pile is 0 and the streak is 1 and neither can drop — so the repaint lands whether the
 * answer was right or wrong, and the arm does not depend on knowing the answer.
 */
const finishLiveCard = async (page, { max = 6 } = {}) => {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate(() => !!document.querySelector('.card-continue:not([hidden])'))) return true;
    await page.evaluate((n) => {
      const WRONG = ['12', '7', '31', '5', '19', '23'];
      const v = WRONG[n % WRONG.length];
      let filled = 0;
      for (const inp of document.querySelectorAll('.card-parts .w-field input')) {
        if (inp.disabled || inp.readOnly || !inp.getClientRects().length) continue;
        inp.focus(); inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); filled++;
      }
      if (filled) return;
      const q = (sel) => [...document.querySelectorAll(`.card-parts ${sel}`)].filter((b) => !b.disabled && b.getClientRects().length);
      const pairs = document.querySelector('.card-parts .w-pairs');
      if (pairs) {
        const need = Math.max(1, Number(pairs.dataset.count) || 1);
        const pills = q('.w-pairs-angle');
        if (pills.length >= 2) {
          for (let k = 0; k < need; k++) {
            pills[(n + 2 * k) % pills.length]?.click();
            pills[(n + 2 * k + 1) % pills.length]?.click();
          }
          return;
        }
      }
      for (const sel of ['.wd-opts button', '.wd-chip', '.w-segbtn']) {
        const btns = q(sel);
        if (btns.length) { btns[(btns.length - 1 - n + btns.length * 2) % btns.length].click(); return; }
      }
    }, i);
    await settle(page, 200);
    /* the widget may have submitted itself the moment the answer became complete */
    await page.evaluate(() => document.querySelector('.card-submit:not([hidden])')?.click());
    await settle(page, 700);
  }
  return page.evaluate(() => !!document.querySelector('.card-continue:not([hidden])'));
};

const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch();
const out = {};
for (const id of ['job-answer-kb']) {
  const st = byId(id);
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  try {
    await st.prepare(page);
    if (MUTATE) await page.addStyleTag({ content: MUTATION });
    await settle(page, 200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 200);
    out[id + '@scroll0'] = await page.evaluate(MEASURE);

    /* …AND THE OTHER SHAPE OF THE BAND, on the same page, with the same pinned keyboard: the grade
       landing while the graded card is still mounted. The seal is released at that instant, so the
       third slot goes back to the hit rate AND ITS CAPTION, and `renderStrip` takes the two-line
       `data-form="stack"` band. No reload and no write to the save: a state this probe posted into
       localStorage is a state it invented, and inventing one is how the old arm went quiet. */
    if (!(await finishLiveCard(page))) throw new Error('the live question never reached a grade — the card is still open');
    await settle(page, 400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 200);
    out['job-graded-stack@scroll0'] = await page.evaluate(MEASURE);
  } catch (e) { out[id + '-error'] = String(e).slice(0, 300); }
  await ctx.close();
}
if (!QUIET) console.log(ENGINE, `${VW}x${VH}`, JSON.stringify(out, null, 1));
await browser.close();
server.close();

/* ---------------------------------------------------------------- the verdict */

const rows = [];
const fails = [];
const ok = (label, cond, detail) => {
  rows.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail == null ? '' : ` \u2014 ${detail}`}`);
  if (!cond) fails.push(label);
};

/* Each arm names the shape it exists to measure, and the shape is read back off `data-form` — the
   one assertion whose absence let the second arm spend a round measuring the first arm's band. */
for (const [key, form] of [['job-answer-kb@scroll0', 'line'], ['job-graded-stack@scroll0', 'stack']]) {
  const m = out[key];
  if (!m) { ok(`${key}: the state was reached`, false, out['job-answer-kb-error'] ?? 'no measurement'); continue; }
  ok(`${key}: the state was reached`, true, `strip h=${m.strip?.h} dock top=${m.dock?.top}`);
  ok(`${key}: there IS a strip and there IS a dock to be behind`, !!m.strip && !!m.dock,
    `strip=${!!m.strip} dock=${!!m.dock}`);
  ok(`${key}: the keyboard is actually open (or the measurement is of nothing)`, m.kb === 'open', `data-kb=${m.kb}`);
  ok(`${key}: measured at the top of the page, where the defect lives`, m.scrollY === 0, `scrollY=${m.scrollY}`);
  ok(`${key}: the band is the shape this arm exists to measure`, m.form === form && m.phase === 'answer',
    `data-form=${m.form} (this arm measures ${form}) data-phase=${m.phase} captions=${m.capK}`);
  if (form === 'stack') {
    ok(`${key}: the grade landed with the card still on screen`, m.card === true && m.graded === true,
      `card=${m.card} continue=${m.graded}`);
  }
  if (m.strip) {
    /* THE ASSERTION. `stripVisiblePx` is the strip's own height clipped to the band above the dock
       and above the visual fold, so 100 % behind the dock reads 0 and the 43.9 px band reads 43.9.
       The floor is the WHOLE strip minus a pixel of rounding: a strip that is half behind the dock
       is already a strip whose numbers a student cannot read. */
    ok(`${key}: the strip is clear of the dock at scroll 0`, m.stripVisiblePx >= m.strip.h - 1,
      `${m.stripVisiblePx}px of ${m.strip.h}px visible (dock top ${m.dock?.top}, fold ${m.fold})`);
  }
  /* …and independently of the rectangles: the browser's own hit test at each slot centre must answer
     the strip, not the dock. A rect can be "visible" and still be painted under something. */
  const slots = m.slots ?? [];
  ok(`${key}: all three slots are on screen`, slots.length === 3, `${slots.length} slots`);
  const covered = slots.filter((s2) => !s2.hit || /^dock|^card-|^btn/.test(String(s2.hit)));
  ok(`${key}: every slot answers its own content to elementFromPoint`, covered.length === 0,
    slots.map((s2) => `${s2.slot}\u2192${s2.hit}`).join(' '));
}

if (MUTATE) {
  /* inverted: under the injected defect the run must FAIL, and it must fail on the dock assertion
     specifically — a crash or a missed state would also produce failures and would prove nothing.
     BOTH ARMS, AND EACH ON ITS OWN SHAPE. `>= 1` was the hole round 5 walked through: when the two
     arms collapsed onto the same band, one arm's dock failure still printed MUTATION CAUGHT and the
     guard read as green while half the coverage was gone. So the count has to be the number of arms,
     and an arm that measured the wrong `data-form` voids the run however many dock assertions fired. */
  const onTheRightOne = fails.filter((f) => /clear of the dock/.test(f)).length;
  const wrongShape = fails.filter((f) => /the shape this arm exists to measure/.test(f));
  console.log(rows.join('\n'));
  const caught = onTheRightOne >= 2 && wrongShape.length === 0;
  console.log(caught
    ? `MUTATION CAUGHT (${onTheRightOne} dock assertion(s) fired of ${fails.length} failures)`
    : wrongShape.length
      ? `MUTATION MISSED — an arm measured the wrong band, so the run proves nothing: ${wrongShape.join(' | ')}`
      : `MUTATION MISSED — the injected defect did not trip both dock assertions (${onTheRightOne} fired; ${fails.length} failures: ${fails.join(' | ')})`);
  process.exit(caught ? 0 : 1);
}
console.log(rows.join('\n'));
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
