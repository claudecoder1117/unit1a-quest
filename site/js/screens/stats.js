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
      ));

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
