// screens/home.js — #/today (COMPOSED S1 "Session", S4 Readiness/Streak/Levels, S7 Weak spots + plan strip).
//
// One primary button that names the next correct action (page.js `nextAction`), the plan strip SLOT
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
// J11 — TONIGHT'S BOARD, painted in two passes (G7). `data/job.js` has ZERO imports and `job/econ.js`
// imports only xp / schedule / data-job, so neither puts a byte of data/cards.js (233 KB) or
// data/templates.js (311 KB) on Home's static graph — which is the whole point of home-r2's rule.
// NO SHAPE TABLE HERE (r3). Home used to carry a `PUBLISHED.shapeTable` shim so pass 1 could print
// `~N min` and the projected split from the published row. It cannot: the row is the brochure, and
// the board the student takes is 2–6 minutes and 9–13 points away from it (see the board header
// below). `SHAPES[id].targets` is still read — for the row-count reserve, which is not a promise
// about tonight's clock. The 22:00 refusal is the only place the table still decides anything in
// pass 1, it lives in `plan.refuseFor`, and `render()` re-decides it against `board.endsAt`.
import { WEEK, SHAPES, BOARD, WINGS, WING_IDS, WING_OF_SKILL, COPY } from '../../data/job.js';
// home r2 (visual QA): page.js and plan.js are LAZY. page.js drags data/cards.js (233 KB) + data/templates.js →
// every js/gen/* (311 KB) onto Home's static graph, and a cold 3G-class open measured 7.7 s to the CTA against
// S9 #1's "< 1 s". Home now paints the hero, today's stats, the weak spots and the fallback plan pills from
// readiness.js alone, with a button-shaped CTA placeholder; the composed queue and the S7 plan strip land when
// the two modules resolve (one tick on Wi-Fi / the SW cache). The bindings below are filled by `heavy()`.
let nextAction = null, startPage = null, resumePage = null, bossReady = null;   // page.js
let fillPlanStrip = null, composeOpts = null;                                   // plan.js — T14: the S7 plan fills #plan-strip
let heavyP = null;
const heavyReady = () => nextAction != null && fillPlanStrip != null;
const heavy = () => (heavyP ??= Promise.all([import('../page.js'), import('../plan.js')]).then(([p, pl]) => {
  ({ nextAction, startPage, resumePage, bossReady } = p);
  ({ fillPlanStrip, composeOpts } = pl);
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
// `q` is deliberately NOT forwarded: page.js derives the identical target from its own qFor (pinned in
// tests/integration-w4.test.mjs), while an EXPLICIT q switches off page.js's session budget — which turned
// a 25-item page into a 33-item, 44-minute one. The day's target spreads over the day's Pages (S1).
const planOpts = (save, D) => { const { q, ...rest } = composeOpts(save, { D }); return rest; };

// J11 — pass 2's modules. Deliberately NOT part of `heavy()`: the board's numerals may arrive after the
// primary button and must never be able to delay it. `job/board.js` reaches page.js (already in
// `heavy()`), `job/crew.js` is the cold-crew strip's idle rule.
let postBoard = null, crewIdleFor = null, crewOf = null, nextActionFor = null, payCleanGetaway = null, refuseFor = null;
/* The tell hook `screens/job.js` posts with. Home must post with the SAME one or the posted value the
   student reads here is re-priced the moment the job screen opens (G1 law 4; notes/J13.md Request 2).
   `job/board.js` already imports `data/cards.js`, so `byId` costs pass 2 nothing new. */
let tellHookFor = null;
let boardP = null;
const boardReady = () => postBoard != null && nextActionFor != null;
let jobRouteOK = false;      // J6 owns run.js's `job` KIND_META entry; until it lands, no primary points at it
const boardMods = () => (boardP ??= Promise.all([import('../job/board.js'), import('../job/crew.js'), import('../plan.js'), import('./run.js'), import('../job/index.js'), import('../../data/cards.js')])
  .then(([b, c, pl, r, ix, cards]) => {
    postBoard = b.postBoard;
    ({ isIdleFor: crewIdleFor, crewOf } = c);
    ({ nextActionFor, payCleanGetaway, refuseFor } = pl);
    jobRouteOK = typeof r.kindMeta === 'function' && r.kindMeta('job') != null;
    tellHookFor = (save) => ix.tellHookFor(save, { cards: cards.byId });
    return true;
  }).catch((err) => { console.error('home: the board layer failed to load', err); boardP = null; return false; }));

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
    const href = k === 0 ? '#/morning' : k === 1 ? '#/night' : '#/today';
    list.append(h('li.plan-pill', { dataset: { state: done ? 'done' : isToday ? 'today' : k < D ? 'planned' : 'past', kind: k <= 1 ? 'fixed' : 'page' }, 'aria-current': isToday ? 'date' : null },
      h('a', { href, title: iso }, h('span.pill-day', label), h('span.pill-sub.mono', sub))));
  }
  wrap.append(list);
  return wrap;
}

/* ==========================================================================================
   J11 — TONIGHT'S BOARD, in two passes (COMPOSED-GAME G5 "the week", G7 "Home paints the board in
   two passes", G10 #21 "the test wins").

   PASS 1 is static: `store` + `schedule.dueList` + `data/job.js`'s constants. It paints the week
   state, the row frame and the counts the SAVE alone settles (the dues, the days cold, whether a
   cold-crew box is possible). Everything it CANNOT know without `data/cards.js` — a contract's
   label, its wing, its lock count, its posted value, the per-wing supply numeral, the idle-crew
   count, AND the whole of the meta line (the shape, `~N min`, `ends HH:MM`, the projected split) —
   is a `--muted` placeholder occupying its final width, so pass 2 changes ink and never geometry.
   There is no spinner and no `aria-busy` on the panel: pass 1 is a real, readable board, not a
   loading state.

   NO PROJECTION IN PASS 1 (r3, finding "Home's pass-1 board prints the brochure's split"). Pass 1
   used to print `PUBLISHED.shapeTable`'s row — the brochure — under the board's own
   `~N % game · projected` / `your last N jobs` sentence, and a raw `Σ tGame / Σ (tGame + tAnswer)`
   over the last five log entries when the ledger had them: the round-1 estimator `job/board.js`
   deleted for being shape-blind. Measured over 16 (seed × ledger) boards on this tree, pass 1 and
   the pass 2 that replaces it disagreed by up to **13 points of split** and **6 minutes** (a 1.46×
   wall clock), and on 2 of the 16 they did not even name the same SHAPE (pass 1 guessed JOB where
   `board.shapeFor` posts a VAULT for a ready boss). The brochure row is worse still per shape: RUN
   publishes ~7 min · 51 % against real boards of 10–12 min · 29–33 %. G1 statement 1 is "the board
   prints your own number, not the brochure's", so pass 1 now prints NO number it cannot derive from
   the student's own draft, and `fillBoard` is the only producer of `.b-shape`, `.b-min`, `.b-ends`
   and `.b-split`. When `weekGate` itself names the shape (review / school) that name IS derivable
   and pass 1 prints it; otherwise the shape is pass 2's too.

   PASS 2 (`fillBoard`) runs after `job/board.js` resolves and writes the numerals in place.

   `weekGate()` is the static half of `plan.boardPolicy()`. Two implementations exist because Home may
   not import plan.js (home-r2.test.mjs, G10 #21) and pass 1 must decide whether a board posts at all;
   `tests/job-week.test.mjs` pins them equal over every (D × weekday × minute) the week contains — the
   same device `plan.qFor` / `page.qFor` already use.
   ========================================================================================== */

/** Row height reserved per contract line, px. The panel reserves `BOARD.postedMax` of them so a thin
 *  board in pass 2 moves nothing below it. css/job.css (J6/J12) replaces the inline reservation. */
export const BOARD_ROW_PX = 40;   // a contract row wraps to two lines at 375 px until css/job.css lands
/** page.js `postedCountFor`, re-stated for pass 1 (pinned equal to it by the suite). */
export const postedCountEstimate = (n) => (n <= 0 ? 0 : n <= 3 ? 1 : n <= 5 ? 2 : n <= 7 ? 3 : n <= 9 ? 4 : BOARD.postedMax);
/** plan.js `REVIEW_SHAPE` — D = 2 posts the JOB shape, never a VAULT and never JOB12 (pinned by the suite). */
export const REVIEW_SHAPE = 'JOB';
/** plan.js `QUIET_READINESS` — G2's terminus (pinned equal to it by the suite). */
export const QUIET_READINESS = 88;
/** plan.js `CREW_HELD` — the crew rank G2 calls "held" (`job/crew.js HELD`). */
export const CREW_HELD = 2;

/**
 * plan.js `terminusFor`, for the static pass. G2: "At `crew held ∧ Readiness ≥ 88` the board stops
 * leading with a job: `Board quiet · Readiness 89 · 0 due` — with the job still one tap away."
 * `readiness` and `dueList` are already on Home's static graph (the hero and the board model both use
 * them) and `WING_OF_SKILL` comes from `data/job.js`, which has zero imports — so this costs the cold
 * open nothing, which is why pass 1 may decide it at all.
 */
export function terminusStatic(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  let r = 0;
  try { r = readiness(save).r; } catch { r = 0; }
  const raw = save?.game?.crew;
  const wings = new Set();
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [make, rank] of Object.entries(raw)) {
      if (rank === CREW_HELD && WING_OF_SKILL[make]) wings.add(WING_OF_SKILL[make]);
    }
  }
  const crew = wings.size >= WING_IDS.length;
  if (r < QUIET_READINESS || !crew) return { quiet: false, readiness: r, due: 0, crew };
  let due = 0;
  try { due = dueList(save, { now, today }).length; } catch { due = 0; }
  return { quiet: due === 0, readiness: r, due, crew };
}

const gameIsOn = (save) => save?.settings?.game !== false;
const minuteOfDay = (d) => d.getHours() * 60 + d.getMinutes();

/** The static half of `plan.modeFor` — days.js only, no plan.js (S7's five modes). */
export function modeStatic(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const D = daysUntilTest(save?.settings?.testDate, today);
  if (D == null) return 'nodate';
  if (D < 0) return 'post';
  const st = save?.settings ?? {};
  const at = st.testDate ? testMoment(st.testDate, st.testTime || '08:00') : null;
  if (D === WEEK.morningD) return at != null && now > at + 90 * 60 * 1000 ? 'post' : 'morning';
  if (D === WEEK.nightD) return 'night';
  return 'page';
}

/**
 * weekGate(save, opts) → `{ on, post, kind, shape, D, mode, quiet, school }`, the same decision
 * `plan.boardPolicy` makes, from the static graph only.
 */
export function weekGate(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const d = new Date(now);
  const D = daysUntilTest(save?.settings?.testDate, today);
  const mode = modeStatic(save, { now, today });
  const quiet = isQuietHours(d);
  const school = WEEK.schoolWindow.days.includes(d.getDay())
    && minuteOfDay(d) >= WEEK.schoolWindow.fromMin && minuteOfDay(d) < WEEK.schoolWindow.toMin;
  const base = { on: gameIsOn(save), post: false, kind: 'off', shape: null, D, mode, quiet, school };
  if (!base.on) return base;
  if (quiet) return { ...base, kind: 'closed' };
  if (mode === 'nodate') return { ...base, kind: 'nodate' };
  if (mode === 'post') return { ...base, kind: 'post' };
  if (mode === 'morning') return { ...base, kind: 'morning', post: true };
  if (mode === 'night') return { ...base, kind: 'night' };
  if (D === WEEK.reviewBoardD) return { ...base, kind: 'review', post: true, shape: school ? 'RUN' : REVIEW_SHAPE };
  if (school) return { ...base, kind: 'school', post: true, shape: 'RUN' };
  // G2's terminus, ahead of the ordinary evening board — `plan.boardPolicy` branch 5b.
  const term = terminusStatic(save, { now, today });
  if (term.quiet) return { ...base, kind: 'quiet', post: false, shape: null, readiness: term.readiness, due: term.due, takeBoard: '#/run/job' };
  return { ...base, kind: 'job', post: true, shape: null };
}

/**
 * boardModel(save, opts) → everything pass 1 can print, and the shape of everything it cannot.
 * Pure, DOM-free, exported so `tests/job-week.test.mjs` can assert it without a browser.
 *
 * `minutes`, `wallS`, `endsAt`, `ends`, `split`, `projection` and `projectionSource` are ALWAYS
 * `null` here, and that is the contract, not an omission: every one of them is a property of
 * TONIGHT'S DRAFT (its tiers, the windows that really land, the student's own measured rate), and
 * pass 1 has neither the draft nor `job/board.js`. `sizingShape` is the row-count estimate's own
 * guess and is deliberately NOT printed; `shapeName` is non-null only when `weekGate` itself named
 * the shape. See the header for the 13-point / 6-minute measurement that removed them.
 */
export function boardModel(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const gate = weekGate(save, { now, today });
  const dues = dueList(save, { now, today });
  const cold = dues.reduce((m, d) => Math.max(m, Math.floor(d.overdue || 0)), 0);
  /* SIZING ONLY. The board the student takes is `board.shapeFor`'s, which reads a ready boss (VAULT)
     and the composed queue's length (JOB12) — neither of which pass 1 can see, and it guessed wrong
     on 2 of 16 measured boards. It survives here because the row RESERVE has to be decided in pass 1
     (`BOARD.postedMax` rows of `BOARD_ROW_PX`), and a row count inside a fixed reserve moves no
     geometry. It is never printed: `.b-shape` takes `shapeName`, which is null unless the week
     itself settled the shape. */
  const sizingShape = gate.shape ?? (gate.kind === 'morning' ? 'RUN' : 'JOB');
  const rows = [];
  const n = Math.max(1, postedCountEstimate(dues.length + SHAPES[sizingShape].targets));
  for (let i = 0; i < n; i++) rows.push({ id: BOARD_IDS[i], label: null, wing: null, locks: null, cold: null, posted: null, minutes: null });
  return {
    gate, shape: sizingShape, sizingShape, rows, reserve: BOARD.postedMax,
    shapeName: gate.shape && SHAPES[gate.shape] ? SHAPES[gate.shape].name : null,
    dues: dues.length, cold,
    minutes: null, wallS: null, endsAt: null, ends: null,
    split: null, projection: null, projectionSource: null,
    supply: WINGS.map((w) => ({ wing: w.id, locks: null })),
    coldCrew: { idle: null, dues: dues.length, minutes: null, manned: mannedCount(save) },
    line: lineFor(gate, { now, minutes: NIGHT_MIN }),
  };
}

const BOARD_IDS = ['A', 'B', 'C', 'D', 'E'];
const NIGHT_MIN = 30;         // screens/night.js NIGHT_MINUTES; pinned equal by tests/job-week.test.mjs

/**
 * How many makes are MANNED, read off the save alone (`js/job/crew.js` BARE/STEADY/HELD = 0/1/2).
 * Pass 1 may not import `job/crew.js` — it is a pass-2 module — but `save.game.crew` is store data,
 * and manning is the NECESSARY condition for a cold crew: a bare crew can never stand down. That is
 * enough for pass 1 to decide whether the strip has a box at all, which is what stops pass 2 from
 * retracting one (integration: notes/J13.md Request 1).
 */
function mannedCount(save) {
  const raw = save?.game?.crew;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return 0;
  let n = 0;
  for (const r of Object.values(raw)) if (r === 1 || r === 2) n++;
  return n;
}

/** The one line the panel prints instead of a board, per week state. */
export function lineFor(gate, { now = Date.now(), minutes = NIGHT_MIN } = {}) {
  const ends = timeHM(new Date(now + minutes * 60000));
  switch (gate.kind) {
    case 'closed': return COPY.closed({ minutes, ends });
    case 'night': return COPY.night({ minutes, ends });
    case 'morning': return COPY.morning();
    /* r3: these two were typed here as literals while `COPY.reviewBoard` and `COPY.schoolWindow`
       sat in `data/job.js` with ZERO call sites — G6's "one string table" with two sources of
       truth in it, and the lint reads only the table. The words live in the table. */
    case 'review': return COPY.reviewBoard();
    case 'school': return COPY.schoolWindow();
    // G2's terminus. The one line the game has that says the game is over, and it is the board's own.
    case 'quiet': return COPY.quiet({ readiness: gate.readiness ?? 0, due: gate.due ?? 0 });
    default: return '';
  }
}

/**
 * The WORDS of a `data/job.js COPY` line, split at the numerals a two-pass board has to reserve.
 *
 * r3: `COPY.coldCrew`, `COPY.supply` and `COPY.boardTitle` had **zero call sites** under `site/js`
 * while this screen re-typed their text as DOM nodes. G6 promises one string table and the copy lint
 * reads only the table, so a second copy of a line living in a screen is invisible to it. The
 * numerals cannot be plain text (pass 1 reserves their width, pass 2 inks them), so the line is
 * split at them and the fragments are appended around the numerals in order — the words stay in the
 * table and nothing here re-types them. `fields.length + 1` fragments for `fields.length` numerals;
 * `tests/job-week.test.mjs` pins that shape, so a template change fails loudly instead of quietly
 * dropping a phrase.
 * @param {(o: object) => string} fn a COPY template
 * @param {string[]} fields its numeric fields, in the order they appear in the sentence
 */
export function copyParts(fn, fields) {
  const marks = fields.map((_, i) => String.fromCharCode(1 + i));
  const args = Object.fromEntries(fields.map((k, i) => [k, marks[i]]));
  return String(fn(args)).split(new RegExp(`[${marks.join('')}]`));
}

/** A numeral that occupies its final width in pass 1 and takes ink in pass 2.
 *  `align` is `left` for the meta line's phrases, whose reserve is the LONGEST sentence pass 2 can
 *  write (`~100 % game · your last 5 jobs`): right-aligned, the slack would print as a gap in the
 *  middle of the line instead of at the end of it. */
function numeral(cls, chars, text = null, align = 'right') {
  const n = h(`span.${cls}.mono`, { style: { display: 'inline-block', minWidth: `${chars}ch`, textAlign: align } });
  if (text == null) {
    n.dataset.pending = '1'; n.classList.add('muted'); n.textContent = '·'.repeat(Math.max(1, chars - 1));
    /* `.muted` is a single class and `css/screens.css` inks `.board-meta .b-shape` through a
       two-class selector, so the class alone loses the cascade on the meta line. The placeholder
       says what it is inline, which no stylesheet can out-specify; `setNumeral` clears it. */
    n.style.color = 'var(--muted)';
  } else n.textContent = String(text);
  return n;
}
/** Pass 2 writes a numeral in place: same node, same width, ink instead of dots. */
function setNumeral(node, text) {
  if (!node) return;
  node.textContent = String(text);
  delete node.dataset.pending;
  node.classList.remove('muted');
  node.style.color = '';
}

/**
 * The Board panel — pass 1. Above the primary button (G7). `null` when the week has neither a board
 * NOR a line to print (no test date, post-test, layer off): an empty heading is not a panel.
 */
function boardPanel(model) {
  if (!model || (!model.gate.post && !model.line)) return null;
  const sec = h('section.card.home-board', {
    'aria-labelledby': 'board-h',
    dataset: { kind: model.gate.kind, pass: '1', post: String(model.gate.post) },
  }, h('h2#board-h.fs-3', COPY.boardTitle({ review: model.gate.kind === 'review' })));   // r3: COPY had no caller

  if (!model.gate.post) {
    sec.append(h('p.board-line.muted.fs-1', model.line || ''));
    if (model.gate.kind === 'night') sec.append(h('a.btn.board-night', { href: '#/run/night' }, 'Night Before'));
    if (model.gate.kind === 'closed') sec.append(h('p.board-keep.muted.fs-1', COPY.keepGoing()));
    // G2: "with the job still one tap away". The terminus stops the board LEADING; it closes nothing.
    if (model.gate.kind === 'quiet') sec.append(h('a.btn.btn-ghost.board-take', { href: model.gate.takeBoard || '#/run/job' }, 'Take a board anyway'));
    return sec;
  }
  if (model.line) sec.append(h('p.board-line.muted.fs-1', model.line));

  const list = h('ol.board-rows', { style: { minHeight: `${model.reserve * BOARD_ROW_PX}px`, listStyle: 'none', margin: '0', padding: '0' } });
  for (const r of model.rows) {
    list.append(h('li.board-row', { dataset: { id: r.id } },
      h('span.b-id.mono', r.id), ' ',
      numeral('b-label', 8), h('span.b-of.muted.fs-1', ' · '),
      numeral('b-locks', 2), h('span.b-of.muted.fs-1', ' locks · '),
      numeral('b-cold', 2), h('span.b-of.muted.fs-1', ' d cold · posted '),
      numeral('b-posted', 4), h('span.b-of.muted.fs-1', ' · '),
      h('span.b-wing.muted.fs-1', { dataset: { pending: '1' } }, '—')));
  }
  sec.append(list);

  /* THE META LINE IS PASS 2'S (r3). Every cell of it is a property of tonight's DRAFT, so pass 1
     reserves its width and prints nothing: `~N min` and `ends HH:MM` are `board.endsAt`'s, and the
     split is `board.projection`'s own sentence. `.b-shape` takes the name only when `weekGate`
     settled the shape itself (review / school); on an ordinary evening `board.shapeFor` may post a
     VAULT off a ready boss, which pass 1 cannot see. Widths are the longest final string each node
     can hold: `JOB-12` (6), `~100 min` (8), `ends 22:04` (10), `~100 % game · your last 5 jobs` (29). */
  sec.append(h('p.board-meta.mono.fs-1',
    numeral('b-shape', 6, model.shapeName, 'left'), ' · ',
    numeral('b-min', 8, null, 'left'), ' · ',
    numeral('b-ends', 10, null, 'left'), ' · ',
    numeral('b-split', 29, null, 'left')));

  const supply = h('ul.board-supply.fs-1.muted', { 'aria-label': 'Supply today', style: { listStyle: 'none', margin: '0', padding: '0' } });
  const sw = copyParts(COPY.supply, ['wing', 'locks']);
  for (const s of model.supply) {
    supply.append(h('li.board-sup', { dataset: { wing: s.wing } },
      sw[0] || null, h('span.b-sup-w', s.wing), sw[1] ?? ' ', numeral('b-sup-n', 2), h('span.b-of', sw[2] ?? '')));
  }
  sec.append(supply);

  // the cold-crew strip (G5 #3): `4 crew idle on their own reviews · 9 dues · clear them first — 4 minutes`
  // G11 lists Cold crew as a CONDITIONAL board state, so the strip gets a box only when the save
  // already says one is possible — a manned crew and something due. Pass 2 then writes ink into it
  // and never takes the box away again (the 48 px pass-1→pass-2 collapse, notes/J13.md Request 1).
  if (model.coldCrew.manned > 0 && model.coldCrew.dues > 0) {
    const cc = copyParts(COPY.coldCrew, ['idle', 'dues', 'minutes']);
    sec.append(h('p.board-crew.fs-1', { dataset: { pending: '1' } },
      cc[0] || null, numeral('b-crew-n', 2), h('span', cc[1] ?? ''),
      h('span.b-crew-dues.mono', String(model.coldCrew.dues)), h('span', cc[2] ?? ''),
      numeral('b-crew-min', 2), h('span', cc[3] ?? '')));
  }
  return sec;
}

/**
 * fillBoard(panel, save, opts) — PASS 2. Writes the posted numerals, the contract labels, the wings,
 * the per-wing supply and the cold-crew count into the nodes pass 1 already sized. Adds no node that
 * changes the panel's height, removes no row (a thin board empties its extra rows in place, inside the
 * reserved `min-height`), and never throws: a failure leaves a readable pass-1 board on screen.
 */
export function fillBoard(panel, save, { now = Date.now(), today = todayISO(new Date(now)), gate = null, compose = null, page = null } = {}) {
  if (!panel || !boardReady()) return null;
  const g = gate ?? weekGate(save, { now, today });
  if (!g.post) return null;
  let board = null;
  try {
    board = postBoard(save, today, {
      ...(compose ?? {}), now, page,
      ...(tellHookFor ? { tellFor: tellHookFor(save) } : null),
      ...(g.shape ? { shape: g.shape } : {}),
    });
  } catch (err) { console.error('home: postBoard', err); return null; }

  const rows = [...panel.querySelectorAll('.board-row')];
  board.contracts.slice(0, rows.length).forEach((c, i) => {
    const row = rows[i];
    setNumeral(row.querySelector('.b-label'), c.label);
    setNumeral(row.querySelector('.b-locks'), c.locks.length);
    setNumeral(row.querySelector('.b-cold'), c.cold ?? 0);
    setNumeral(row.querySelector('.b-posted'), c.posted);
    const w = row.querySelector('.b-wing');
    if (w) { w.textContent = c.wing ?? '—'; delete w.dataset.pending; }
  });
  for (let i = board.contracts.length; i < rows.length; i++) rows[i].hidden = true;

  /* the meta line, in the nodes pass 1 reserved: `setNumeral`, not `textContent`, because after r3
     all four of them ARRIVE pending and the dots have to stop being dots. */
  const meta = panel.querySelector('.board-meta');
  if (meta) {
    setNumeral(meta.querySelector('.b-min'), `~${Math.ceil((board.endsAt - board.now) / 60000)} min`);
    setNumeral(meta.querySelector('.b-ends'), `ends ${board.ends}`);
    setNumeral(meta.querySelector('.b-split'), board.projection);
    setNumeral(meta.querySelector('.b-shape'), SHAPES[board.shape]?.name ?? board.shape);
  }

  for (const li of panel.querySelectorAll('.board-sup')) {
    const s = board.supply?.[li.dataset.wing];
    setNumeral(li.querySelector('.b-sup-n'), s?.locks ?? 0);
  }

  const cc = coldCrewOf(save, board);
  const strip = panel.querySelector('.board-crew');
  if (strip) {
    setNumeral(strip.querySelector('.b-crew-n'), cc.idle);
    setNumeral(strip.querySelector('.b-crew-min'), cc.minutes);
    /* The box was decided in pass 1 (a manned crew with dues). If nothing landed on tonight's board
       after all, the ink goes out and the box stays: hiding the node takes ~48 px out of a panel the
       student is already reading, which is the one thing pass 2 may never do. css/job.css owns it. */
    strip.toggleAttribute('data-empty', cc.idle === 0);
    delete strip.dataset.pending;
  }
  panel.dataset.pass = '2';
  return board;
}

/**
 * Pass 2's last act: the primary button reprints its own numbers from the drafted board, so `~N min`
 * and `ends HH:MM` on the CTA and on the panel are the SAME wall clock (G5 — "every primary button
 * prints cards, minutes and the wall-clock time the run ends"). Not called when the shape was refused:
 * that button is already the alternative's.
 */
export function primaryLineFor(board) {
  if (!board?.recommend) return null;
  /* ONE formula, in `job/board.js`. It now prints wall-clock minutes beside its wall-clock `ends`
     (notes/J11.md §6 → J5), so Home's CTA and the job screen's primary are the same sentence about
     the same board instead of ~20 min here and ~15 min there (G9 #9; notes/J13.md Request 2). */
  if (board.primary) return board.primary;
  return COPY.primary({
    shape: SHAPES[board.shape]?.name ?? board.shape,
    targets: board.recommend.queue.length,
    minutes: Math.ceil((board.endsAt - board.now) / 60000),
    ends: board.ends,
    split: Math.round(Number(String(board.projection).replace(/[^\d.]/g, '')) || 0),
  });
}

/**
 * The cold-crew strip's two numerals (G1 "Cold crew", G5 #3): how many MANNED makes are standing down
 * on their own due review tonight, and how long clearing those reviews takes.
 */
export function coldCrewOf(save, board) {
  const out = { idle: 0, dues: 0, minutes: 0, makes: [] };
  if (!board || !crewIdleFor || !crewOf) return out;
  const manned = crewOf(save);
  const seen = new Set();
  for (const t of board.pool ?? []) {
    if (!t?.skill || !manned[t.skill]) continue;
    if (!crewIdleFor(save, t.skill, t)) continue;
    out.dues++;
    out.minutes += t.minutes ?? 0;
    if (!seen.has(t.skill)) { seen.add(t.skill); out.makes.push(t.skill); }
  }
  out.idle = seen.size;
  out.minutes = Math.ceil(out.minutes);
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
  const pageOpts = planOpts(state, D);                              // W4: the S7 plan's tier-4 cap
  // J11: pass 1 of the board, from the static graph. `boardMods()` is pass 2 and re-renders when it lands.
  const now = Date.now();
  const gate = weekGate(state, { now, today });
  const model = gate.on ? boardModel(state, { now, today }) : null;
  if (gate.on && !boardReady()) boardMods().then(() => { if (el.isConnected) { payGetaway(); render(el, getState(), todayISO()); } });
  let act = nextAction(state, { today, compose: pageOpts });
  if (gate.on && boardReady() && jobRouteOK) act = nextActionFor(state, act, { today, now });
  const ip = resumePage(state);
  const boss = bossReady(state)[0] ?? null;
  // W4 integration (notes/T12.md Requests → T10): the intro is worth reading ONCE. After the student has
  // a run of that boss on the save, link straight into the fight (`?start=1`); the plain link still
  // resumes an interrupted run, which is why it stays the first-time link.
  const bossHref = (id) => `#/boss/${id}${(state.runs ?? []).some(r => r?.kind === `boss:${id}`) ? '?start=1' : ''}`;

  // home r1: a long breakdown ('RUN NEXT · 17 reviews + 4 new + 4 variants') wraps to two lines in the 56 px
  // button at 375; past ~24 chars the button says the count and the breakdown moves to the sub-line.
  let label = act.label, breakdown = null;
  if (act.kind === 'page' && act.page && act.label.length > 24) {
    breakdown = act.label.replace(/^RUN NEXT · /, '');
    label = `RUN NEXT · ${act.page.queue.length} items`;
  }
  // J11 / G5: a shape whose PROJECTED end time passes 22:00 is refused — with the one-tap alternative
  // and the REAL end time on both options. Neither option is removed: G9 #9 locks no study door.
  //
  // J13 r1 fix: pass 1's refusal is computed from `econ.shapeTable`, the canonical tier mix. The board
  // pass 2 actually drafts projects from ITS OWN queue's tiers, so at 21:45 pass 1 said `ends 21:57 ·
  // refusal null` for a board whose own row read `ends 22:04`. The refusal is therefore re-decided
  // below against `board.endsAt`, and pass 2 may now RAISE one as well as clear one — the CTA, the
  // panel and the 22:00 gate are one sentence about one board (COMPOSED wins on quiet hours, G1).
  const baseLabel = label;
  const primaryHref = act.kind === 'boss' && boss ? bossHref(boss.id) : act.href;
  const primary = h('a.btn.btn-primary.home-primary', { href: primaryHref, dataset: { kind: act.kind } }, baseLabel);
  const subP = h('p.home-cta-sub.muted.fs-1');
  const cta = h('div.home-cta', primary);
  let refusal = act.kind === 'job' ? act.refusal : null;
  /** Paint the CTA for a refusal (or `null` for none). Idempotent — pass 2 calls it again. */
  function paintCta(refusal) {
    cta.querySelector('.home-cta-alt')?.remove();
    if (refusal) {
      primary.textContent = `${refusal.alt.shape} · ~${refusal.alt.minutes} min · ends ${refusal.alt.ends}`;
      primary.href = `#/run/job?shape=${refusal.alt.shape}`;
      primary.after(h('a.btn.btn-ghost.home-cta-alt', { href: `#/run/job?shape=${refusal.shape}`, dataset: { ends: refusal.ends } },
        `${refusal.shape} anyway · ends ${refusal.ends}`));
    } else {
      primary.textContent = baseLabel;
      primary.href = primaryHref;
    }
    const lines = (refusal ? [refusal.line, ...sub] : sub).filter(Boolean);
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
  const sub = [];
  if (act.kind === 'page' && act.page) {
    const m = act.page.meta;
    const est = Math.round(act.page.queue.reduce((t, it) => t + ({ 1: 0.5, 2: 1.5, 3: 3, 4: 5 }[it.tier] ?? 1.5), 0));
    if (breakdown) sub.push(breakdown);
    sub.push(`~${est} min`, `seed ${m.seedTag}`);
    // home r2: the "plan wants N new a day — holding at 12" line is gone — meta.q IS the held target, so it could
    // only ever print 12 vs 12 while the strip beneath said 18 (S9 #10). The strip's warn line is the one statement.
    if (m.carried.length) sub.push(`${m.carried.length} hard item${m.carried.length === 1 ? '' : 's'} carried to the next page`);
  } else if (act.kind === 'job') {
    sub.push(act.policy?.why ?? '');          // the refusal line is prepended by `paintCta`
  } else if (act.kind === 'resume' && ip) {
    sub.push(`started ${new Date(ip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, `${ip.queue.filter(q => q.done).length} answered`);
  } else if (act.kind === 'warmup') sub.push('3 short screens, every one skippable · a placement earns XP');
  else if (act.kind === 'night') sub.push('30 minutes: notation flash · final sweep · mini-mock · the sheet');
  else if (act.kind === 'morning') sub.push('5 minutes of things you already know, then Go.');
  else if (act.kind === 'mock') sub.push('20 items · 40 min · locks Readiness');
  else if (act.kind === 'boss') sub.push('6 items · 3 hearts · no hints');
  else if (act.kind === 'missed') sub.push('every original you did not get first try, until you do');

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

  paintCta(refusal);
  const panel = model ? boardPanel(model) : null;
  const col = h('div.col',
    heroBlock(state, rd, today),
    panel,                                                            // J11 / G7: the Board, above the primary button
    cta,
    fillPlanStrip(planStrip(state, today, D), state, { today, hideMock: act.kind === 'mock' }),   // T14 (the call below is the fallback); fix5:home r1 — no second Mock link under a Mock CTA
    h('section.card.home-today', { 'aria-label': 'Today' }, goalMeter(state, today), streakArc(state.streak ?? { count: 0, best: 0 }), levelRing(state.xp ?? 0)),
    weakList(state, act.kind),
    secondary,
  );
  // NOT `.screen` (that caps the whole grid at 680 px) — `.with-rail` lays out the 680 column + 320 rail (T01)
  el.replaceChildren(h('section.home.with-rail', { 'aria-label': 'Today' }, col, skillRail(state)));
  // J11 pass 2: the posted numerals land in the nodes pass 1 already sized. No spinner, no reflow.
  if (panel && boardReady()) {
    const board = fillBoard(panel, state, { now, today, gate, compose: pageOpts, page: act.page ?? null });
    if (board && act.kind === 'job') {
      /* The 22:00 gate, re-decided against the board's OWN projected end time instead of the shape
         table's. `plan.refuseFor` takes `wallS` straight (and `plan.jobAction` now plumbs it too), so
         there is still exactly one implementation of "does this end after 22:00?". */
      const wallS = Math.max(0, (board.endsAt - board.now) / 1000);
      const real = refuseFor ? refuseFor(board.shape ?? act.shape, { now, wallS }) : refusal;
      refusal = real;
      paintCta(refusal);
      if (refusal) return;                     // the CTA is the alternative's; it may not reprint the refused board
      const line = primaryLineFor(board);
      if (line) primary.textContent = line;
    }
  }
}

/** G5 — the Night Before pays the Clean Getaway stamp + 1 Backcheck, once, the first time Home sees it. */
function payGetaway() {
  if (!payCleanGetaway) return;
  const probe = structuredClone(getState());
  if (!payCleanGetaway(probe, {}).stamped) return;
  update((s) => { payCleanGetaway(s, {}); });
}

/** home r2: the first paint — everything readiness.js can say, plus a CTA placeholder and the fallback plan pills. */
function renderLight(el, state, rd, today, D) {
  const primary = h('span.btn.btn-primary.home-primary', { role: 'status', 'aria-busy': 'true', dataset: { kind: 'loading' } }, 'Loading today’s page…');
  const secondary = h('nav.home-links', { 'aria-label': 'More' },
    h('a.btn', { href: '#/binder' }, 'Binder'), h('a.btn', { href: '#/mock' }, 'Mock'), h('a.btn', { href: '#/stats' }, 'Stats'), h('a.btn', { href: '#/sheet' }, 'Sheet'));
  // J11: the board is painted on the FIRST paint too — it is pass 1's whole point that it needs
  // nothing heavier than the save, so the panel's geometry is identical across all three paints.
  const model = gameIsOn(state) ? boardModel(state, { today }) : null;
  const col = h('div.col',
    heroBlock(state, rd, today),
    model ? boardPanel(model) : null,
    h('div.home-cta', primary),
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
