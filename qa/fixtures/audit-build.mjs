// qa/fixtures/audit-build.mjs — the fixture builder behind qa/audit-states.mjs (ticket AUDIT-STATES).
// Dev-only; never served, never imported by anything under site/.
//
//   node qa/fixtures/audit-build.mjs            → (re)writes qa/fixtures/audit/*.json
//   node qa/fixtures/audit-build.mjs 2026-09-20 → builds them anchored on that day
//
// Every save here is BUILT from the app's own modules (store.fresh + page.startPage + mock.startRun +
// mock.submitRun), never hand-typed JSON: the shapes stay correct when the save shape changes, and a
// fixture can never claim a state the engine cannot reach. Each file carries `auditAnchor` (the ISO day
// it was built for); `reanchor()` below shifts every timestamp in a save by whole days, so a fixture
// built in September still says "test in 6 days" in December. qa/audit-states.mjs re-anchors on load,
// so these files never go stale and never need rebuilding on a schedule.
//
// The committed qa/fixtures/midweek.json is READ (as the base for the mid-week states) and never written.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fresh, pack, unpack } from '../../site/js/store.js';
import { todayISO, addDays, daysUntilTest } from '../../site/js/days.js';
import { composeOpts } from '../../site/js/plan.js';
import { startPage, resumePage, markItem } from '../../site/js/page.js';
import { variantsFrom } from '../../site/js/screens/run.js';
import { mods as mockMods, startRun, setItemAnswer, submitRun } from '../../site/js/screens/mock.js';
import { itemFor } from '../../site/data/blueprint.js';
import { correctRaw } from '../../tests/_helpers.mjs';

export const FIX_DIR = join(dirname(fileURLToPath(import.meta.url)), 'audit');
export const MIDWEEK = join(dirname(fileURLToPath(import.meta.url)), 'midweek.json');
const DAY = 86400000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ re-anchoring */

/** Whole-day difference between two ISO days (b − a). */
export function dayDelta(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / DAY);
}

/**
 * reanchor(value, days) → a deep copy with every date moved `days` days later:
 *   • epoch-ms numbers (> 1e12) get + days·86 400 000
 *   • 'YYYY-MM-DD' strings — as values AND as object keys (save.daily) — get + days
 * Everything else is copied untouched. This is what keeps a built fixture usable on any later day.
 */
export function reanchor(value, days) {
  if (!days) return structuredClone(value);
  const walk = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) > 1e12 ? v + days * DAY : v;
    if (typeof v === 'string') return ISO_RE.test(v) ? addDays(v, days) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[ISO_RE.test(k) ? addDays(k, days) : k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value);
}

/** The anchor day stamped into a built fixture (or null for a foreign save). */
export const anchorOf = (obj) => (obj && typeof obj.auditAnchor === 'string' && ISO_RE.test(obj.auditAnchor) ? obj.auditAnchor : null);

/** Move a built fixture onto `today` and drop the stamp — what audit-states.mjs hands to the browser. */
export function freshen(obj, today = todayISO()) {
  const anchor = anchorOf(obj);
  const out = reanchor(obj, anchor ? dayDelta(anchor, today) : 0);
  delete out.auditAnchor;
  return out;
}

/* ------------------------------------------------------------------ small helpers */

const stamp = (save, today) => { const o = pack(save); o.auditAnchor = today; return o; };

/** midweek.json as written, with the stamp taken off — it is a marker for `freshen`, not save state. */
function midweekRaw() {
  const o = JSON.parse(readFileSync(MIDWEEK, 'utf8'));
  delete o.auditAnchor;
  return o;
}
const midweekSave = () => unpack(midweekRaw());

/**
 * The mid-week save, moved so its own "today" is `today`.
 *
 * THE STAMP IS THE RULE NOW, and there is only one. midweek.json used to carry no `auditAnchor`, so
 * `freshen()` — which every audit state loads it through — was a NO-OP on it and its `testDate`
 * stayed frozen on the day it was built. On 2026-09-22 that day arrived: `modeFor` read **post**
 * ("the test is done") and `qFor` composed a **40-item** page against the 10 the fixture's name
 * promises, on every state built from it — the five job states and six run states included. This
 * builder's own `testDate + 6` rule was the only thing keeping ITS fixtures honest, and it could not
 * reach the states that read the file directly. The stamp is `testDate − 6`, so the two rules agree
 * exactly on every day; the `testDate` fallback stays for a hand-edited file that loses the stamp.
 */
function midweekBase(today) {
  const raw = midweekRaw();
  const anchor = anchorOf(JSON.parse(readFileSync(MIDWEEK, 'utf8')));
  const anchorTest = raw?.settings?.testDate;
  const days = anchor ? dayDelta(anchor, today)
    : anchorTest && ISO_RE.test(anchorTest) ? dayDelta(anchorTest, addDays(today, 6)) : 0;
  return unpack(reanchor(raw, days));
}

/** A result record shaped like the one card.js writes, for a queue item we are marking done by hand. */
function fakeResult(it, { cleared = true, rarity = 'gold', xp = 40, ms = 42000 } = {}) {
  return {
    id: it.id ?? it.cardId ?? null, kind: it.kind === 'variant' ? 'variant' : 'card',
    cleared, firstTry: cleared, clean: cleared, hints: 0, attempt: 1, rarity: cleared ? rarity : null,
    xp: cleared ? xp : 0, elapsedMs: ms, skill: (it.skills || [])[0] ?? it.skill ?? null, tier: it.tier ?? 2,
    solutionShown: !cleared, reason: cleared ? 'clean' : 'revealed', forCard: it.forCard ?? null,
  };
}

/* ------------------------------------------------------------------ the fixtures */

/** Home right after an aced placement: provisional Readiness, no cards attempted yet. */
export function acedPlacement(today = todayISO()) {
  const now = Date.parse(`${today}T16:30:00`);
  const s = fresh(now - 20 * 60000);
  s.profileId = 'audit-aced';
  s.settings.testDate = addDays(today, 7);
  s.settings.testTime = '08:00';
  s.settings.dailyGoal = 400;
  s.xp = 260;
  s.placement = { done: true, at: now - 10 * 60000, answered: 8, total: 8, skipped: 0, placed: ['M5', 'M12'], results: {} };
  s.jumps = { M5: true, M12: true };
  s.streak = { count: 1, best: 1, lastDay: today, freezes: 0 };
  s.daily = { [today]: { xp: 260, clears: 8, goalMet: false, mockDone: false } };
  for (const [id, m] of [['VOC', 80], ['NOTE', 80], ['CLASS', 80], ['PAIRS', 60], ['ASN-PLP', 80], ['CS-LIN', 40], ['FAC1', 80], ['QUAD-SOLVE', 60]]) {
    s.skills[id] = { m, n: 5, lastAt: now - 9 * 60000, lastDueCorrectAt: null, placedAt: m >= 80 ? now - 9 * 60000 : null };
  }
  return stamp(s, today);
}

/** Today's Page in progress at item 1 (nothing answered). */
export function pageOpen(today = todayISO()) {
  const s = midweekBase(today);
  s.profileId = 'audit-page-open';
  const now = Date.parse(`${today}T16:40:00`);
  s.inProgress = null;
  const { q, ...opts } = composeOpts(s);
  startPage(s, { ...opts, now });
  return stamp(s, today);
}

/** The same Page, four items in (so the head reads "4 of N done" and the card is a mid-page item). */
export function pageMid(today = todayISO(), doneCount = 4) {
  const s = unpack(pageOpen(today));
  s.profileId = 'audit-page-mid';
  const ip = resumePage(s);
  for (let i = 0; i < Math.min(doneCount, ip.queue.length - 1); i++) {
    markItem(s, fakeResult(ip.queue[i], { rarity: i === 1 ? 'silver' : 'gold', xp: i === 1 ? 24 : 40 }), { idx: i });
  }
  return stamp(s, today);
}

/**
 * The Page's Summary: every item done, a family Variant (T-sys → the `fam-sys` tile) in the queue, and a
 * before-snapshot with NO tiles — so every tile the queue touches mints, family tile included.
 */
export function pageDone(today = todayISO()) {
  const s = unpack(pageOpen(today));
  s.profileId = 'audit-page-done';
  const ip = resumePage(s);
  const fam = variantsFrom(['T-sys'], 1, `audit|${today}|fam`, { role: 'weak' });
  ip.queue = ip.queue.slice(0, 9).concat(fam);
  ip.queue.forEach((it, i) => { it.n = i + 1; });
  // one item missed (so the Summary shows a bronze and a "went to the solution" line), the rest clean
  ip.queue.forEach((it, i) => {
    it.done = true;
    it.result = fakeResult(it, i === 3
      ? { cleared: false, rarity: 'bronze', xp: 0, ms: 121000 }
      : { rarity: i % 4 === 1 ? 'silver' : 'gold', xp: i % 4 === 1 ? 24 : 40, ms: 30000 + i * 4000 });
  });
  ip.idx = ip.queue.length;
  ip.meta = { ...(ip.meta || {}), before: { skills: [], readiness: { r: 52, provisional: false }, xp: s.xp - 320, coverage: 9, tiles: {} } };
  // the family tile needs a rarity NOW for the mint to have somewhere to land
  s.variants = { ...(s.variants || {}), 'fam-sys': { clearsGold: 2, goldDays: [addDays(today, -1), today] } };
  return stamp(s, today);
}

/** Home where the Mock is the primary CTA: goal met, test in 3 days, no Mock/Baseline on the save yet. */
export function mockCta(today = todayISO()) {
  const s = midweekBase(today);
  s.profileId = 'audit-mock-cta';
  s.settings.testDate = addDays(today, 3);
  s.inProgress = null;
  s.runs = (s.runs || []).filter(r => !['mock', 'baseline', 'night'].includes(String(r?.kind || '').split(':')[0]));
  s.daily[today] = { xp: 620, clears: 15, goalMet: true, mockDone: false };
  return stamp(s, today);
}

/** An OPEN Mock: 20 items, three answered, sitting on question 4. `audit-states` re-stamps `startedAt`. */
export async function mockOpen(today = todayISO()) {
  const M = await mockMods();
  const s = midweekBase(today);
  s.profileId = 'audit-mock-open';
  s.inProgress = null;
  const now = Date.parse(`${today}T17:00:00`);
  const { run } = startRun(s, { kind: 'mock', seed: `audit|${today}|mock`, pred: 68, now });
  answerItems(run, M, 3);
  run.idx = 3;
  return stamp(s, today);
}

/** A SUBMITTED Mock, so `#/mock/report/N` has a real paper to report on (14 of 20 answered correctly). */
export async function mockDone(today = todayISO()) {
  const M = await mockMods();
  const s = midweekBase(today);
  s.profileId = 'audit-mock-done';
  s.inProgress = null;
  const started = Date.parse(`${today}T15:00:00`);
  const { n, run } = startRun(s, { kind: 'mock', seed: `audit|${today}|report`, pred: 72, now: started });
  answerItems(run, M, 14);
  submitRun(s, n, { M, now: started + 31 * 60000, today });
  return stamp(s, today);
}

/** Fill the first `count` items of an open run with the answer the graders call correct. */
function answerItems(run, M, count) {
  let filled = 0;
  for (const item of run.items) {
    if (filled >= count) break;
    let built = null;
    try { built = itemFor(item, M.T.generate); } catch { built = null; }
    if (!built) continue;
    const card = built.raw ?? built.card ?? built;
    let wrote = false;
    for (const p of (built.parts ?? card?.parts ?? [])) {
      const raw = correctRaw(card, p);
      if (raw === undefined || raw === null) continue;
      if (setItemAnswer(item, p.id, { raw })) wrote = true;
    }
    if (wrote) filled++;
  }
  return filled;
}

/** After the test: the date is behind us, so Home, the plan and /run/post are in post-test mode. */
export function postTest(today = todayISO()) {
  const s = midweekBase(today);
  s.profileId = 'audit-post';
  s.settings.testDate = addDays(today, -2);
  s.inProgress = null;
  return stamp(s, today);
}

/** T−1 (Night Before is the primary action) and T−0 (Test Morning). */
export function nightBefore(today = todayISO()) {
  const s = midweekBase(today);
  s.profileId = 'audit-night';
  s.settings.testDate = addDays(today, 1);
  s.inProgress = null;
  return stamp(s, today);
}
export function testMorning(today = todayISO()) {
  const s = midweekBase(today);
  s.profileId = 'audit-morning';
  s.settings.testDate = today;
  s.settings.testTime = '23:30';          // still ahead of "now", so it is the morning and not the post-test
  s.inProgress = null;
  return stamp(s, today);
}

/** The mid-week save itself, re-anchored on `today` (test in 6 days) — the base most states use. */
export function midweek(today = todayISO()) {
  const s = midweekBase(today);
  s.profileId = 'audit-midweek';
  s.inProgress = null;                    // Home must show its composed CTA, not "Continue page"
  return stamp(s, today);
}

/* ------------------------------------------------------------------ build all */

export const BUILDERS = {
  'midweek.json': midweek,
  'aced.json': acedPlacement,
  'page-open.json': pageOpen,
  'page-mid.json': pageMid,
  'page-done.json': pageDone,
  'mock-cta.json': mockCta,
  'mock-open.json': mockOpen,
  'mock-done.json': mockDone,
  'post.json': postTest,
  'night.json': nightBefore,
  'morning.json': testMorning,
};

export async function buildAll(today = todayISO(), { dir = FIX_DIR, log = () => {} } = {}) {
  mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, fn] of Object.entries(BUILDERS)) {
    const obj = await fn(today);
    const json = JSON.stringify(obj);
    writeFileSync(join(dir, name), json);
    const s = unpack(obj);
    log(`${name.padEnd(16)} ${String(json.length).padStart(6)} chars · T−${daysUntilTest(s.settings?.testDate, today)} · runs ${(s.runs || []).length} · queue ${s.inProgress?.queue?.length ?? 0}`);
    out[name] = obj;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const today = process.argv[2] || todayISO();
  await buildAll(today, { log: (l) => console.log(l) });
  console.log(`wrote ${Object.keys(BUILDERS).length} fixtures to ${FIX_DIR} anchored on ${today}`);
}
