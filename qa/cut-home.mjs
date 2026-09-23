// qa/cut-home.mjs — THE CUT, lane "home", round 1: the MEASURED proof of the two fixes that only a
// real browser can settle. Prints a table and `ALL PASS` / `FAIL`; `tests/cut-home.test.mjs` spawns
// it behind the repo's usual Playwright gate (the pattern in tests/fix-stats.test.mjs).
//
// Harness copied from qa/fix5-home-r3.mjs, minus its widget patch: an in-process static server on
// port 0, Chromium at 375×667, the save injected into localStorage before the first script runs.
//
// What it measures, and why a source scan could not:
//
//   1. A PLAN PILL IS NOT A TAP TARGET ANY MORE (round-1 finding 3). `app.js` boots with a global
//      `sameRouteClick` that preventDefaults and re-`route()`s any in-page anchor whose href is the
//      whole current URL. Every page-day pill in the S7 strip pointed at `#/today` while standing on
//      `#/today`, so a student scrolled down to the weak-spot list who tapped a calendar chip got
//      Home re-mounted under them and the scroll thrown to the top. The fix is that a pill whose
//      destination is this screen carries no `href`, which only the DOM can confirm.
//   2. …AND A REAL LINK STILL WORKS: the Night pill must still navigate.
//   3. THE BEST DAY IS ON HOME (finding 1), the switch is still a door, and flipping it changes the
//      button's HREF and adds that one line — and nothing else a student can read. The save is
//      CLONED, so the two renders are one student with one seed.
//
// Usage: node qa/cut-home.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(REPO, 'qa', 'shot.mjs'));
const { chromium } = require('playwright');
const SITE = path.join(REPO, 'site');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const { fresh } = await import(path.join(SITE, 'js', 'store.js'));
const { todayISO, addDays } = await import(path.join(SITE, 'js', 'days.js'));
const { QUIET_HOUR } = await import(path.join(SITE, 'js', 'plan.js'));

const BEST = 612;                                   // the one number the best line may print

/**
 * THE CLOCK IS PINNED, AND IT HAS TO BE.
 *
 * `plan.boardPolicy` closes the game after 22:00 local (`data/job.js WEEK.quietHour` → `isQuietNow`
 * → `kind: 'closed'`, `href: '#/today'`), so between 22:00 and midnight Home's primary is the study
 * page with the game still switched ON — and assertion 3 below, which flips `settings.game` and
 * expects the HREF to move, measured `#/run/page → #/run/page` and failed. Nothing was broken: the
 * app was right and the probe was reading the wall clock. `node --test tests/` was therefore RED for
 * two hours every night, which is a suite that cannot be trusted at the hour a 14-year-old actually
 * studies.
 *
 * ONE ANCHOR feeds both halves — the save the student is built from, and the page's own `Date` — so
 * the two renders are one student, on one day, at one hour, whatever time the suite is run. 18:00
 * local is inside the open window and far from either edge of the day, so a run that straddles
 * midnight cannot make the two renders disagree about what "today" is either.
 *
 * It is a PIN, not a waiver: the 22:00 close is real behaviour and `tests/cut-home.test.mjs` holds
 * it directly, on `boardPolicy` with an explicit `now`. This file measures the switch.
 */
const NOW = (() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; })();
const TODAY = todayISO(NOW);

/** One student: a test a week out, placement done, and a best day on the board. */
function student() {
  const now = NOW.getTime();
  const s = fresh(now);
  s.profileId = 'cut-home-r1';                      // a fixed profile → a fixed page seed for both renders
  s.settings.testDate = addDays(TODAY, 7);
  s.settings.testTime = '08:00';
  s.placement = { done: true, at: now };
  s.xp = 1840;
  s.streak = { count: 4, best: 4, lastDay: addDays(TODAY, -1), freezes: 0 };
  s.player = { best: BEST };
  s.game = { today: 0, day: addDays(TODAY, -1) };   // yesterday's sitting: today has rolled to 0
  return s;
}

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(SITE, p);
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found: ' + p); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

const rows = [];
const fails = [];
const ok = (label, cond, detail) => { rows.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail == null ? '' : ` — ${detail}`}`); if (!cond) fails.push(label); };

/** A fresh context on `#/today` with `save` in localStorage, waited to the composed CTA. */
async function open(save) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  /* the page's own clock, set to `NOW` and then left to TICK normally (`install` + `resume`): the
     app is measured at a fixed hour, not at a frozen instant, so every `setTimeout` this screen
     boots on still fires the way a student's phone fires it */
  await page.clock.install({ time: NOW });
  await page.clock.resume();
  await page.addInitScript((json) => { window.localStorage.setItem('u1a.save', json); }, JSON.stringify(save));
  await page.goto(base + '#/today');
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 });
  await page.waitForTimeout(350);                   // the plan strip lands with plan.js
  return { ctx, page };
}

/* ============================================ 1 + 2. the plan strip is not a trap door */
{
  const { ctx, page } = await open(student());
  const pill = await page.evaluate(async () => {
    const li = [...document.querySelectorAll('.plan-pill')].find(x => x.dataset.kind === 'page');
    if (!li) return { error: 'no page-day pill on the strip' };
    const a = li.querySelector('a');
    const home = document.querySelector('.home');
    home.dataset.mark = 'x';                        // a re-mount replaces this node, mark and all
    window.scrollTo(0, document.body.scrollHeight);
    const scrollBefore = window.scrollY;
    a.click();
    await new Promise(r => setTimeout(r, 350));
    return {
      text: a.innerText.replace(/\s+/g, ' ').trim(),
      hasHref: a.hasAttribute('href'),
      liSelf: li.dataset.self ?? null,
      liLabel: li.getAttribute('aria-label'),
      scrollBefore, scrollAfter: window.scrollY,
      remounted: document.querySelector('.home')?.dataset.mark !== 'x',
      hash: location.hash,
    };
  });
  ok('a page-day pill exists to tap', !pill.error, pill.error ?? pill.text);
  if (!pill.error) {
    ok('…and carries no href (a link to here is not a link)', pill.hasHref === false, `hasHref=${pill.hasHref}`);
    ok('…is marked on the <li>, which still announces the day', pill.liSelf === 'true' && !!pill.liLabel, `data-self=${pill.liSelf} aria-label=${JSON.stringify(pill.liLabel)}`);
    ok('…and tapping it does not re-mount Home', pill.remounted === false, `remounted=${pill.remounted}`);
    ok('…and does not throw the scroll to the top', pill.scrollBefore > 200 && pill.scrollAfter === pill.scrollBefore, `${pill.scrollBefore} → ${pill.scrollAfter}`);
  }

  const night = await page.evaluate(async () => {
    const a = [...document.querySelectorAll('.plan-pill a')].find(x => x.getAttribute('href') === '#/night');
    if (!a) return { error: 'no Night pill' };
    a.click();
    await new Promise(r => setTimeout(r, 450));
    return { hash: location.hash };
  });
  ok('the Night pill still navigates (the fix deadens nothing real)', !night.error && night.hash !== '#/today', night.error ?? night.hash);

  /* THE NEGATIVE CONTROL for the game-OFF glyph arm below. With the game ON the handler is live,
     so the same tap on the same anchor MUST re-mount — otherwise that arm passes whether or not
     the gate works, and proves nothing. */
  await page.goto(base + '#/today');
  await page.waitForSelector('.home-primary[data-kind]:not([data-kind="loading"])', { timeout: 20000 });
  await page.waitForTimeout(350);
  const glyphOn = await page.evaluate(async () => {
    const a = document.querySelector('.hdr-home');
    if (!a || a.getAttribute('href') !== '#/today') return { error: `hdr-home href=${a?.getAttribute('href') ?? 'absent'}` };
    document.querySelector('.home').dataset.mark = 'y';
    a.click();
    await new Promise(r2 => setTimeout(r2, 350));
    return { remounted: document.querySelector('.home')?.dataset.mark !== 'y' };
  });
  ok('CONTROL \u2014 game ON: the header Home glyph DOES re-mount (the handler is live)',
    !glyphOn.error && glyphOn.remounted === true, glyphOn.error ?? `remounted=${glyphOn.remounted}`);
  await ctx.close();
}

/* ============================================ 1b. …AND THE FLAG PUTS IT ALL BACK (round-3 integration)
   The two rules above were the game layer's, and until round 3 neither read `settings.game` — which
   made CUT-BRIEF:89 ("`settings.game = false` returns the app to byte-identical COMPOSED behaviour")
   false of the shipped build, registered as two rows of `tests/cut-meta.test.mjs` UNGATED. The count
   that row published is the one measured here: on `#/today` with a far test date, COMPOSED's strip
   has every pill focusable and the game's has two. A source scan cannot settle this, because the
   thing that has to stop happening is a document-level click handler firing. */
{
  const off = student();
  off.settings.game = false;
  const { ctx, page } = await open(off);
  const r = await page.evaluate(async () => {
    const pills = [...document.querySelectorAll('.plan-pill')];
    const li = pills.find(x => x.dataset.kind === 'page');
    /* THE GAP PILL IS NOT A LINK IN COMPOSED EITHER — `git show 3a57ff5:site/js/plan.js:342` is
       `createElement(p.kind === 'gap' ? 'span' : 'a')` and 343 gives it no href. It collapses a
       long week's middle into "+n days" and stands for several dates, so it has no single
       destination to be. It is excluded here BY KIND rather than by counting, so a real pill
       that loses its href can never hide behind it. */
    const real = pills.filter(x => x.dataset.kind !== 'gap');
    const links = real.filter(x => x.querySelector('a[href]')).length;
    const dead = real.filter(x => !x.querySelector('a[href]'))
      .map(x => `${x.dataset.kind}:${(x.innerText || '').replace(/\s+/g, ' ').trim()}:${x.querySelector('a,span')?.tagName}`);
    const gaps = pills.length - real.length;
    if (!li) return { error: 'no page-day pill on the strip' };
    const a = li.querySelector('a');
    const home = document.querySelector('.home');
    home.dataset.mark = 'x';
    window.scrollTo(0, document.body.scrollHeight);
    const scrollBefore = window.scrollY;
    a.click();
    await new Promise(r2 => setTimeout(r2, 350));
    return {
      pills: pills.length, real: real.length, gaps, links, dead,
      hasHref: a.hasAttribute('href'), href: a.getAttribute('href'),
      liSelf: li.dataset.self ?? null,
      scrollBefore, scrollAfter: window.scrollY,
      remounted: document.querySelector('.home')?.dataset.mark !== 'x',
    };
  });
  ok('game OFF: a page-day pill exists to tap', !r.error, r.error ?? `${r.pills} pills`);
  if (!r.error) {
    ok('game OFF: the page-day pill is a link again', r.hasHref === true && r.href === '#/today', `hasHref=${r.hasHref} href=${r.href}`);
    ok('game OFF: EVERY pill with a destination is focusable again', r.links === r.real, `${r.links} of ${r.real} (+${r.gaps} gap, a <span> in COMPOSED too)${r.dead.length ? ' — not: ' + r.dead.join(', ') : ''}`);
    ok('game OFF: the <li> is no longer marked `self`', r.liSelf === null, `data-self=${r.liSelf}`);
    /* COMPOSED's own behaviour: no handler preventDefaults it, so the browser follows an href that
       is already the current URL — which changes no hash, routes nothing and re-mounts nothing. */
    ok('game OFF: sameRouteClick is inert — tapping it re-mounts nothing', r.remounted === false, `remounted=${r.remounted}`);
    ok('game OFF: …and does not throw the scroll to the top', r.scrollBefore > 200 && r.scrollAfter === r.scrollBefore, `${r.scrollBefore} \u2192 ${r.scrollAfter}`);
  }
  /* THE EXACT SENTENCE THE DELETED `UNGATED` ROW MEASURED: "with the game OFF a tap on the header
     Home glyph re-mounts #/today where COMPOSED did nothing (measured: remounted false \u2192 true)".
     `.hdr-home` is the app shell's, not this strip's, so it is the case no plan-pill fix could
     have covered and the one the gate has to carry. */
  const glyph = await page.evaluate(async () => {
    const a = document.querySelector('.hdr-home');
    if (!a || a.getAttribute('href') !== '#/today') return { error: `hdr-home href=${a?.getAttribute('href') ?? 'absent'}` };
    const home = document.querySelector('.home');
    home.dataset.mark = 'y';
    window.scrollTo(0, document.body.scrollHeight);
    const scrollBefore = window.scrollY;
    a.click();
    await new Promise(r2 => setTimeout(r2, 350));
    return { scrollBefore, scrollAfter: window.scrollY, remounted: document.querySelector('.home')?.dataset.mark !== 'y' };
  });
  ok('game OFF: the header Home glyph is a same-route anchor to tap', !glyph.error, glyph.error ?? 'href=#/today');
  if (!glyph.error) {
    ok('game OFF: tapping it re-mounts nothing (COMPOSED did nothing here)', glyph.remounted === false, `remounted=${glyph.remounted}`);
    ok('game OFF: …and the scroll stays where the student left it', glyph.scrollBefore > 200 && glyph.scrollAfter === glyph.scrollBefore, `${glyph.scrollBefore} \u2192 ${glyph.scrollAfter}`);
  }
  await ctx.close();
}

/* ============================================ 3. the best day, and the switch still a door */
{
  const on = student();
  const off = structuredClone(on);
  off.settings.game = false;                        // ONE student, one seed, one difference

  const read = async (save) => {
    const { ctx, page } = await open(save);
    const r = await page.evaluate(() => ({
      best: document.querySelector('.home-best')?.textContent ?? null,
      bestInsideCta: !!document.querySelector('.home-cta .home-best'),
      label: document.querySelector('.home-primary')?.textContent ?? null,
      sub: document.querySelector('.home-cta-sub')?.textContent ?? null,
      href: document.querySelector('.home-primary')?.getAttribute('href') ?? null,
      jobStrip: !!document.querySelector('.job-strip, [data-slot="pile"]'),
      hour: new Date().getHours(),                  // the clock the PAGE saw, not the one node saw
    }));
    await ctx.close();
    return r;
  };
  const a = await read(on), b = await read(off);
  const digits = (s) => String(s ?? '').match(/\d+/g)?.join(',') ?? '';

  /* the pin took, and it is measured rather than assumed: a probe that silently ran inside the
     22:00 close would print the two HREFs the same and blame the switch for the clock */
  ok('both renders were taken inside the open window',
    a.hour === NOW.getHours() && b.hour === NOW.getHours() && a.hour < QUIET_HOUR,
    `page clock ${a.hour}:00 / ${b.hour}:00 local, quiet hour ${QUIET_HOUR}:00`);

  ok('game ON: Home prints the best day', a.best === `best ${BEST}`, JSON.stringify(a.best));
  ok('…as the engine\'s own number, nothing derived', digits(a.best) === String(BEST), digits(a.best));
  ok('…and not on the button', a.bestInsideCta === false, `inside .home-cta = ${a.bestInsideCta}`);
  ok('game OFF: not a word of it', b.best === null, JSON.stringify(b.best));
  ok('the switch changes the HREF', a.href === '#/run/job' && b.href === '#/run/page', `${a.href} → ${b.href}`);
  ok('…and the button says the same thing either way', a.label === b.label, `${JSON.stringify(a.label)} vs ${JSON.stringify(b.label)}`);
  ok('…and the grey line is byte-identical, seed included', a.sub === b.sub, `${JSON.stringify(a.sub)} vs ${JSON.stringify(b.sub)}`);
  ok('…so the best day is the ONLY thing the switch adds to this screen', a.best !== null && b.best === null && a.label === b.label && a.sub === b.sub);
  ok('and the three-slot play strip is nowhere near Home', a.jobStrip === false && b.jobStrip === false);
}

/* ============================================ how many self-links are left, and whose */
{
  const { ctx, page } = await open(student());
  const left = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter(a => a.href === location.href)
    .map(a => a.id || a.className || a.textContent.trim().slice(0, 16)));
  rows.push(`note  self-href anchors left on #/today: ${left.length ? left.join(', ') : 'none'} (this lane owns none of them — see notes/cut-home.md Requests)`);
  ok('none of them is a plan pill', !left.some(x => String(x).includes('pill')), left.join(', '));
  await ctx.close();
}

await browser.close();
await new Promise(r => server.close(r));
console.log(rows.join('\n'));
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join(' | ')}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
