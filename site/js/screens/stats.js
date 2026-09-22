// screens/stats.js — #/stats, the leaderboard-of-self (COMPOSED S4 "Leaderboard-of-self", S8 #11).
//
// Everything on this screen is read out of the save; nothing is computed twice and nothing is stored.
// Sections, in the order S4 names them:
//   Beat yesterday (ghost XP target) · Readiness sparkline · 14-day XP bars · rarity histogram ·
//   the 19 skill bars · first-try % trend · per-sheet / per-Page / per-boss bests · trophies (earned and
//   unearned, each printing its own condition) · Patterns (misconception tags with counts and one-line
//   fixes) · Errors with replay / rematch links.
//
// Run records are read through the accessors in js/trophies.js (`kindOf`, `sheetOfRun`, `accuracyOf`,
// `wonRun`, …) so this screen and the trophy predicates can never disagree about what a run says.

import { h, setHeader, softWrap } from '../app.js';
import { getState, subscribe } from '../store.js';
import { todayISO, addDays } from '../days.js';
import { readiness, skillStates } from '../readiness.js';
import { sheets, numbering } from '../../data/sheets.js';
import { bossById } from '../../data/modules.js';
import { groupByArea, lookup } from '../../data/misconceptions.js';
import {
  summary as trophySummary, GROUPS, coverage, rarityHistogram,
  kindOf, bossOf, sheetOfRun, accuracyOf, correctCount, wonRun, flawlessRun,
} from '../trophies.js';
// THE JOB's three meta panels (COMPOSED-GAME G7 · J7). No new route: the Ledger, the Fault Index and
// the reliability/calibration block are sections of this screen, and every number is read out of
// `save.player` / `save.game` through the layer's own modules, so Stats can never publish an
// arithmetic the game does not use. All four imports are lazy at the route level — screens/index.js
// loads stats.js on demand — so none of this is on the cold-open path.
import { areaRollup, indexProgress, backchecksOf } from '../job/index.js';
import { ratingDetail, rankOf, credit, RATING, CREDIT, CALL_LEVELS } from '../job/call.js';
import {
  budgetFor, capacityDetail, crewOf, crewFor, MAKES, RANK_NAMES, MANNED_MAX,
  COSTS, CAPACITY_MAX, STAMPS_MAX, CHAIN_HOLD_MIN,
} from '../job/crew.js';
import { wingOf } from '../job/guard.js';
import { COPY, CREW } from '../../data/job.js';
import { skillById } from '../../data/skills.js';

/* ------------------------------------------------------------------ formatting */

const pct = (x) => `${Math.round(x * 100)}%`;
const n0 = (x) => String(Math.round(Number.isFinite(x) ? x : 0));

/** 1:23 / 12:05 / 41s — a run duration. */
function fmtDur(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const dayLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'narrow' });
};
const shortDate = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const localDayOf = (ms) => {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : todayISO(d);
};
const runMs = (r) => (Number.isFinite(r?.ms) ? r.ms
  : (Number.isFinite(r?.submittedAt) && Number.isFinite(r?.startedAt) ? r.submittedAt - r.startedAt : NaN));

/** Kinds Readiness scores as `A` (S4) — all of them belong in the Mocks table. */
const MOCK_KINDS = new Set(['mock', 'baseline', 'night']);

/** How many items a Page run held. Older runs kept only a raw `score`; that is its length too. */
const pageLen = (r) => (Array.isArray(r?.items) && r.items.length ? r.items.length
  : (Number.isFinite(r?.score) ? r.score : null));

/** A run's XP, or an honest dash when the run did not record one. */
const xpCell = (r) => (Number.isFinite(r?.xp) ? n0(r.xp) : '—');

/* ------------------------------------------------------------------ tiny charts (no library, S6) */

/** A row of labelled bars. rows = [{key, label, value, note, tone}] */
function barRows(rows, { max = null, fmt = n0, empty = 'Nothing yet.' } = {}) {
  if (!rows.length) return h('p.muted.fs-1', empty);
  const top = max ?? Math.max(1, ...rows.map(r => r.value || 0));
  return h('ul.st-bars', rows.map(r => h('li', { dataset: { tone: r.tone ?? '' } },
    h('span.st-bar-label', r.label),
    h('span.st-bar-track', h('span.st-bar-fill', { style: { width: `${Math.max(0, Math.min(1, (r.value || 0) / top)) * 100}%` } })),
    h('span.st-bar-val.mono', fmt(r.value)),
    r.note ? h('span.st-bar-note.muted.fs-1', r.note) : null,
  )));
}

/**
 * A sparkline over `points` = [{day, value|null}]. Nulls break the line (a day with no data is not a
 * zero). Reads as a chart, not a stub: a baseline with one faint tick per day (an empty day is "not
 * logged", not blank space), the first and last dates under the box, the value printed at the head
 * dot. With fewer than four logged points a line would be a guess, so it prints the points as a list.
 * The SVG stretches horizontally (`preserveAspectRatio="none"`) — strokes are non-scaling and the dots
 * are round-capped zero-length strokes, so nothing turns into an ellipse at 1280 px.
 */
function sparkline(points, { min = 0, max = 100, label = '', empty = 'No points logged yet.', unit = '' } = {}) {
  const W = 300, H = 60, P = 4;
  const known = points.filter(p => Number.isFinite(p.value));
  if (!known.length) return h('p.muted.fs-1', empty);
  const today = points[points.length - 1]?.day;
  const fmtPt = (p) => `${p.day === today ? 'today' : shortDate(p.day)} ${n0(p.value)}${unit}`;
  if (known.length < 4) {
    return h('p.st-spark-list.fs-1', { 'aria-label': label || 'trend' },
      ...known.flatMap((p, i) => [i ? h('span.muted', ' · ') : null, h('span.mono', fmtPt(p))]),
      h('span.muted', ` — ${known.length} logged day${known.length === 1 ? '' : 's'}; the line draws at four.`));
  }
  const lo = Math.min(min, ...known.map(p => p.value)), hi = Math.max(max, ...known.map(p => p.value));
  const span = hi - lo || 1;
  const x = (i) => P + (points.length <= 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1));
  const y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'st-spark', role: 'img', preserveAspectRatio: 'none', 'aria-label': label || 'trend' });
  svg.append(mk('line', { x1: P, y1: H - P, x2: W - P, y2: H - P, class: 'st-spark-base' }));
  points.forEach((p, i) => svg.append(mk('line', { x1: x(i).toFixed(1), y1: H - P, x2: x(i).toFixed(1), y2: H - P - 4, class: 'st-spark-tick', 'data-logged': String(Number.isFinite(p.value)) })));
  const segs = [];
  let cur = [];
  points.forEach((p, i) => {
    if (Number.isFinite(p.value)) cur.push([x(i), y(p.value)]);
    else if (cur.length) { segs.push(cur); cur = []; }
  });
  if (cur.length) segs.push(cur);
  const dot = (cx, cy, cls) => mk('polyline', { points: `${cx.toFixed(1)},${cy.toFixed(1)} ${(cx + 0.01).toFixed(1)},${cy.toFixed(1)}`, class: cls });
  for (const seg of segs) {
    if (seg.length === 1) { svg.append(dot(seg[0][0], seg[0][1], 'st-spark-dot')); continue; }
    svg.append(mk('polyline', { points: seg.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' '), class: 'st-spark-line' }));
  }
  const lastI = points.map(p => Number.isFinite(p.value)).lastIndexOf(true);
  const wrap = h('div.st-spark-wrap');
  if (lastI >= 0) {
    svg.append(dot(x(lastI), y(points[lastI].value), 'st-spark-head'));
    const px = x(lastI) / W, py = y(points[lastI].value) / H;
    wrap.append(h('span.st-spark-val.mono', {
      'aria-hidden': 'true',
      style: { left: `${(px * 100).toFixed(1)}%`, top: `${(py * 100).toFixed(1)}%` },
      dataset: { side: px > 0.8 ? 'left' : 'right' },
    }, `${n0(points[lastI].value)}${unit}`));
  }
  wrap.prepend(svg);
  const first = points[0], last = points[points.length - 1];
  return h('div.st-spark-box',
    wrap,
    h('div.st-spark-axis.fs-1.muted', { 'aria-hidden': 'true' },
      h('span', shortDate(first.day)),
      h('span', `${known.length} of ${points.length} days logged`),
      h('span', last.day === today ? 'today' : shortDate(last.day))));
}

function section(id, title, ...body) {
  return h('section.st-block', { id, 'aria-labelledby': `${id}-h` },
    h('h2.st-h', { id: `${id}-h` }, title),
    ...body.filter(Boolean));
}

/* ------------------------------------------------------------------ derivations */

/** Last `n` local days ending today, oldest first. */
function lastDays(n, today = todayISO()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}

/** First-try % per day, from every card's history (attempt-1 submits only). */
function firstTryByDay(save, days) {
  const tally = new Map(days.map(d => [d, { ok: 0, n: 0 }]));
  const cards = save.cards || {};
  for (const id of Object.keys(cards)) {
    const hist = cards[id]?.history;
    if (!Array.isArray(hist)) continue;
    for (const e of hist) {
      if (!e || (e.attempt ?? 1) !== 1) continue;
      const d = localDayOf(e.at);
      const t = d && tally.get(d);
      if (!t) continue;
      t.n++;
      if (e.ok) t.ok++;
    }
  }
  return days.map(d => {
    const t = tally.get(d);
    return { day: d, value: t.n ? (100 * t.ok) / t.n : null, n: t.n };
  });
}

/** Best (fastest) completed run per key. */
function bestByKey(runs, keyOf) {
  const best = new Map();
  for (const r of runs) {
    if (!r || r.status !== 'done') continue;
    const k = keyOf(r);
    if (k == null) continue;
    const ms = runMs(r);
    const prev = best.get(k);
    if (!prev || (Number.isFinite(ms) && (!Number.isFinite(runMs(prev)) || ms < runMs(prev)))) best.set(k, r);
  }
  return best;
}

/** Where an error entry replays to. */
function replayHref(save, e) {
  const item = typeof e?.item === 'string' ? e.item : '';
  if (!item) return null;
  if (item.startsWith('T-')) {
    const tpl = item.split('#')[0];
    const seed = e.seed ?? item.split('#')[1] ?? '';
    return `#/variant/${tpl}${seed ? `?seed=${encodeURIComponent(seed)}` : ''}`;
  }
  return `#/card/${item}`;
}
function errorLabel(e) {
  const item = typeof e?.item === 'string' ? e.item : '?';
  if (item.startsWith('T-')) return `${item.split('#')[0]} ◆`;
  const num = numbering(item);
  return num ? `${num} ${item}` : item;
}

/* ------------------------------------------------------------------ THE JOB: the meta panels (J7) */

/** The layer is on unless the student switched it off in Settings (G7: `settings.game = false`). */
const gameOn = (save) => save?.settings?.game !== false;
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('-', '−') : '—');
const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1).replace('-', '−') : '—');   // the app's minus is U+2212

/** The records, as the same `.st-table` every other table on this screen uses — no new CSS (J7).
 *  Two columns, so it fits a 375 px phone without the horizontal scroll a third would force. */
function kvRows(rows) {
  return h('div.table-wrap', h('table.st-table',
    h('thead', h('tr', h('th', 'Record'), h('th', 'Best'))),
    h('tbody', rows.map(([k, v]) => h('tr', h('td', k), h('td.mono', String(v)))))));
}

/**
 * THE RATCHET'S AUDIT RECORD, AND WHAT "NO RECORD" LOOKS LIKE ON DISK (G9 #4, round-3 verify 1).
 *
 * `player.records.bestRating` is DECLARED in both copies of the save schema with a default of 0
 * (`data/job.js` SAVE_DEFAULTS, `store.js freshPlayer`) and `store.normalizePlayer` coerces every
 * value — absent, string, NaN, ±Infinity, object — to that same 0. So `Number.isFinite(bestRating)`
 * is TRUE on every fresh save and on every migrated save, and the guard that used to stand here
 * printed `best rating 0.00` beside a live 5.00 rating on a save that has never recorded anything.
 * Under a declared field, 0 is not a reading: it is the absence of one.
 *
 * `> 0` is the whole rule, and it is safe in both directions: both writers (`job/state.js`
 * `applyTarget` and `endJob`, and `screens/mock.js applyMockCall`) raise the high-water off
 * `ratingDetail().value`, and an unmeasured window alone already reads `RATING.base` = 5.00; the one
 * value it hides is a genuine high-water of exactly 0.00 — a single catastrophic staked call — which
 * prints nothing until the next call lifts it. That under-reports by one line; it never invents one.
 *
 * Kept identical to `screens/settings.js hasBestRating` — the two audit surfaces must agree, and
 * `tests/job-meta-constants.test.mjs` asserts they do, value by value.
 */
export const hasBestRating = (v) => Number.isFinite(v) && v > 0;

/**
 * The ledger headline's four parts — the audit line G9 #4 owes the student, built here rather than
 * inline so `tests/job-meta-constants.test.mjs` can run THE SHIPPED BUILDER over a real save instead
 * of grepping this printer's source for a guard it never evaluates (which is exactly how
 * `best rating 0.00` shipped green).
 *
 * THE RANK IS READ, NOT RE-DERIVED (round 3). `rankFor(value)` is not the rank the game grants: the
 * 95 call and the guard multiplier are gated on `player.rank`, and the two part company the moment
 * the window holds no measurement. A student who mastered their makes has a window of fifty
 * non-informative calls — `value === 5.00` with `measured === false` — and re-deriving the name from
 * that value prints `Called 2` at them for getting better. `opts.rank` is the hook
 * `call.ratingDetail` documents for exactly this; `held` reports that it fired.
 *
 * @param {object} save
 * @returns {{rating: object, value: string, rank: string, best: string|null, calls: string}}
 */
export function ledgerRatingParts(save) {
  const player = save?.player ?? {};
  const rec = player.records ?? {};
  const rating = ratingDetail(player.rating?.calls ?? [], RATING.N, { rank: player.rank });
  const bestRating = rec.bestRating;
  return {
    rating,
    value: n2(rating.value),
    rank: rankOf(rating.rank).name,
    /* THE CAPPING QUANTITY, PRINTED (verify round 2). The rank is the band of what the student's
       own REPORTS were worth (`ratingDetail().ceiling`), floored by the rank held — not the band
       of the rating beside it. `offBand` is true exactly when those two bands differ, in either
       direction, and this panel prints the legend `RANK_THRESHOLDS` builds, so without this part
       the student reads two numbers that contradict each other and nothing to reconcile them.
       `tests/job-call.test.mjs` §7 drives this builder and asserts the ceiling is in the string. */
    worth: rating.offBand ? ` · your calls were worth ${n2(rating.ceiling)}` : null,
    best: hasBestRating(bestRating) ? ` · best rating ${n2(bestRating)}` : null,
    /* THE TAIL IS THE COPY TABLE'S OWN WORDS, MINUS ITS RANK PREFIX. `COPY.ratingLine` is the
       DEBRIEF's whole line and LEADS WITH THE HELD RANK (SPEC-CORRECTIONS I-4, REPAIR-DECISION
       S3.1(d)); this panel has already printed the rank in its own span — G9 #4 publishes the order
       `Called 5 · best rating 9.90` — so it asks the table for the same sentence with an empty rank
       and drops the separator the empty prefix leaves behind. Round-3 verify 1 found this call
       omitting `rank` ENTIRELY: every student on an unmeasured window read
       `undefined · rating unchanged · no measurement · 0/50 informative calls`, and no test in the
       suite could see it, because no test ever ran this builder. */
    calls: ` · ${COPY.ratingLine({ rank: '', rating: n2(rating.value), n: rating.n, N: rating.N }).replace(/^\s*·\s*/, '')}`,
  };
}

/** The same headline as the one string the student reads — what the tests assert on. */
export function ledgerRatingLine(save) {
  const p = ledgerRatingParts(save);
  return `${p.value} ${p.rank}${p.worth ?? ''}${p.best ?? ''}${p.calls}`;
}

/**
 * Panel 1 — the LEDGER (G5 #7, G7). The records, both Elo numbers, the live rating with its rank and
 * its `n/50` informative-call line, and the Backchecks held. Every number is `save.player`'s own.
 */
function ledgerPanel(save) {
  const player = save.player ?? {};
  const rec = player.records ?? {};
  /* The headline — rank read not re-derived, audit line printed only when the record is real. Both
     rules live on `ledgerRatingParts` above, with the reason 0 is not a record. */
  const parts = ledgerRatingParts(save);
  const rating = parts.rating;
  const elo = player.elo ?? {};
  const bc = backchecksOf(save);
  const jobs = Array.isArray(save.game?.log) ? save.game.log.length : 0;
  return h('div.st-ledger',
    h('p.st-ledger-rating',
      h('b.mono.fs-3', parts.value),
      h('span.fs-1', ` ${parts.rank}`),
      parts.worth ? h('span.muted.fs-1', parts.worth) : null,
      parts.best ? h('span.muted.fs-1', parts.best) : null,
      h('span.muted.fs-1', parts.calls)),
    rating.offBand
      ? h('p.fs-1.muted', 'The rank is not the band your rating sits in. The rating is what your calls SCORED; '
        + 'the rank is what they were WORTH — the same fifty slots priced at w·E[c] on the material you made them '
        + 'on, which no run of luck can move, floored by the rank you already hold.')
      : null,
    h('p.fs-1.muted', rating.n === 0
      ? 'The window takes informative calls only — a call on material you already know cold (or cannot do at all) never enters it, and an empty slot scores neutral, so the rating sits at 5.00 until you stake on something you half-know.'
        + (rating.held ? ' The rank beside it is the one your ledger holds: a window with nothing in it measures nothing, and an unmeasured window does not demote you.' : '')
      : `${rating.n} of ${rating.N} slots filled · mean w·c ${n2(rating.mean)}`),
    kvRows([
      ['Best bag', Math.round(num0(rec.bestBag))],
      ['Longest chain', Math.round(num0(rec.bestChain))],
      ['Best rating over 20 calls', n2(num0(rec.bestRating20))],
      ['Clean jobs', Math.round(num0(rec.cleanJobs))],
      ['Vaults cracked', Math.round(num0(rec.cracked))],
      ['Vaults walked', Math.round(num0(rec.walked))],
      ['Clean Getaway', rec.cleanGetaway === true ? 'stamped' : '—'],
      ['Jobs logged', jobs],
      ['Backchecks held', `${bc.held}/${bc.max}`],
    ]),
    h('p.fs-1.muted', 'A clean job is one with no hints and no misses. Clean Getaway is the one-time stamp the '
      + 'Night Before pays on the eve of the test. A Backcheck is minted by a day on which you had reviews due and '
      + `cleared every one of them, ${bc.max} held at most, and it shields the stake on a miss and nothing else.`),
    h('h3.st-h3', 'Elo'),
    h('p.fs-1',
      h('span.mono', `you ${Math.round(num0(elo.player) || 1000)}`),
      h('span.muted', ' · '),
      h('span.mono', `the House ${Math.round(num0(elo.house) || 1000)}`)),
    h('p.fs-1.muted', 'Symmetric, K = 24. Your number drives the vault grade and nothing else: it never '
      + 'touches which reviews are due — that is Leitner’s job alone.'),
  );
}
const num0 = (x) => (Number.isFinite(x) ? x : 0);

/**
 * The crew allocation grid (G2 "Crew — capacity, not currency", G7). The counter every acceptance
 * line names is `manned ≤ min(capacity, 12)`, and `crew.budgetFor` is what returns it.
 */
function crewGrid(save) {
  const budget = budgetFor(save);
  const cap = capacityDetail(save);
  const crew = crewOf(save);
  const rows = MAKES.map((make) => {
    const c = crewFor(save, make);                       // NB: `c.name` is the RANK name, not the make's
    return { ...c, make, label: skillById[make]?.name ?? make, wing: wingOf(make) };
  });
  const manned = rows.filter(r => r.rank > 0);
  return h('div.st-crew',
    h('p.st-crew-count',
      h('b.mono', `${budget.manned}`), h('span', ' manned'),
      h('span.muted', ' ≤ '), h('span.mono', `min(${budget.capacity}, ${MANNED_MAX})`),
      h('span.muted.fs-1', ` = ${budget.mannedMax} · ${budget.spent} of ${budget.capacity} points spent · ${budget.free} free`)),
    h('p.fs-1.muted', `capacity = ${cap.base} + floor(level / ${CREW.levelsPerPoint}) + boss stamps`
      + ` = ${cap.base} + ${cap.fromLevel} + ${cap.stamps} = ${cap.capacity}`
      + ` (level ${cap.level}, ${cap.stamps} of ${STAMPS_MAX} stamps). STEADY costs ${COSTS.STEADY} and forgives one rung;`
      + ` HELD costs ${COSTS.HELD}, forgives two`
      + ` and holds the chain at ${CHAIN_HOLD_MIN} or deeper — and HELD needs the make mastered.`),
    manned.length
      ? h('div.table-wrap', h('table.st-table',
        h('thead', h('tr', h('th', 'Make'), h('th', 'Wing'), h('th', 'Rank'), h('th', 'Forgives'), h('th', 'State'))),
        h('tbody', rows.filter(r => r.rank > 0).map(r => h('tr',
          h('td', r.label),
          h('td.mono.fs-1', r.wing ?? '—'),
          h('td.mono', RANK_NAMES[r.rank] ?? '—'),
          h('td.mono', String(r.forgives)),
          h('td.fs-1.muted', r.lapsed ? 'lapsed — pays STEADY' : r.chainHold ? `holds the chain at ${r.minChain}+` : 'ladder as authored'),
        )))))
      /* WHERE CREW IS ACTUALLY ALLOCATED (round 3, crew-alignment). This line used to say
         "re-allocation is free and unlimited between jobs and inside every brief window". There is
         no between-jobs control anywhere in `site/js`: `crew.allocate` has exactly one caller
         chain — `screens/job.js setCrewRank → takeBrief → state.brief` — and this grid is a
         read-only table. The brief grid also offers only the makes still on the board (measured
         over 200 drafted JOB-10s: 4.7 of 19 makes at brief 1, 2.0 at brief 2), so the promise was
         false twice over.

         VERIFY-2 (crew, findings 2 + 3): the replacement was still false, in the two halves it kept.
         "Free and unlimited inside every brief window" — `state.brief` applies at most one
         `actions.crew` and then calls `setPhase(… 'envelope')`, and `setCrewRank` takes the window
         on the first press, so a crew change costs the window's single action. "A build mistake
         costs one job" — `save.game.crew` persists across jobs, and the median make is served on
         15.7 % of drafted boards, so an unwanted point waits ~6 jobs for a night that can hand it
         back. What this line says now is what the machine does: one change per window, on the makes
         the window offers (which since verify-2 is the board's makes PLUS the ones already manned,
         `crew.reallocatable`). */
      : h('p.muted.fs-1', 'No crew manned yet. Crew is allocated in a brief window — one rank change '
        + 'per window, over the makes on tonight\'s board plus the ones you are already manning. '
        + 'This grid is the read-out, not the control.'),
    h('p.fs-1.muted', `${MAKES.length - manned.length} of ${MAKES.length} makes bare. `
      + `At the ceiling the cap still bites: ${MANNED_MAX} manned costs ${MANNED_MAX * COSTS.STEADY} points and the `
      + `remaining ${CAPACITY_MAX - MANNED_MAX * COSTS.STEADY} buy ${CREW.maxBuildAtCeiling.held} HELD upgrades `
      + `— ${CREW.maxBuildAtCeiling.held} HELD, ${CREW.maxBuildAtCeiling.steady} STEADY, and ${CREW.maxBuildAtCeiling.bare} `
      + 'makes always bare. There is no level at which the board is covered.'),
    /* NOTHING LEGALISES IT FOR YOU (round 3, spec-fidelity). This line used to read "the next job
       will legalise it". `crew.legalize(save)` exists and has no caller anywhere under `site/js`,
       so no job legalises anything; the only repair that does run is `effectiveRankOf`'s read-time
       downgrade, which stops the ladder over-forgiving but never frees the point. The student has
       to re-allocate, and the panel now says that instead. */
    Object.keys(crew).length && !budget.legal
      ? h('p.fs-1.warn', `This allocation is over budget — ${budget.spent} points spent against a capacity of `
        + `${budget.capacity}. Until you re-allocate it in a brief window the surplus buys nothing: the ladder `
        + 'pays each make the rung it can actually hold.')
      : null,
    /* And the other half of the same silence: a make whose mastery a Mock or Boss miss took away
       keeps its stored rank and pays the lower one, so the difference is a capacity point that is
       spent and cannot pay for itself. `budgetFor` measures it as `wasted`; nothing printed it. */
    Number.isFinite(budget.wasted) && budget.wasted > 0
      ? h('p.fs-1.warn', `${budget.lapsed.map(m => skillById[m]?.name ?? m).join(', ')} lapsed — the make is no `
        + `longer mastered, so it pays the lower rung and ${budget.wasted} of your ${budget.spent} spent point`
        + `${budget.wasted === 1 ? '' : 's'} buys nothing. Re-allocate in the next brief window to get `
        + `${budget.wasted === 1 ? 'it' : 'them'} back.`)
      : null,
  );
}

/**
 * Panel 2 — the FAULT INDEX (G2, G5 #5). All 68 cells, grouped by `data/misconceptions.js`'s own 11
 * AREAS, every cell present whether or not the save has ever seen it: an empty cell is part of the
 * collection. A tag seals at 3 clean resolutions across 3 distinct days with no re-trigger between.
 */
function faultIndexPanel(save) {
  const roll = areaRollup(save);
  const p = indexProgress(save);
  const need = (x) => Math.max(0, 3 - x);
  /** One dry line per cell: what state it is in, and what is left to seal it. */
  const cellLine = (c) => {
    if (c.state === 'untouched') return 'never triggered';
    if (c.state === 'sealed') return `sealed · ${c.resolved} clean resolutions across ${c.days} days`;
    const left = `${need(c.resolved)} more clean, on ${need(c.days)} more day${need(c.days) === 1 ? '' : 's'}, to seal`;
    return c.state === 'cleared'
      ? `resolved · tell 1.00 · ${c.resolved} of 3 on ${c.days} of 3 days · ${left}`
      : `live · tell ×${c.tell.toFixed(2)} · triggered ${c.triggered} times · ${left}`;
  };
  return h('div.st-index',
    h('p.st-index-head',
      h('b.mono.fs-3', `${p.sealed}`), h('span.muted', ` / ${p.total} sealed`),
      h('span.fs-1.muted', ` · ${p.live} live · ${p.cleared} cleared · ${p.untouched} never triggered`)),
    barRows([
      { key: 'sealed', label: 'Sealed', value: p.sealed, tone: 'gold' },
      { key: 'cleared', label: 'Resolved', value: p.cleared, tone: 'silver' },
      { key: 'live', label: 'Live', value: p.live, tone: 'bronze' },
      { key: 'untouched', label: 'Untouched', value: p.untouched, tone: 'none' },
    ], { max: p.total, empty: 'Nothing triggered yet.' }),
    h('p.fs-1.muted', 'A live tell pays ×1.25, so the mistake you actually make is the best-paying target on the '
      + 'board — right up to the moment you have fixed it. Resolving a tag drops it to ×1.00 the same tick, and '
      + 'sealing retires it for good.'),
    ...roll.map(a => h('div.st-area', { dataset: { area: a.id } },
      h('h3.st-h3', a.label,
        h('span.mono.muted.fs-1', ` ${a.sealed}/${a.total}`)),
      h('ul.st-pattern.st-index-cells', a.tags.map(c => h('li', {
        dataset: { state: c.state, tag: c.tag, wing: c.wing ?? '' },
      },
        h('span.st-pat-head',
          h('b', c.title),
          h('span.mono.st-pat-count', c.state === 'untouched' ? '·' : `×${c.triggered}`),
          h('code.fs-1.muted', c.tag)),
        h('span.fs-1.muted', cellLine(c)),
      ))))),
  );
}

/**
 * Panel 3 — RELIABILITY + CALIBRATION, printed beside the Mock-prediction line (G7). A call is a
 * forecast; this is the forecast's own scorecard. Reliability buckets the window by the rung you
 * called and prints how often you were actually right at that rung; calibration is the rolling Brier
 * over the last 20 informative calls, which is exactly the `calibrated` trophy's bar.
 */
function reliabilityBlock(save) {
  const calls = save.player?.rating?.calls ?? [];
  const win = calls.filter(c => c && Number.isFinite(c.p));
  const last = win.slice(-RATING.calibratedWindow);
  const brier = last.length >= RATING.calibratedWindow
    ? last.reduce((t, c) => t + (c.p - (c.ok ? 1 : 0)) ** 2, 0) / last.length
    : null;
  const rows = CALL_LEVELS.map(lv => {
    const mine = win.filter(c => Math.abs(c.p - lv.p) < 1e-9);
    const ok = mine.filter(c => c.ok).length;
    return { call: lv.id, p: lv.p, n: mine.length, ok, rate: mine.length ? ok / mine.length : null };
  }).filter(r => r.n > 0);
  if (!win.length) {
    return h('div.st-reliability',
      h('h3.st-h3', 'Reliability'),
      h('p.muted.fs-1', 'A call is a forecast, and this is its scorecard. It fills in from the first job: every '
        + 'informative call is bucketed by the rung you called and compared with how often you were actually right.'));
  }
  return h('div.st-reliability',
    h('h3.st-h3', 'Reliability'),
    h('div.table-wrap', h('table.st-table',
      h('thead', h('tr', h('th', 'Called'), h('th', 'Right'), h('th', 'Calls'), h('th', 'Gap'))),
      h('tbody', rows.map(r => h('tr',
        h('td.mono', `${r.call}`),
        h('td.mono', r.rate == null ? '—' : pct(r.rate)),
        h('td.mono', `${r.ok}/${r.n}`),
        h('td.mono', r.rate == null ? '—' : `${r.rate - r.p >= 0 ? '+' : '−'}${Math.abs(Math.round((r.rate - r.p) * 100))}`),
      ))))),
    h('p.st-calibration.fs-1',
      h('span', 'Calibration · rolling Brier '),
      h('b.mono', brier == null ? '—' : n2(brier)),
      h('span.muted', ` over the last ${Math.min(last.length, RATING.calibratedWindow)} of ${RATING.calibratedWindow} informative calls`),
      brier == null ? null : h('span.fs-1', brier <= RATING.calibratedBrierMax
        ? ` · at or under ${n2(RATING.calibratedBrierMax)}` : ` · the bar is ${n2(RATING.calibratedBrierMax)}`)),
    h('p.fs-1.muted', `Brier is the squared gap between what you called and what happened, averaged. `
      + `The rating credit is built on it: c(p, o) = ${CREDIT.base} − ${CREDIT.k}(p − o)², so a perfect call at 85 that lands scores `
      + `${n1(credit(0.85, true))} and the same call that misses scores ${n1(credit(0.85, false))}.`),
  );
}

/* ------------------------------------------------------------------ mount */

/** Which trophy groups are open — kept across re-renders and remounts. */
const openGroups = new Set(['firsts', 'craft', 'runs', 'habit']);

export function mountStats() {
  return (root) => {
    const screen = h('section.screen.stats', { 'aria-labelledby': 'st-title' });
    root.append(screen);

    function render() {
      const save = getState();
      const today = todayISO();
      const yesterday = addDays(today, -1);
      const daily = save.daily || {};
      const days14 = lastDays(14, today);
      const runs = Array.isArray(save.runs) ? save.runs : [];
      // THE JOB's panels are drawn only while the layer is on — one switch in Settings kills it and
      // this screen goes back to exactly what it is today (G7, G9 #10).
      const game = gameOn(save);
      screen.replaceChildren();

      /* ---------- title + ghost target ---------- */
      const xpToday = Math.round(daily[today]?.xp ?? 0);
      const xpYest = Math.round(daily[yesterday]?.xp ?? 0);
      const goal = save.settings?.dailyGoal ?? 400;
      screen.append(h('header.st-top',
        h('h1#st-title', 'You vs. you'),
        h('p.st-ghost',
          h('span.mono', `${xpToday}`), ' / ', h('span.mono', `${xpYest}`), ' XP',
          h('span.muted.fs-1', xpYest === 0 ? ' — nothing to beat yet, set the bar today.'
            : xpToday >= xpYest ? ' — you beat yesterday.' : ` — beat yesterday: ${xpYest - xpToday} to go.`)),
        h('p.muted.fs-1', `Daily goal ${goal} XP · streak ${save.streak?.count ?? 0} (best ${save.streak?.best ?? 0})`),
        h('nav.st-jump', { 'aria-label': 'Sections' },
          [['st-progress', 'Progress'], ['st-skills', 'Skills'], ['st-bests', 'Bests'],
           ...(game ? [['st-ledger', 'Ledger'], ['st-index', 'Fault Index']] : []),
           ['st-trophies', 'Trophies'], ['st-patterns', 'Patterns'], ['st-errors', 'Errors']]
            .map(([id, label]) => h('a.chip', { href: `#/stats`, onclick: (ev) => { ev.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, label))),
      ));

      /* ---------- progress: readiness, XP bars, rarity ---------- */
      const log = Array.isArray(save.forecastLog) ? save.forecastLog : [];
      const logByDay = new Map(log.filter(p => p && typeof p.day === 'string').map(p => [p.day, p.r]));
      const rPoints = days14.map(d => ({ day: d, value: Number.isFinite(logByDay.get(d)) ? logByDay.get(d) : null }));
      const R = readiness(save);                      // the published number, exactly as Home and Settings print it
      const rNow = R.r;
      const rFirst = rPoints.find(p => Number.isFinite(p.value))?.value ?? null;
      const band = `${R.band.label}${R.provisional ? ' · provisional' : ''}`;
      setHeader({ readiness: R.r, provisional: R.provisional });   // T01: screens push what only they know

      const cov = coverage(save);
      const hist = rarityHistogram(save, { families: false });   // the 164 originals — the same total the Binder prints
      const famHist = rarityHistogram(save, { families: true });

      screen.append(section('st-progress', 'Progress',
        h('div.st-readi',
          h('div.st-readi-num',
            h('b.mono.fs-5', n0(rNow)),
            h('span.fs-1.muted', ` ${band}`)),
          h('div.st-readi-spark', sparkline(rPoints, {
            min: 0, max: 100, label: 'Readiness over the last 14 days',
            empty: 'Readiness is logged once a day — the line starts tomorrow.',
          })),
          rFirst == null ? null : h('p.fs-1.muted',
            rFirst === rNow ? 'Level with the first logged day.'
              : `${rNow >= rFirst ? '+' : ''}${n0(rNow - rFirst)} over ${rPoints.filter(p => Number.isFinite(p.value)).length} logged days.`),
        ),
        h('h3.st-h3', 'XP, last 14 days'),
        barRows(days14.map(d => ({
          key: d, label: `${dayLabel(d)} ${shortDate(d)}`,
          value: Math.round(daily[d]?.xp ?? 0),
          tone: daily[d]?.goalMet ? 'ok' : '',
        })), { max: Math.max(goal, ...days14.map(d => Math.round(daily[d]?.xp ?? 0))), empty: 'No days logged yet.' }),
        h('h3.st-h3', 'Rarity'),
        h('p.fs-1.muted', `${cov.cleared} of ${cov.total} cleared — the Binder is ${pct(cov.frac)} full.`),
        barRows([
          { key: 'platinum', label: 'Platinum', value: hist.platinum, tone: 'plat' },
          { key: 'gold', label: 'Gold', value: hist.gold, tone: 'gold' },
          { key: 'silver', label: 'Silver', value: hist.silver, tone: 'silver' },
          { key: 'bronze', label: 'Bronze', value: hist.bronze, tone: 'bronze' },
          { key: 'none', label: 'Not cleared', value: hist.none, tone: 'none' },
        ], { empty: 'No tiles yet.' }),
        h('p.fs-1.muted', `Family tiles (Algebra Review): ${['platinum', 'gold', 'silver', 'bronze']
          .map(k => `${famHist[k] - hist[k]} ${k}`).filter(s => !s.startsWith('0 ')).join(' · ') || 'none started'} of 4.`),
        h('h3.st-h3', 'First try, last 14 days'),
        (() => {
          const ft = firstTryByDay(save, days14);
          const seen = ft.filter(p => Number.isFinite(p.value));
          return h('div',
            h('div.st-readi-spark', sparkline(ft, {
              min: 0, max: 100, label: 'First-try percent over the last 14 days', unit: '%',
              empty: 'No graded submits logged yet — this line is the share you get right on the first try.',
            })),
            seen.length ? h('p.fs-1.muted',
              `${n0(seen[seen.length - 1].value)}% on ${shortDate(seen[seen.length - 1].day)} · ${n0(seen.reduce((t, p) => t + p.value, 0) / seen.length)}% average over ${seen.length} day${seen.length === 1 ? '' : 's'}`) : null);
        })(),
      ));

      /* ---------- skills ---------- */
      const sr = skillStates(save);     // T10's own view, so Home and Stats draw identical bars
      screen.append(section('st-skills', 'Skills',
        h('p.fs-1.muted', 'Shown mastery is held back until five attempts, so two lucky clears never read green. Grey means untested.'),
        h('ul.st-skills', sr.map(s => h('li', { dataset: { untested: String(s.untested), mastered: String(s.mastered), weak: String(s.weak) } },
          h('span.st-skill-name', ...softWrap(s.name)),   // ticket FINAL: break after '/', never inside "Never"
          h('span.st-bar-track', h('span.st-bar-fill', { style: { width: `${s.mShown}%` } })),
          h('span.st-bar-val.mono', s.untested ? '—' : n0(s.mShown)),
          h('span.st-skill-meta.muted.fs-1', s.untested ? 'untested' : `n=${s.n}${s.mastered ? ' · mastered' : ''}${s.placed ? ' · placed' : ''} · w${s.w}`),
          s.weak ? h('a.btn.btn-ghost.st-skill-drill', { href: `#/run/drill/${s.id}` }, 'Drill 5') : null,
        ))),
      ));

      /* ---------- bests ---------- */
      const upgradeBest = bestByKey(runs, r => (kindOf(r) === 'upgrade' ? sheetOfRun(r) : null));
      const pageBest = bestByKey(runs, r => (kindOf(r) === 'page' && pageLen(r) != null ? String(pageLen(r)) : null));
      const bossRuns = runs.filter(r => r && bossOf(r) && wonRun(r));
      const bossBest = bestByKey(bossRuns, r => bossOf(r));

      const sheetRows = sheets.filter(s => !s.bonus).map(s => {
        const r = upgradeBest.get(s.id);
        return { sheet: s, run: r };
      }).filter(x => x.run);

      screen.append(section('st-bests', 'Personal bests',
        h('h3.st-h3', 'Per sheet — fastest Upgrade run'),
        sheetRows.length
          ? h('div.table-wrap', h('table.st-table',
            h('thead', h('tr', h('th', 'Sheet'), h('th', 'Time'), h('th', 'XP'), h('th', 'Misses'))),
            h('tbody', sheetRows.map(({ sheet, run }) => h('tr',
              h('td', sheet.name),
              h('td.mono', fmtDur(runMs(run))),
              h('td.mono', xpCell(run)),
              h('td.mono', run.items?.length ? n0(run.items.length - correctCount(run)) : '—'),
            )))))
          : h('p.muted.fs-1', 'No Upgrade run yet — a sheet gets a best time the first time you run it end to end.'),

        h('h3.st-h3', 'Per Page — by length'),
        pageBest.size
          ? h('div.table-wrap', h('table.st-table',
            h('thead', h('tr', h('th', 'Items'), h('th', 'Time'), h('th', 'XP'), h('th', 'Clean'))),
            h('tbody', [...pageBest.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([len, run]) => h('tr',
              h('td.mono', len),
              h('td.mono', fmtDur(runMs(run))),
              h('td.mono', xpCell(run)),
              h('td.mono', run.items?.length ? `${correctCount(run)}/${run.items.length}` : '—'),
            )))))
          : h('p.muted.fs-1', 'No finished Page yet.'),

        h('h3.st-h3', 'Per boss — best time'),
        bossBest.size
          ? h('div.table-wrap', h('table.st-table',
            h('thead', h('tr', h('th', 'Boss'), h('th', 'Time'), h('th', 'Hearts'), h('th', 'Splits'))),
            h('tbody', [...bossBest.entries()].map(([id, run]) => h('tr',
              h('td', bossById[id]?.name ?? id),
              h('td.mono', fmtDur(runMs(run))),
              h('td.mono', flawlessRun(run) ? '3 · flawless' : n0(run.hearts)),
              h('td.mono.muted', Array.isArray(run.splits) && run.splits.length ? `${run.splits.length} on seed ${String(run.seed).slice(0, 6)}` : '—'),
            )))))
          : h('p.muted.fs-1', 'No boss beaten yet.'),

        (() => {
          // Mocks, Baselines and the Night-Before mini-mock — every run Readiness scores as `A` (S4).
          const mocks = runs.filter(r => MOCK_KINDS.has(kindOf(r)) && r.status === 'done');
          if (!mocks.length) return h('p.muted.fs-1', 'No Mock submitted yet — the first one locks Readiness.');
          return h('div',
            h('h3.st-h3', 'Mocks'),
            h('div.table-wrap', h('table.st-table',
              h('thead', h('tr', h('th', 'Run'), h('th', 'Score'), h('th', 'Predicted'), h('th', 'Time'))),
              h('tbody', mocks.slice(-6).reverse().map(r => h('tr',
                h('td.mono', `${kindOf(r)} ${n0(r.n)}`),
                h('td.mono', accuracyOf(r) != null ? pct(accuracyOf(r)) : Number.isFinite(r.score) ? n0(r.score) : '—'),
                h('td.mono', Number.isFinite(r.pred) ? n0(r.pred) : '—'),
                h('td.mono', fmtDur(runMs(r))),
              ))))));
        })(),
        // J7: the forecast scorecard sits beside the Mock-prediction column, because a Call and a Mock
        // prediction are the same kind of claim and are scored by the same `call.credit` (G7).
        game ? reliabilityBlock(save) : null,
      ));

      /* ---------- THE JOB: the Ledger, the crew grid and the Fault Index (G7 · J7) ---------- */
      if (game) {
        screen.append(section('st-ledger', 'The Ledger',
          h('p.fs-1.muted', 'The game’s own leaderboard-of-self. Nothing here is staked, spent or lost: LOOSE and '
            + 'BAGGED evaporate at the end of every job, and these are the records they left behind.'),
          ledgerPanel(save),
          h('h3.st-h3', 'Crew'),
          crewGrid(save),
        ));
        screen.append(section('st-index', 'Fault Index',
          h('p.fs-1.muted', 'Sixty-eight entries, one per misconception tag, grouped by the eleven areas the Patterns '
            + 'panel uses. This is the collection whose completion certificate is a list of mistakes you no longer make.'),
          faultIndexPanel(save),
        ));
      }

      /* ---------- trophies ---------- */
      const tro = trophySummary(save);
      const earned = tro.filter(t => t.earned).length;
      screen.append(section('st-trophies', `Trophies · ${earned}/${tro.length}`,
        h('p.fs-1.muted', 'Every unearned trophy prints exactly what it takes. Nothing here is hidden.'),
        ...GROUPS.map(g => {
          const items = tro.filter(t => t.group === g.id);
          if (!items.length) return null;
          const got = items.filter(t => t.earned).length;
          return h('details.st-trogroup', {
            open: openGroups.has(g.id),
            ontoggle: (ev) => { if (ev.currentTarget.open) openGroups.add(g.id); else openGroups.delete(g.id); },
          },
            h('summary', h('span', g.label), h('span.mono.muted.fs-1', ` ${got}/${items.length}`)),
            h('ul.st-trophies', items.map(t => h('li', { dataset: { earned: String(t.earned) } },
              h('span.st-tro-mark', { 'aria-hidden': 'true' }, t.earned ? '🏆' : '·'),
              h('span.st-tro-body',
                h('b.st-tro-name', t.name),
                h('span.st-tro-cond.fs-1', t.cond),
                t.progress && !t.earned
                  ? h('span.st-tro-prog',
                    h('span.st-bar-track', h('span.st-bar-fill', { style: { width: `${t.progress.pct * 100}%` } })),
                    h('span.mono.fs-1', `${t.progress.have}/${t.progress.need}`))
                  : null),
            ))));
        }),
      ));

      /* ---------- patterns ---------- */
      const errors = Array.isArray(save.errors) ? save.errors : [];
      const counts = {};
      for (const e of errors) for (const tag of (Array.isArray(e?.tags) ? e.tags : [])) counts[tag] = (counts[tag] ?? 0) + 1;
      const areas = groupByArea(counts);
      screen.append(section('st-patterns', 'Patterns',
        areas.length
          ? h('div', areas.map(a => h('div.st-area',
            h('h3.st-h3', a.label),
            h('ul.st-pattern', a.tags.map(t => h('li',
              h('span.st-pat-head',
                h('b', t.title), h('span.mono.st-pat-count', `×${t.count}`),
                h('code.fs-1.muted', t.tag)),
              h('span.fs-1', t.fix),
            ))))))
          : h('p.muted.fs-1', 'No pattern yet — misconception tags show up here the first time one repeats.'),
      ));

      /* ---------- errors ---------- */
      const recent = errors.slice(-30).reverse();
      const open = recent.filter(e => !e?.cleared).length;
      screen.append(section('st-errors', `Errors · ${open} open`,
        h('p.st-error-actions',
          h('a.btn.btn-primary', { href: '#/run/missed' }, 'Run the misses'),
          h('a.btn', { href: '#/run/drill' }, 'Drill 5')),
        recent.length
          ? h('ul.st-errors', recent.map(e => {
            const href = replayHref(save, e);
            const tags = (Array.isArray(e.tags) ? e.tags : []).map(t => lookup(t));
            return h('li', { dataset: { cleared: String(!!e.cleared) } },
              h('span.st-err-main',
                h('span.mono.st-err-id', errorLabel(e)),
                e.got ? h('span.st-err-got.mono.fs-1', `you wrote ${String(e.got).slice(0, 40)}`) : null,
                tags.length ? h('span.st-err-fix.fs-1', tags[0].fix) : null),
              h('span.st-err-side',
                h('span.mono.fs-1.muted', localDayOf(e.t) ? shortDate(localDayOf(e.t)) : ''),
                href ? h('a.btn.btn-ghost', { href }, e.cleared ? 'Replay' : 'Rematch') : null),
            );
          }))
          : h('p.muted.fs-1', 'Nothing missed yet — that changes today.'),
      ));
    }

    render();
    const off = subscribe((s, reason) => { if (reason === 'update' || reason === 'import' || reason === 'reset') render(); });
    return () => off();
  };
}

export default mountStats;
