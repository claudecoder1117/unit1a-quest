// screens/home.js — #/today (COMPOSED S1 "Session", S4 Readiness/Streak/Levels, S7 Weak spots + plan strip).
//
// One primary button that names the next correct action (page.js `nextAction`), the best day under it
// when the game is on (`bestLine` — the one thing the game puts on this screen), the plan strip SLOT
// (T14's plan.js fills `#plan-strip`; a minimal day-pill fallback is drawn here so the screen is never blank),
// weak spots (n ≥ 1 ∧ a miss or a hinted clear ∧ m_shown < 70, at most 5, each with a "Drill 5" link; fix5:home r1 — never-missed skills are "just started"), the Readiness ring (88 px,
// dashed track while provisional), the streak protractor arc (10° per day) and the level ring with its rank.
// On every visit: schedule.js housekeeping (mastery decay, frozen pruning, the daily-goal check), today's
// Readiness logged to forecastLog[], and `setHeader({ readiness, provisional })` for the shell.
//
// Registered in screens/index.js as screens['/today'] = mountHome  →  (params, query, ctx) => (el) => cleanup.

import { h, bus, navigate, setHeader, levelFor, xpForLevel, rankFor, softWrap } from '../app.js';
import { getState, update } from '../store.js';
import { todayISO, daysUntilTest, addDays, weekday, timeHM, isQuietHours, testMoment } from '../days.js';
import { readiness, logForecast, weakSpots, skillStates, startedSkills, coverageCount, sparkline, latestMock } from '../readiness.js';
import { housekeep, dueList } from '../schedule.js';
// CUT-SPEC §6 is the game's whole vocabulary and `data/job.js` is where it lives — a constants file
// with ZERO imports of its own, so this costs Home's cold open one small module and no card or
// generator data. Home uses exactly one entry of it: `COPY.best`. (Static, not lazy: the best day is
// on the first paint or it is not on the screen a student acts from.)
import { COPY } from '../../data/job.js';
// home r2 (visual QA): page.js and plan.js are LAZY. page.js drags data/cards.js (233 KB) + data/templates.js →
// every js/gen/* (311 KB) onto Home's static graph, and a cold 3G-class open measured 7.7 s to the CTA against
// S9 #1's "< 1 s". Home now paints the hero, today's stats, the weak spots and the fallback plan pills from
// readiness.js alone, with a button-shaped CTA placeholder; the composed queue and the S7 plan strip land when
// the two modules resolve (one tick on Wi-Fi / the SW cache). The bindings below are filled by `heavy()`.
let nextAction = null, startPage = null, resumePage = null, bossReady = null;   // page.js
let fillPlanStrip = null, pageOpts = null;                                      // plan.js — T14: the S7 plan fills #plan-strip
let heavyP = null;
const heavyReady = () => nextAction != null && fillPlanStrip != null;
const heavy = () => (heavyP ??= Promise.all([import('../page.js'), import('../plan.js')]).then(([p, pl]) => {
  ({ nextAction, startPage, resumePage, bossReady } = p);
  ({ fillPlanStrip, pageOpts } = pl);
  return true;
}).catch((err) => { console.error('home: page/plan failed to load', err); heavyP = null; return false; }));
// Warm the two screens a fresh student reaches next (the run screen and the card engine) — once, 1.5 s after
// the composed CTA is on screen, so the first tap is instant and nothing races Home's own critical path
// (moved here from screens/index.js in home r2; the SW caches them for the second visit).
let warmed = false;
const warmNext = () => { if (warmed) return; warmed = true; setTimeout(() => { import('./run.js').catch(() => {}); import('./card.js').catch(() => {}); }, 1500); };
if (typeof window !== 'undefined') heavy();   // start the fetch the moment this module evaluates, not after the first render
// W4 integration (notes/T14.md Requests → T10): every Page this screen starts is composed with the PLAN's
// opts, so a lowered day really does get one tier-4 item instead of two (the strip promises it in print).
// THE CUT: the `{ q, ...rest }` line this screen (and run.js) each kept a copy of is now `plan.pageOpts`
// — one implementation, so the three routes that start Today's Page cannot compose three pages.
const planOpts = (save, D) => pageOpts(save, { D });

// The game's one hook: `plan.nextActionFor` points Home's primary button at `#/run/job` when the game
// is on. It is loaded with `heavy()` (plan.js is already in there) and used only if the route exists.
let nextActionFor = null;
let jobRouteOK = false;
const gameReady = () => nextActionFor != null;
let gameP = null;
const gameMods = () => (gameP ??= Promise.all([import('../plan.js'), import('./run.js')])
  .then(([pl, r]) => {
    ({ nextActionFor } = pl);
    jobRouteOK = typeof r.kindMeta === 'function' && r.kindMeta('job') != null;
    return true;
  }).catch((err) => { console.error('home: the game layer failed to load', err); gameP = null; return false; }));

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** The game is on unless the student switched it off in Settings (`plan.gameOn`, without the import:
 *  `plan.js` is a lazy module here and this decision is made on the first paint). */
const gameIsOn = (save) => save?.settings?.game !== false;

/** A real <svg> (SVG namespace) from markup — h('svg') would create an HTMLUnknownElement whose circles never draw. */
function svg(viewBox, inner, attrs = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false"${attrs ? ' ' + attrs : ''}>${inner}</svg>`;
  return t.content.firstElementChild;
}
const RING_R = 40, RING_C = 2 * Math.PI * RING_R;          // 88 px ring, stroke 6
const pct = x => `${Math.round(x * 100)} %`;

/* ---------------- pieces ---------------- */
function readinessRing(rd) {
  const off = RING_C * (1 - rd.r / 100);
  return h('div.rd-ring', { role: 'img', 'aria-label': `Readiness ${rd.r}${rd.provisional ? ' (provisional)' : ''} — ${rd.band.label}`, dataset: { provisional: String(rd.provisional), band: rd.band.key } },
    svg('0 0 88 88', `<circle class="rd-track" cx="44" cy="44" r="${RING_R}"/>` +
      `<circle class="rd-fill" cx="44" cy="44" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" data-empty="${rd.r <= 0}"/>`),
    h('span.rd-num.mono', String(rd.r)),
  );
}

function streakArc(streak) {
  const deg = Math.min(180, streak.count * 10);
  const a = Math.PI * deg / 180, cx = 40, cy = 40, R = 32;
  const ex = cx - R * Math.cos(a), ey = cy - R * Math.sin(a);
  const d = deg <= 0 ? '' : `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  const ticks = [];
  for (let t = 0; t <= 180; t += 30) {
    const ta = Math.PI * t / 180, x1 = cx - (R + 4) * Math.cos(ta), y1 = cy - (R + 4) * Math.sin(ta), x2 = cx - (R + 8) * Math.cos(ta), y2 = cy - (R + 8) * Math.sin(ta);
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  const label = streak.count > 0 ? `${streak.count} day${streak.count === 1 ? '' : 's'}` : `0 (best ${streak.best})`;
  return h('div.stat.stat-streak', { role: 'img', 'aria-label': `Streak ${label}` },
    svg('0 0 80 46', `<path class="arc-track" d="M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}"/>` +
      `<g class="arc-ticks">${ticks.join('')}</g>` +
      `<path class="arc-fill" d="${d}"/>` +
      `<line class="arc-base" x1="4" y1="${cy}" x2="76" y2="${cy}"/>` +
      `<circle class="arc-pivot" cx="${cx}" cy="${cy}" r="2.5"/>`),
    h('span.stat-num.mono', streak.count > 0 ? String(streak.count) : `0`),
    h('span.stat-label.muted', streak.count > 0 ? 'day streak' : `streak · best ${streak.best}`),
  );
}

function levelRing(xp) {
  const L = levelFor(xp), lo = xpForLevel(L), hi = xpForLevel(L + 1);
  const p = Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
  const C = 2 * Math.PI * 20;
  return h('div.stat.stat-level', { role: 'img', 'aria-label': `Level ${L} ${rankFor(L)}, ${Math.round(xp - lo)} of ${hi - lo} XP to level ${L + 1}` },
    h('div.lv-ring',
      svg('0 0 48 48', `<circle class="lv-track" cx="24" cy="24" r="20"/>` +
        `<circle class="lv-fill" cx="24" cy="24" r="20" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - p)).toFixed(2)}" data-empty="${p <= 0}"/>`),
      h('span.lv-num.mono', String(L))),
    h('span.stat-num', rankFor(L)),
    h('span.stat-label.muted.mono', `${Math.round(xp - lo)} / ${hi - lo} XP`),
  );
}

function goalMeter(state, today) {
  const d = state.daily?.[today] ?? {};
  const goal = state.settings?.dailyGoal ?? 400;
  const xp = d.xp ?? 0;
  const p = Math.max(0, Math.min(1, xp / goal));
  return h('div.stat.stat-goal',
    h('div.goal-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(xp), 'aria-label': 'Daily goal' },
      h('div.goal-fill', { style: { transform: `scaleX(${p})` }, dataset: { met: String(d.goalMet === true) } })),
    h('span.stat-num.mono', `${xp} / ${goal}`),
    h('span.stat-label.muted', d.goalMet ? 'goal met · today' : `XP today · ${d.clears ?? 0} clear${(d.clears ?? 0) === 1 ? '' : 's'}`),
  );
}

/** Fallback plan pills — T14 replaces the contents of #plan-strip (data-slot="plan"). */
function planStrip(state, today, D) {
  const wrap = h('div#plan-strip.plan-strip', { dataset: { slot: 'plan', owner: 'T14' }, 'aria-label': 'Study plan' });
  if (D == null) {
    wrap.append(h('p.muted.fs-1', 'No test date — pages run at 12 new a day. ', h('a', { href: '#/settings' }, 'Set the test date'), ' to see the plan.'));
    return wrap;
  }
  if (D < 0) { wrap.append(h('p.muted.fs-1', 'The test is done. The Binder, Bosses and Mock stay open.')); return wrap; }
  const span = Math.min(D, 9);
  // pill k = "k days until the test" on that day; its calendar date is today + (D − k); today is k = D
  const list = h('ol.plan-pills');
  for (let k = span; k >= 0; k--) {
    const iso = addDays(today, D - k);
    const done = !!state.daily?.[iso]?.goalMet;
    const isToday = k === D;
    const label = k === 0 ? 'Test' : k === 1 ? 'Night' : `D−${k}`;
    const sub = `${DOW[weekday(iso)]} ${iso.slice(8)}`;
    // A page-day pill's destination is `#/today` — the screen it is drawn on, so it is a link to
    // here. `plan.hereNow` carries the reason those get NO href WHILE THE GAME IS ON: `app.js`
    // installs a global same-route click handler that re-mounts the screen and throws the scroll back
    // to the top, so a decorative self-link would cost a student their place in the weak-spot list.
    // `mountHome` IS the `/today` screen, so the test here is simply "is this an ordinary page day".
    // GATED (round-3 integration, and `plan.pillsFor` gates the same rule the same way): with the
    // game OFF that handler returns immediately, there is nothing to hide the pill from, and the
    // href comes back — CUT-BRIEF's "settings.game = false returns the app to byte-identical
    // COMPOSED behaviour", which is the shape COMPOSED shipped.
    const href = k === 0 ? '#/morning' : k === 1 ? '#/night' : gameIsOn(state) ? null : '#/today';
    const data = { state: done ? 'done' : isToday ? 'today' : k < D ? 'planned' : 'past', kind: k <= 1 ? 'fixed' : 'page' };
    if (!href) data.self = 'true';
    list.append(h('li.plan-pill', { dataset: data, 'aria-current': isToday ? 'date' : null, 'aria-label': href ? null : `${iso} · ${label}` },
      h('a', { href, title: iso }, h('span.pill-day', label), h('span.pill-sub.mono', sub))));
  }
  wrap.append(list);
  return wrap;
}

/* TONIGHT'S BOARD IS GONE (notes/DEMOLISH.md). It rendered eleven numbers before a single question
   was asked, and designs/CUT-BRIEF.md deletes every mechanic behind them. Nothing replaces it: the
   game IS Today's Page, so Home's primary button stays `page.nextAction`'s. */

/* ==========================================================================================
   THE ONE LINE THE GAME PUTS ON HOME (designs/CUT-BRIEF.md, designs/CUT-SPEC.md §6)
   ==========================================================================================
   The game's entire reward is that a point buys nothing but beating `save.player.best`. That number
   used to be printed in exactly one place — the session-over screen, straight after `bank()` had
   already raised it to today's total — so on the first session it read your own score back to you,
   and after that it was invisible until the next session ended. `save.game.today` rolls to 0 at
   midnight. The brief asks "would you open it again tomorrow?" and the app had no in-product answer:
   nothing on Home said you were here yesterday, and nothing said what there is to beat.

   So Home prints the best day, and NOTHING else the game owns:

     · one line, one number, and that number is `save.player.best` verbatim — exactly what
       `job/state.js bank()` wrote, not a total, not a scaled one, not one with a factor baked in;
     · the string is `COPY.best` out of `data/job.js` — CUT-SPEC §6's own words, so this screen
       cannot invent vocabulary;
     · `settings.game === false` prints nothing at all (the switch is a door), and a student who has
       never banked a point sees no number either — there is no "best 0";
     · it is NOT on the button. The CTA below is still byte-identical with the switch on and off.

   The hard limit it must not touch is "at most three numbers on screen at once DURING PLAY". Home
   is not play; the game strip is the three numbers, and this line never appears beside them.
   ========================================================================================== */

/**
 * The best day, as one line — or `null` when there is nothing to say.
 * @param {object} save
 * @returns {string|null}  e.g. `best 612`
 */
export function bestLine(save) {
  if (save?.settings?.game === false) return null;          // the switch is a door: no game, no line
  const best = save?.player?.best;
  if (!Number.isInteger(best) || best <= 0) return null;    // never banked a point → no number
  return COPY.best({ points: best });
}

/* ==========================================================================================
   THE PRIMARY BUTTON'S LABEL AND SUB-LINE (designs/CUT-BRIEF.md, designs/CUT-SPEC.md)
   ==========================================================================================
   Pure, so the one rule that matters is checkable without a browser: THE GAME ADDS NO WORD AND NO
   NUMBER TO THE BUTTON. A `job` action is a `page` action pointed at a different route — same
   composed page, same label, same sub-line — so `ctaLabel` and `ctaSub` treat the two kinds as one
   and read nothing the game owns. There is no pile here, no streak, no points and no `policy.why`.
   ========================================================================================== */

/** A page-shaped action: the flat page, or the same page with the game's top strip over it. */
const pageOf = (act) => (act && (act.kind === 'page' || act.kind === 'job') ? act.page ?? null : null);

/** home r1: past this many characters the 56 px button wraps to two lines at 375. */
export const CTA_LABEL_MAX = 24;

/** Minutes a queue is expected to take, by tier (the estimate the sub-line prints). */
export const EST_MIN = Object.freeze({ 1: 0.5, 2: 1.5, 3: 3, 4: 5 });
export const estMinutes = (queue) => Math.round((Array.isArray(queue) ? queue : []).reduce((t, it) => t + (EST_MIN[it?.tier] ?? 1.5), 0));

/**
 * The button's text, and the breakdown that moves to the sub-line when it will not fit.
 * @returns {{label:string, breakdown:(string|null)}}
 */
export function ctaLabel(act) {
  const label = String(act?.label ?? '');
  const page = pageOf(act);
  if (!page || label.length <= CTA_LABEL_MAX) return { label, breakdown: null };
  return { label: `RUN NEXT · ${page.queue.length} items`, breakdown: label.replace(/^RUN NEXT · /, '') };
}

/**
 * The grey line under the button, as an array of segments joined by ' · '. Every number in it is the
 * study layer's own — the queue's length, its estimate, its seed, the items it carries.
 * @param {object} act  `page.nextAction`'s action, or `plan.nextActionFor`'s
 * @param {{breakdown?:string|null, inProgress?:object|null}} ctx
 * @returns {string[]}
 */
export function ctaSub(act, { breakdown = null, inProgress = null } = {}) {
  const out = [];
  const page = pageOf(act);
  if (page) {
    // home r2: the "plan wants N new a day — holding at 12" line is gone — meta.q IS the held target, so it
    // could only ever print 12 vs 12 while the strip beneath said 18 (S9 #10). The strip's warn line is the
    // one statement. A `job` action falls here too: the game re-skins this page, it does not re-describe it.
    if (breakdown) out.push(breakdown);
    const carried = page.meta?.carried ?? [];
    out.push(`~${estMinutes(page.queue)} min`, `seed ${page.meta?.seedTag}`);
    if (carried.length) out.push(`${carried.length} hard item${carried.length === 1 ? '' : 's'} carried to the next page`);
    return out;
  }
  const kind = act?.kind;
  if (kind === 'resume' && inProgress) {
    out.push(`started ${new Date(inProgress.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      `${inProgress.queue.filter(q => q.done).length} answered`);
  } else if (kind === 'warmup') out.push('3 short screens, every one skippable · a placement earns XP');
  else if (kind === 'night') out.push('30 minutes: notation flash · final sweep · mini-mock · the sheet');
  else if (kind === 'morning') out.push('5 minutes of things you already know, then Go.');
  else if (kind === 'mock') out.push('20 items · 40 min · locks Readiness');
  else if (kind === 'boss') out.push('6 items · 3 hearts · no hints');
  else if (kind === 'missed') out.push('every original you did not get first try, until you do');
  return out;
}

/** fix5:home r2 — the grey line's phrases: "Just started" is only true below 3 answers; past that it is "no misses yet". */
export function startedPhrases(started) {
  const names = list => `${list.slice(0, 5).map(s => s.name).join(' · ')}${list.length > 5 ? ` · +${list.length - 5}` : ''}`;
  const fresh = started.filter(s => s.n < 3), more = started.filter(s => s.n >= 3);
  const out = [];
  if (fresh.length) out.push(`Just started, no misses yet: ${names(fresh)}`);
  if (more.length) out.push(`No misses yet, still under 70: ${names(more)}`);
  return out;
}

/** fix5:home r2 — the empty state names the next step the CTA actually offers, not always "take the Baseline". */
export function weakEmptyLine(kind, { locked = false } = {}) {
  if (kind === 'resume') return 'No weak spots yet — finish the page and they show up here.';
  if (kind === 'mock') return 'No weak spots yet — the Mock will find them.';
  if (kind === 'night' || kind === 'morning') return 'No weak spots on record.';
  if (locked) return 'No weak spots right now — nothing you have missed is under 70.';
  return 'No weak spots yet — take the Baseline or run a Page.';
}

function weakList(state, kind = null) {
  const ws = weakSpots(state);
  const sec = h('section.card.home-weak', { 'aria-labelledby': 'weak-h' }, h('h2#weak-h.fs-3', 'Weak spots'));
  // fix5:home r1 (S9 scorecard #1): a skill answered right but only once or twice reads m_shown 7 — that is the
  // m = 0 starting point, not a verdict. Weak spots need a wrong answer (or, r2, a hinted clear); these get a grey line.
  const phrases = startedPhrases(startedSkills(state));
  const startedLine = phrases.length
    ? h('p.muted.fs-1.weak-started', { dataset: { tone: 'started' } }, phrases.join('. '))
    : null;
  if (!ws.length) {
    sec.append(h('p.muted.empty', weakEmptyLine(kind, { locked: latestMock(state) != null })));
    if (startedLine) sec.append(startedLine);   // DOM append() would print a null as the text "null"
    return sec;
  }
  sec.append(h('ul.weak-list', ws.map(w => h('li.weak-row',
    h('div.weak-main',
      h('span.weak-name', ...softWrap(w.name)),   // ticket FINAL: break after '/', never inside "Never"
      h('span.skill-bar', { 'aria-hidden': 'true' }, h('span.skill-fill', { style: { transform: `scaleX(${Math.max(0.02, w.mShown / 100)})` } }))),
    h('span.weak-m.mono', { 'aria-label': `mastery ${Math.round(w.mShown)}` }, String(Math.round(w.mShown))),
    h('a.btn.btn-drill', { href: w.drill }, 'Drill 5'),
  ))));
  if (startedLine) sec.append(startedLine);
  return sec;
}

function skillRail(state) {
  const rail = h('aside.rail.home-rail', { 'aria-labelledby': 'skills-h' }, h('h2#skills-h.fs-3', 'Skills'));
  const list = h('ul.skill-list');
  for (const s of skillStates(state)) {
    const tone = s.untested ? 'untested' : s.mastered ? 'mastered' : s.weak ? 'weak' : s.started ? 'started' : 'ok';   // fix5:home r1
    list.append(h('li.skill-row', { dataset: { tone } },
      h('span.skill-name', ...softWrap(s.name), s.placed ? h('span.skill-tag.mono', { title: 'placed' }, ' ·placed') : null),
      h('span.skill-bar', { 'aria-hidden': 'true' }, h('span.skill-fill', { style: { transform: `scaleX(${s.untested ? 0 : Math.max(0.02, s.mShown / 100)})` } })),
      h('span.skill-m.mono', s.untested ? '—' : String(Math.round(s.mShown))),
    ));
  }
  rail.append(list, h('p.muted.fs-1', 'Greyed skills are untested or have no misses yet — a skill is weak only after a wrong answer or a hint.'));
  return rail;
}

function heroBlock(state, rd, today) {
  const cov = coverageCount(state);
  const D = daysUntilTest(state.settings?.testDate, today);
  // home r2: while provisional the number rests on N of 19 skills — a 2-answer quit and an 8/8 ace both read 57,
  // so the hero says over how many (the summary and Settings already did; this is where the number lives all week).
  const mockLine = rd.provisional
    ? h('p.rd-note.muted.fs-1', `provisional · ${rd.tested} of ${rd.skillsTotal} skills tested — take a Mock to lock\u00a0it`)
    : h('p.rd-note.muted.fs-1', `locked by ${rd.mock.kind === 'mock' ? 'Mock' : rd.mock.kind === 'baseline' ? 'Baseline' : 'Night Before'} · ${pct(rd.mock.accuracy)}`);
  const spark = sparkline(state, 7);
  const sparkEl = spark.length >= 2 ? sparklineSvg(spark) : null;
  return h('section.card.home-hero', { 'aria-labelledby': 'rd-h' },
    readinessRing(rd),
    h('div.hero-text',
      h('p#rd-h.eyebrow.muted', 'Readiness'),
      h('p.rd-band', { dataset: { band: rd.band.key } }, rd.band.label),
      mockLine,
      // home r2: nowrap terms (the line wraps only at a separator) and no T−N — the header chip shows it.
      h('p.rd-terms.mono.fs-1.muted',
        // fix5:home r1: provisional M no longer averages every tested skill (a just-started one counts only where it
        // raises it), so "of N tested" would misstate it — the note line above already says how many are tested.
        h('span.rd-term', rd.provisional && rd.tested === 0 ? 'no skill tested yet' : `mastery ${pct(rd.M)}`), ' · ',
        h('span.rd-term', `binder ${cov.cleared}/${cov.total}`)),
      sparkEl,
    ),
  );
}

function sparklineSvg(points) {
  const w = 96, hgt = 24, n = points.length;
  const xs = i => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 4) + 2);
  const ys = r => hgt - 2 - (Math.max(0, Math.min(100, r)) / 100) * (hgt - 4);
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${xs(i).toFixed(1)} ${ys(p.r).toFixed(1)}`).join(' ');
  // home r1: a bare 96×24 stroke read as a rendering glitch — a baseline, an end dot and a caption make it a chart.
  const first = points[0].r, last = points[n - 1].r;
  return h('div.rd-spark', { role: 'img', 'aria-label': `Readiness over the last ${n} days: ${points.map(p => p.r).join(', ')}` },
    // integration r2: at 375 the fixed 96 px chart + nowrap caption overran the hero column (the "22 → 38" spilled
    // past the card). preserveAspectRatio="none" lets the svg shrink sideways only; non-scaling strokes keep the
    // 2 px line, and the end dot is a round-capped zero-length stroke (the Stats sparkline's trick) so it never
    // squashes into an ellipse.
    svg(`0 0 ${w} ${hgt}`,
      `<line class="spark-base" x1="2" y1="${hgt - 2}" x2="${w - 2}" y2="${hgt - 2}"/>` +
      `<path d="${d}"/>` +
      `<path class="spark-dot" d="M ${xs(n - 1).toFixed(1)} ${ys(last).toFixed(1)} h 0.01"/>`,
      'preserveAspectRatio="none"'),
    h('span.spark-cap.mono', `${n} day${n === 1 ? '' : 's'} · ${first} → ${last}`));
}

/* ---------------- the screen ---------------- */
function render(el, state, today) {
  const rd = readiness(state);
  setHeader({ readiness: rd.r, provisional: rd.provisional });
  const D = daysUntilTest(state.settings?.testDate, today);
  if (!heavyReady()) { renderLight(el, state, rd, today, D); heavy().then((ok) => { if (el.isConnected) render(el, getState(), todayISO()); if (ok) warmNext(); }); return; }
  const composeWith = planOpts(state, D);                           // W4: the S7 plan's tier-4 cap
  const now = Date.now();
  const on = gameIsOn(state);
  if (on && !gameReady()) gameMods().then(() => { if (el.isConnected) render(el, getState(), todayISO()); });
  let act = nextAction(state, { today, compose: composeWith });
  if (on && gameReady() && jobRouteOK) act = nextActionFor(state, act, { today, now });
  const ip = resumePage(state);
  const boss = bossReady(state)[0] ?? null;
  // W4 integration (notes/T12.md Requests → T10): the intro is worth reading ONCE. After the student has
  // a run of that boss on the save, link straight into the fight (`?start=1`); the plain link still
  // resumes an interrupted run, which is why it stays the first-time link.
  const bossHref = (id) => `#/boss/${id}${(state.runs ?? []).some(r => r?.kind === `boss:${id}`) ? '?start=1' : ''}`;

  // home r1: a long breakdown ('RUN NEXT · 17 reviews + 4 new + 4 variants') wraps to two lines in the 56 px
  // button at 375; past ~24 chars the button says the count and the breakdown moves to the sub-line.
  const { label: baseLabel, breakdown } = ctaLabel(act);
  // THE CUT: a `job` action falls into ctaSub's PAGE arm — the game contributes no word and no number
  // to this screen. The old build printed `act.policy.why` here ("the game is Today's Page with a
  // different top strip"), which quoted the design document at the student.
  const sub = ctaSub(act, { breakdown, inProgress: ip });
  const primaryHref = act.kind === 'boss' && boss ? bossHref(boss.id) : act.href;
  const primary = h('a.btn.btn-primary.home-primary', { href: primaryHref, dataset: { kind: act.kind } }, baseLabel);
  const subP = h('p.home-cta-sub.muted.fs-1');
  const cta = h('div.home-cta', primary);
  /** Paint the CTA's sub-line. */
  function paintCta() {
    primary.textContent = baseLabel;
    primary.href = primaryHref;
    const lines = sub.filter(Boolean);
    subP.textContent = lines.join(' · ');
    if (lines.length === 0) subP.remove();
    else if (subP.parentNode !== cta) cta.append(subP);
  }
  primary.addEventListener('click', (ev) => {
    if (act.kind !== 'page') return;
    ev.preventDefault();
    update(s => { startPage(s, planOpts(s, D)); });          // W4: honour the plan's lowering
    navigate('/run/page');
  });

  const secondary = h('nav.home-links', { 'aria-label': 'More' },
    act.kind !== 'page' && act.kind !== 'resume' && D !== 0 && D !== 1 ? h('a.btn', { href: '#/run/page', onclick: (ev) => { ev.preventDefault(); update(s => { startPage(s, planOpts(s, D)); }); navigate('/run/page'); } }, 'Run a page') : null,
    ip && act.kind !== 'resume' ? h('a.btn', { href: '#/run/page' }, 'Continue page') : null,
    boss && act.kind !== 'boss' ? h('a.btn', { href: bossHref(boss.id) }, `Boss: ${boss.name}`) : null,
    h('a.btn', { href: '#/binder' }, 'Binder'),
    // fix5:home r1 (S9 scorecard #5): when the primary button IS the Mock, it is the one Mock entry point.
    act.kind !== 'mock' ? h('a.btn', { href: '#/mock' }, 'Mock') : null,
    h('a.btn', { href: '#/stats' }, 'Stats'),
    h('a.btn', { href: '#/sheet' }, 'Sheet'),
  );

  paintCta();
  const best = bestLine(state);
  const col = h('div.col',
    heroBlock(state, rd, today),
    cta,
    best ? h('p.home-best.muted.fs-1.mono', { dataset: { slot: 'best' } }, best) : null,
    fillPlanStrip(planStrip(state, today, D), state, { today, hideMock: act.kind === 'mock' }),   // T14 (the call below is the fallback); fix5:home r1 — no second Mock link under a Mock CTA
    h('section.card.home-today', { 'aria-label': 'Today' }, goalMeter(state, today), streakArc(state.streak ?? { count: 0, best: 0 }), levelRing(state.xp ?? 0)),
    weakList(state, act.kind),
    secondary,
  );
  // NOT `.screen` (that caps the whole grid at 680 px) — `.with-rail` lays out the 680 column + 320 rail (T01)
  el.replaceChildren(h('section.home.with-rail', { 'aria-label': 'Today' }, col, skillRail(state)));
  // J11 pass 2: the posted numerals land in the nodes pass 1 already sized. No spinner, no reflow.
}

/** home r2: the first paint — everything readiness.js can say, plus a CTA placeholder and the fallback plan pills. */
function renderLight(el, state, rd, today, D) {
  const primary = h('span.btn.btn-primary.home-primary', { role: 'status', 'aria-busy': 'true', dataset: { kind: 'loading' } }, 'Loading today’s page…');
  const secondary = h('nav.home-links', { 'aria-label': 'More' },
    h('a.btn', { href: '#/binder' }, 'Binder'), h('a.btn', { href: '#/mock' }, 'Mock'), h('a.btn', { href: '#/stats' }, 'Stats'), h('a.btn', { href: '#/sheet' }, 'Sheet'));
  const best = bestLine(state);
  const col = h('div.col',
    heroBlock(state, rd, today),
    h('div.home-cta', primary),
    best ? h('p.home-best.muted.fs-1.mono', { dataset: { slot: 'best' } }, best) : null,
    planStrip(state, today, D),
    h('section.card.home-today', { 'aria-label': 'Today' }, goalMeter(state, today), streakArc(state.streak ?? { count: 0, best: 0 }), levelRing(state.xp ?? 0)),
    weakList(state),
    secondary,
  );
  el.replaceChildren(h('section.home.with-rail', { 'aria-label': 'Today', dataset: { loading: 'true' } }, col, skillRail(state)));
}

/** screens['/today'] — (params, query, ctx) => (el) => cleanup */
export function mountHome() {
  return (el) => {
    const today = todayISO();
    // housekeeping + today's forecast point, once per visit, BEFORE subscribing (so the write never re-triggers
    // itself) — and only written when something actually changed (a Home visit must not dirty the save).
    const probe = structuredClone(getState());
    const r = housekeep(probe, { today });
    const f = logForecast(probe, { today });
    if (r.decayed || r.pruned || f.changed || JSON.stringify(probe.daily?.[today]) !== JSON.stringify(getState().daily?.[today])) {
      update(s => { housekeep(s, { today }); logForecast(s, { today }); });
    }
    render(el, getState(), today);
    const off = bus.on('state', (s) => { if (el.isConnected) render(el, s, todayISO()); });
    return () => { off(); };
  };
}

export default mountHome;
