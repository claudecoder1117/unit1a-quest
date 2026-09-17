// qa/fixtures/make-midweek.mjs — builds qa/fixtures/midweek.json, a synthetic mid-week save for screenshots
// (T10). Dev-only; never served. Usage: node qa/fixtures/make-midweek.mjs [YYYY-MM-DD as "today"]
// The save is anchored on "today" (default: the machine's date): created 3 days ago, test in 6 days, three
// Pages done, a Baseline done (so Readiness is NOT provisional), a streak of 3, mixed buckets, two pending
// Rematches, one frozen Variant, weak spots on CS-LIN and PAIRS.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fresh, pack } from '../../site/js/store.js';
import { todayISO, addDays } from '../../site/js/days.js';
import { applyOutcome, recordRematch, freezeVariant, clearRematch } from '../../site/js/schedule.js';
import { logForecast } from '../../site/js/readiness.js';

const today = process.argv[2] || todayISO();
const [y, m, d] = today.split('-').map(Number);
const at = (dayOffset, hh = 17, mm = 0) => new Date(y, m - 1, d + dayOffset, hh, mm).getTime();
const DAY = 86400000;
const now = at(0, 16, 30);

const s = fresh(at(-3, 9, 5));
s.profileId = 'midweek-fixture';
s.settings.testDate = addDays(today, 6);
s.settings.testTime = '08:00';
s.settings.dailyGoal = 400;
s.xp = 1840;
s.placement = { done: true, at: at(-3, 9, 20) };
s.jumps = { M12: true };
s.streak = { count: 3, best: 3, lastDay: addDays(today, -1), freezes: 0 };
s.daily = {
  [addDays(today, -3)]: { xp: 520, clears: 14, goalMet: true, mockDone: true, missesDrilled: true },
  [addDays(today, -2)]: { xp: 610, clears: 16, goalMet: true, mockDone: false },
  [addDays(today, -1)]: { xp: 480, clears: 12, goalMet: true, mockDone: false },
  [today]: { xp: 120, clears: 3, goalMet: false, mockDone: false },
};

// cards: [id, daysAgo, outcome, rarity, cleared, attempts, hints]
const CARDS = [
  ['voc-01', 3, 'clean', 'gold', true, 1, 0], ['voc-02', 3, 'clean', 'gold', true, 1, 0], ['voc-03', 2, 'hints', 'silver', true, 1, 2],
  ['voc-04', 2, 'clean', 'gold', true, 1, 0], ['voc-05', 1, 'clean', 'gold', true, 1, 0], ['voc-06', 1, 'hints', 'gold', true, 1, 1],
  ['def-01', 3, 'clean', 'gold', true, 1, 0], ['def-02', 2, 'wrong', 'bronze', true, 3, 1], ['def-03', 1, 'clean', 'gold', true, 1, 0],
  ['fact-04', 2, 'clean', 'gold', true, 1, 0], ['cls-01', 3, 'clean', 'gold', true, 1, 0], ['cls-02', 2, 'clean', 'gold', true, 1, 0],
  ['not-01', 3, 'clean', 'gold', true, 1, 0], ['not-02', 3, 'hints', 'silver', true, 2, 0], ['not-03', 2, 'clean', 'gold', true, 1, 0],
  ['not-04', 2, 'wrong', 'bronze', true, 3, 1], ['not-05', 1, 'clean', 'gold', true, 1, 0],
  ['ang-wu-1', 3, 'hints', 'silver', true, 2, 0], ['ang-wu-2', 2, 'wrong', null, false, 3, 1], ['ang-wu-3', 1, 'clean', 'gold', true, 1, 0],
  ['ang-02', 2, 'clean', 'gold', true, 1, 0], ['ang-03', 1, 'hints', 'silver', true, 2, 0],
  ['wp-01', 2, 'wrong', null, false, 3, 1], ['wp-02', 1, 'wrong', 'bronze', true, 3, 1], ['wp-04', 1, 'clean', 'silver', true, 1, 0],
  ['asn-01', 3, 'clean', 'gold', true, 1, 0], ['asn-02', 3, 'clean', 'gold', true, 1, 0], ['asn-03', 2, 'wrong', 'bronze', true, 3, 0],
  ['asn-05', 2, 'clean', 'gold', true, 1, 0], ['asn-06', 1, 'hints', 'silver', true, 2, 0], ['asn-10', 1, 'clean', 'gold', true, 1, 0],
  ['qz-01', 2, 'clean', 'gold', true, 1, 0], ['qz-02', 1, 'clean', 'gold', true, 1, 0],
  ['fac-01', 3, 'clean', 'gold', true, 1, 0], ['fac-02', 3, 'clean', 'gold', true, 1, 0], ['fac-03', 2, 'clean', 'gold', true, 1, 0],
  ['fac-04', 2, 'hints', 'silver', true, 2, 0], ['fac-05', 1, 'clean', 'gold', true, 1, 0], ['fac-06', 1, 'clean', 'gold', true, 1, 0],
  ['fac-16', 1, 'wrong', 'bronze', true, 3, 1],
  ['quad-01', 2, 'clean', 'gold', true, 1, 0], ['quad-02', 1, 'hints', 'silver', true, 1, 2],
];
for (const [id, ago, outcome, rarity, cleared, attempts, hints] of CARDS) {
  const t = at(-ago, 17, 10);
  // walk the bucket up from 0 over a few sessions so mixed buckets exist
  const rec = applyOutcome(s, id, 'clean', { now: t - 2 * DAY });
  if (ago >= 2) applyOutcome(s, id, 'clean', { now: t - DAY });
  applyOutcome(s, id, outcome, { now: t });
  Object.assign(rec, { attempts, cleared, rarity, hintsUsed: hints, solutionShown: outcome === 'wrong' && attempts >= 3, bestMs: 40000 + attempts * 20000,
    history: [{ at: t, ok: cleared, attempt: attempts, hints, ms: 40000 + attempts * 20000 }] });
  if (outcome === 'wrong' && !cleared) rec.lastFirstTry = false;
  if (/^(wp|ang-0)/.test(id)) rec.setupTried = true;
}
// a few reviews are due right now (overdue by 0–2 days), the rest later this week
for (const id of ['voc-01', 'def-01', 'not-02', 'ang-wu-1', 'fac-02', 'asn-02', 'asn-03', 'quad-01', 'cls-01']) s.cards[id].due = now - (1 + (id.length % 3)) * DAY * 0.5;

s.skills = {
  VOC: { m: 72, n: 9, lastAt: at(-1), lastDueCorrectAt: at(-1), placedAt: at(-3) },
  NOTE: { m: 55, n: 6, lastAt: at(-1), lastDueCorrectAt: null, placedAt: at(-3) },
  CLASS: { m: 90, n: 5, lastAt: at(-2), lastDueCorrectAt: at(-2), placedAt: at(-3) },
  PAIRS: { m: 40, n: 3, lastAt: at(-1), lastDueCorrectAt: null, placedAt: null },
  'ASN-PLP': { m: 66, n: 5, lastAt: at(-1), lastDueCorrectAt: null, placedAt: at(-3) },
  'ASN-ANG': { m: 62, n: 4, lastAt: at(-1), lastDueCorrectAt: null, placedAt: null },
  'CS-LIN': { m: 30, n: 2, lastAt: at(-1), lastDueCorrectAt: null, placedAt: null },
  SYS: { m: 80, n: 5, lastAt: at(-2), lastDueCorrectAt: null, placedAt: at(-2) },
  FAC2: { m: 80, n: 7, lastAt: at(-1), lastDueCorrectAt: at(-1), placedAt: at(-3) },
  'QUAD-SOLVE': { m: 50, n: 5, lastAt: at(-1), lastDueCorrectAt: null, placedAt: at(-3) },
};
recordRematch(s, { item: 'ang-wu-2', got: '∠AFB, ∠BFC', tags: ['not-adjacent'], now: at(-2, 17, 30) });
recordRematch(s, { item: 'wp-01', got: '73', tags: ['gave-complement'], now: at(-2, 17, 40) });
recordRematch(s, { item: 'T-cs-lin#3f0a9c', seed: 'p1-w0', template: 'T-cs-lin', forCard: 'wp-02', got: '12', tags: ['stopped-early'], now: at(-1, 17, 20) });
recordRematch(s, { item: 'def-02', got: 'ray', tags: [], now: at(-2, 17, 5) });
clearRematch(s, 'def-02');
freezeVariant(s, { id: 'T-factor-a2#9c1e2b', template: 'T-factor-a2', seed: 'p2-w1', templateVersion: 1 }, { forCard: 'fac-01', now: at(-2, 17, 50) });
s.frozen['T-factor-a2#9c1e2b'].due = now - DAY;
s.variants = { 'fam-sys': { clearsGold: 1, goldDays: [addDays(today, -1)] } };
s.counters = { setups: 6, pages: 3 };
s.trophies = { 'first-blood': { at: at(-3, 9, 40) }, 'streak-3': { at: at(-1, 18) } };
s.runs = [
  { kind: 'baseline', n: 1, seed: 'baseline#1', startedAt: at(-3, 9, 30), submittedAt: at(-3, 9, 44), limitMs: 1200000, tabAway: 0, status: 'done', items: [], score: 70, pred: 60, splits: [], flagged: false },
  { kind: 'page', n: 1, seed: 'page#1', startedAt: at(-3, 16, 30), submittedAt: at(-3, 16, 52), status: 'done', items: [], score: 14 },
  { kind: 'page', n: 2, seed: 'page#2', startedAt: at(-2, 16, 40), submittedAt: at(-2, 17, 5), status: 'done', items: [], score: 16 },
  { kind: 'page', n: 3, seed: 'page#3', startedAt: at(-1, 16, 35), submittedAt: at(-1, 16, 58), status: 'done', items: [], score: 12 },
];
s.forecastLog = [];
logForecast(s, { today: addDays(today, -3), r: 22 });
logForecast(s, { today: addDays(today, -2), r: 31 });
logForecast(s, { today: addDays(today, -1), r: 38 });
s.seedCounter = 9;
s.inProgress = null;

const out = join(dirname(fileURLToPath(import.meta.url)), 'midweek.json');
writeFileSync(out, JSON.stringify(pack(s)));
console.log(`wrote ${out} (${JSON.stringify(pack(s)).length} chars) anchored on ${today}, test ${s.settings.testDate}`);
