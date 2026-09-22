// data/trophies.js — the trophy catalogue (COMPOSED S4 "Trophies", S8 #11).
//
// Every trophy is a PURE PREDICATE over the save plus a student-facing condition line. Unearned tiles
// print their `cond` verbatim — there are no mystery boxes (S4). `js/trophies.js` evaluates the whole
// list after every grade, records the newly earned ones in `save.trophies[id] = {at}` and toasts them
// for 1.5 s under the header.
//
// A definition is:
//   { id, name, cond, group, test(ctx) -> boolean, progress?(ctx) -> {have, need}, counter?, need? }
//
// `ctx` is built by js/trophies.js `makeCtx(save)` (see its JSDoc); it is the ONLY thing a predicate may
// read, so a predicate can never reach localStorage, the DOM or the clock. Its shape:
//   ctx.save            the save object (read-only by convention)
//   ctx.n(key)          counter value, 0 when absent          (save.counters[key])
//   ctx.best(key)       max(counters[key], counters[key+'Best'])  — for "consecutive"/"in a row" counters
//   ctx.rec(id)         cards[id] record, or an empty object
//   ctx.cleared(id)     the card has been cleared at least once
//   ctx.tile(id)        tile rarity: 'bronze'|'silver'|'gold'|'platinum'|null (family tiles included)
//   ctx.gold(id)        tile rarity is gold or platinum
//   ctx.plat(id)        tile rarity is platinum
//   ctx.allCleared(ids) / ctx.allGold(ids) / ctx.allPlat(ids)
//   ctx.runs            save.runs (newest last)
//   ctx.someRun(fn)     any run satisfies fn(run, helpers)
//   ctx.streakBest      max(streak.count, streak.best)
//   ctx.clearedIds      Set of every non-bonus manifest id cleared at least once
//   ctx.ORIGINALS       every non-bonus manifest id
//   ctx.sheetIds(s)     the non-bonus ORIGINAL ids on a Binder tab (family tiles excluded)
//   ctx.won(run) / ctx.flawless(run) / ctx.accuracy(run) / ctx.localHour(ms)
//
// COUNTERS is the contract for every other ticket: a counter only ever moves through
// `bump(save, key)` / `setBest(save, key, value)` in js/trophies.js, and every key a trophy reads is
// listed here with the exact moment that bumps it. Adding a counter without a line here is a bug.

import { sheets } from './sheets.js';
import { bosses } from './modules.js';
import { manifest } from './source-manifest.js';

/* ------------------------------------------------------------------ counters */

/**
 * save.counters{} — every counter a trophy reads, with the event that moves it and who owns that event.
 * `best: true` means the counter is a *current run* whose high-water mark is kept in `<key>Best`
 * (js/trophies.js `bump`/`resetRun` maintain both; predicates read ctx.best(key)).
 */
export const COUNTERS = Object.freeze({
  setups:       Object.freeze({ label: 'Equation setups right',        owner: 'T09', when: 'an `equation` part graded correct (a skipped setup counts nothing)' }),
  notationClean: Object.freeze({ label: 'Notation clears in a row',    owner: 'T09', best: true, when: 'a clean clear of an M1 `not-*` card (a non-clean clear or a miss calls resetRun)' }),
  rejects:      Object.freeze({ label: 'Roots rejected correctly',     owner: 'T09', when: 'a `reject` part graded correct' }),
  forgeFlash:   Object.freeze({ label: 'Fast factorings in a row',     owner: 'T09', best: true, when: 'a `factored` part cleared in ≤ 30 s (slower or wrong calls resetRun)' }),
  signLead:     Object.freeze({ label: 'Negative-lead factorings',     owner: 'T09', when: 'a negative-lead factoring cleared (fac-16 / T-factor-neg)' }),
  systems:      Object.freeze({ label: 'Systems solved',               owner: 'T09', when: 'a SYS item cleared (doc-07, T-sys, T-fig-system)' }),
  coldRecall:   Object.freeze({ label: 'Cold recalls',                 owner: 'T09', when: 'a review cleared ≥ 2 days after the card was last seen' }),
  asnReasoned:  Object.freeze({ label: 'ASN statements with the reason right', owner: 'T09', when: 'a DISTINCT asn-* cleared with a correct reason chip (count each statement once)' }),
  bothRoots:    Object.freeze({ label: 'ang-10 roots on the first submit', owner: 'T09', when: 'ang-10\'s `roots` part graded correct on attempt 1 with both roots' }),
  twoCases:     Object.freeze({ label: 'ang-05 cases on the first submit', owner: 'T09', when: 'ang-05\'s `cases` part graded correct on attempt 1 with both rows' }),
  comebacks:    Object.freeze({ label: 'Clears after three wrongs',    owner: 'T09', when: 'a card cleared with ≥ 3 wrong submits behind it (js/trophies.js also detects this from card history)' }),
});
export const COUNTER_KEYS = Object.freeze(Object.keys(COUNTERS));

/* ------------------------------------------------------------------ id sets */

/** Every non-bonus manifest id (the Packet's ~164 originals). Family tiles are NOT in here. */
export const ORIGINAL_IDS = Object.freeze(manifest.filter(m => !m.bonus).map(m => m.id));

/** The four generated-only family tiles (S2 M11/M12) — Platinum needs them too (S4 platinum-packet). */
export const FAMILY_IDS = Object.freeze(['fam-quad-a1', 'fam-quad-a2', 'fam-quad-ctx', 'fam-sys']);

/** Binder tabs that hold originals (BONUS excluded — the Bonus bank has no rarity path at all). */
export const TROPHY_SHEETS = Object.freeze(sheets.filter(s => !s.bonus).map(s => Object.freeze({
  id: s.id,
  name: s.name,
  ids: Object.freeze(s.ids.filter(id => !id.startsWith('fam-') && !id.startsWith('bonus-'))),
})));
const sheetIdsById = Object.freeze(Object.fromEntries(TROPHY_SHEETS.map(s => [s.id, s.ids])));

/** The non-bonus ORIGINAL ids on a Binder tab (family tiles excluded). Unknown tab → []. */
export function sheetOriginals(sheetId) {
  return sheetIdsById[sheetId] ?? [];
}

const range = (p, a, b) => { const o = []; for (let n = a; n <= b; n++) o.push(`${p}-${String(n).padStart(2, '0')}`); return o; };
const ASN_36 = Object.freeze(range('asn', 1, 36));
const WP_16 = Object.freeze(range('wp', 1, 16));
const FAC_18 = Object.freeze(range('fac', 1, 18));

/* ------------------------------------------------------------------ groups */

export const GROUPS = Object.freeze([
  Object.freeze({ id: 'firsts', label: 'Firsts' }),
  Object.freeze({ id: 'sheets', label: 'Sheets' }),
  Object.freeze({ id: 'craft', label: 'Craft' }),
  Object.freeze({ id: 'runs', label: 'Runs & tests' }),
  Object.freeze({ id: 'bosses', label: 'Bosses' }),
  Object.freeze({ id: 'habit', label: 'Habit' }),
]);

/* ------------------------------------------------------------------ definitions */

const def = (id, group, name, cond, test, progress = null) =>
  Object.freeze({ id, group, name, cond, test, progress });

/** A counter trophy: earned at `need`, and its unearned tile shows have/need. */
const counterDef = (id, group, name, cond, key, need, { best = false } = {}) =>
  Object.freeze({
    id, group, name, cond, counter: key, need,
    test: ctx => (best ? ctx.best(key) : ctx.n(key)) >= need,
    progress: ctx => ({ have: Math.min(need, best ? ctx.best(key) : ctx.n(key)), need }),
  });

/** A "clear this whole list" trophy. */
const setDef = (id, group, name, cond, ids, kind /* 'clear' | 'gold' | 'plat' */) =>
  Object.freeze({
    id, group, name, cond, need: ids.length,
    test: ctx => (kind === 'gold' ? ctx.allGold(ids) : kind === 'plat' ? ctx.allPlat(ids) : ctx.allCleared(ids)),
    progress: ctx => ({
      have: ids.filter(i => (kind === 'gold' ? ctx.gold(i) : kind === 'plat' ? ctx.plat(i) : ctx.cleared(i))).length,
      need: ids.length,
    }),
  });

const list = [];

/* ---- firsts ---- */
list.push(def('first-blood', 'firsts', 'First Blood',
  'Clear your first card.',
  ctx => ctx.clearedIds.size >= 1,
  ctx => ({ have: Math.min(1, ctx.clearedIds.size), need: 1 })));

list.push(setDef('full-coverage', 'firsts', 'Full Coverage',
  'Clear every item in the packet at least once (Bonus bank not counted).',
  ORIGINAL_IDS, 'clear'));

list.push(Object.freeze({
  id: 'platinum-packet', group: 'firsts', name: 'Platinum Packet',
  cond: 'Take every original tile AND all four family tiles to Platinum. Unlocks the gold Binder cover.',
  need: ORIGINAL_IDS.length + FAMILY_IDS.length,
  test: ctx => ctx.allPlat(ORIGINAL_IDS) && ctx.allPlat(FAMILY_IDS),
  progress: ctx => ({
    have: ORIGINAL_IDS.filter(i => ctx.plat(i)).length + FAMILY_IDS.filter(i => ctx.plat(i)).length,
    need: ORIGINAL_IDS.length + FAMILY_IDS.length,
  }),
}));

/* ---- sheets (one pair per Binder tab) ---- */
for (const s of TROPHY_SHEETS) {
  list.push(setDef(`sheet-clear:${s.id}`, 'sheets', `${s.name} — cleared`,
    `Clear every original on the ${s.name} tab (${s.ids.length}).`, s.ids, 'clear'));
  list.push(setDef(`sheet-gold:${s.id}`, 'sheets', `${s.name} — all Gold`,
    `Take every original on the ${s.name} tab to Gold or better (${s.ids.length}).`, s.ids, 'gold'));
}

/* ---- craft ---- */
list.push(counterDef('both-roots', 'craft', 'Both Roots',
  'Give both of #10\'s roots on the first submit.', 'bothRoots', 1));
list.push(counterDef('two-cases', 'craft', 'Two Cases',
  'Give both of #5\'s cases on the first submit.', 'twoCases', 1));
list.push(counterDef('reject-x5', 'craft', 'Reject ×5',
  'Reject the impossible root correctly 5 times.', 'rejects', 5));
list.push(counterDef('setup-artist', 'craft', 'Setup Artist',
  'Write 20 equation setups correctly.', 'setups', 20));
list.push(counterDef('notation-20', 'craft', 'Notation ×20',
  'Clear 20 notation cards in a row, first try with no hints.', 'notationClean', 20, { best: true }));
list.push(counterDef('sign-master', 'craft', 'Sign Master',
  'Factor 10 negative-lead trinomials.', 'signLead', 10));
list.push(counterDef('forge-flash', 'craft', 'Factor Flash',   // fix5:home r1: no lore (was 'Forge Flash'); id kept for saves
  'Factor 5 in a row in 30 seconds or less each.', 'forgeFlash', 5, { best: true }));
list.push(counterDef('systems-10', 'craft', 'Systems ×10',
  'Solve 10 systems.', 'systems', 10));
list.push(counterDef('cold-recall', 'craft', 'Cold Recall',
  'Get 10 reviews right two or more days after you last saw them.', 'coldRecall', 10));
list.push(counterDef('reasoned-36', 'craft', 'Reasoned 36',
  'Give the right reason on all 36 Always/Sometimes/Never statements.', 'asnReasoned', 36));

list.push(Object.freeze({
  id: 'comeback', group: 'craft', name: 'Comeback',
  cond: 'Clear a card after getting it wrong three times.',
  test: ctx => ctx.n('comebacks') >= 1 || ctx.comebackInHistory(),
  progress: ctx => ({ have: ctx.n('comebacks') >= 1 || ctx.comebackInHistory() ? 1 : 0, need: 1 }),
}));

list.push(setDef('asn-36', 'craft', 'ASN 36',
  'Clear all 36 Always/Sometimes/Never statements.', ASN_36, 'clear'));
list.push(setDef('sixteen', 'craft', 'Sixteen',
  'Take all 16 word problems to Gold or better.', WP_16, 'gold'));
list.push(setDef('forge-18', 'craft', 'Factoring 18',   // fix5:home r1: no lore (was 'Forge 18'); id kept for saves
  'Clear all 18 Kuta factorings.', FAC_18, 'clear'));

/* ---- runs & tests ---- */
list.push(def('oracle', 'runs', 'The Oracle',
  'Score 36 out of 36 in one "Full 36" sitting.',
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'full36' && r.status === 'done'
    && ctx.correctCount(r) >= 36)));

list.push(def('flawless-page', 'runs', 'Flawless Page',
  'Finish a whole Page with every item clean — first try, no hints.',
  /* verify r1 (ledger-invariance), one line added by the `run` lane under BUILD-POLICY §2 — see
     notes/repair-run.md → Requests. A JOB writes a `kind:'page'` row for the queue it DRAFTED, a
     strict subset of the page `composePage` dealt (mean 45 % over 60 corpus saves), so seven clean
     answers were buying the trophy twenty clean answers buy on `#/run/page`. `screens/run.js
     commitJobRun` now stamps `partial` on the row by comparing its own `drafted` against the
     `composed` count the page carries; a job that deals a WHOLE page is not partial and still
     earns this. Rows written by the flat route carry no `partial` key and are unaffected. */
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'page' && r.status === 'done' && r.partial !== true
    && Array.isArray(r.items) && r.items.length > 0 && (r.flawless === true || r.items.every(ctx.isClean)))));

list.push(def('mock-90', 'runs', 'Mock 90',
  'Score 90 % or better on a full Mock.',
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'mock' && r.status === 'done' && (ctx.accuracy(r) ?? 0) >= 0.9)));

list.push(def('predicted-it', 'runs', 'Called It',
  'Predict your Mock score to within 5 points.',
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'mock' && r.status === 'done'
    && Number.isFinite(r.pred) && ctx.accuracy(r) !== null
    && Math.abs(r.pred - ctx.accuracy(r) * 100) <= 5)));

list.push(def('night-owl-no', 'runs', 'Not a Night Owl',
  'Finish the Night Before run before 22:00.',
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'night' && r.status === 'done' && ctx.nightCounted(r)   // binder r1: an empty run is not a night
    && ctx.localHour(r.submittedAt) !== null && ctx.localHour(r.submittedAt) < 22)));

/* ---- bosses ---- */
for (const b of bosses) {
  list.push(def(`boss:${b.id}`, 'bosses', `${b.name}`,
    `Beat ${b.id} — ${b.name}.`,
    ctx => ctx.someRun(r => ctx.bossOf(r) === b.id && ctx.won(r))));
  list.push(def(`boss-flawless:${b.id}`, 'bosses', `${b.name} — flawless`,
    `Beat ${b.id} — ${b.name} without losing a heart.`,
    ctx => ctx.someRun(r => ctx.bossOf(r) === b.id && ctx.won(r) && ctx.flawless(r))));
}

/* ---- THE JOB (COMPOSED-GAME G7 "data/trophies.js": six pure predicates) ----
   Every one of these reads `ctx.save.player` / `ctx.save.game` — the game layer's two keys — and
   nothing else, so they stay what every predicate in this file is: a pure function of the save with no
   clock, no DOM and no import from js/. With `settings.game = false` the two keys never move, so the
   six tiles simply never fill and print their condition like any other unearned tile (S4).            */

/**
 * The four wings of G3.4, repeated here rather than imported. `data/job.js` is 41 KB of constants on a
 * boot path a student with the layer off never needs — the same call `store.js` makes and for the same
 * reason (notes/J10.md §Deviations). `tests/job-index.test.mjs` asserts this map deep-equals
 * `data/job.js`'s own `WINGS`, so the two can never drift.
 */
const GAME_WINGS = Object.freeze({
  RECALL: Object.freeze(['VOC', 'NOTE', 'CLASS', 'ASN-PLP', 'ASN-ANG']),
  FIGURES: Object.freeze(['PAIRS', 'FIG-ALG', 'BISECT-L', 'BISECT-Q', 'SEG-ALG']),
  WORDS: Object.freeze(['CSARITH', 'CS-LIN', 'CS-RATIO', 'CS-QUAD']),
  ALGEBRA: Object.freeze(['SYS', 'FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX']),
});
export const GAME_WING_IDS = Object.freeze(Object.keys(GAME_WINGS));

/** G2 — the Fault Index is 68 entries; a tag is SEALED at 3 clean resolutions across 3 distinct days. */
const INDEX_TAGS = 68;
/** The `index-25` waypoint — `data/job.js` FAULT_INDEX.milestones[0]. */
const INDEX_PART = 25;
/** G3.1 / RATING — the `calibrated` window and its Brier bar. */
const CALIBRATED_WINDOW = 20;
const CALIBRATED_BRIER_MAX = 0.10;
/** G2 — the chain caps its multiplier at 8. */
const CHAIN_DEEP = 8;
/** G2 `m_chain = 1 + 0.2·min(chain, 8)` — the multiplier that cap is worth. */
const CHAIN_MULT_CAP = 2.6;

/* Every number above is repeated here rather than imported, for the same reason GAME_WINGS is (below):
 * `data/job.js` is 41 KB of constants on a boot path a student with the layer off never needs.
 * `tests/job-meta-constants.test.mjs` asserts each one equals its `data/job.js` original, so the two
 * can never drift — and every sentence below INTERPOLATES them rather than restating them, so a
 * rebalance moves the prose and the predicate together or fails the suite. */

const num = (x) => (Number.isFinite(x) ? x : 0);
const gameOf = (ctx) => (ctx.save && typeof ctx.save.game === 'object' && ctx.save.game ? ctx.save.game : {});
const playerOf = (ctx) => (ctx.save && typeof ctx.save.player === 'object' && ctx.save.player ? ctx.save.player : {});
const recordsOf = (ctx) => { const p = playerOf(ctx); return p.records && typeof p.records === 'object' ? p.records : {}; };

/** How many of the four wings hold a manned crew mark (rank 1 STEADY or 2 HELD). */
function wingsManned(ctx) {
  const crew = gameOf(ctx).crew;
  if (!crew || typeof crew !== 'object') return 0;
  let n = 0;
  for (const id of GAME_WING_IDS) if (GAME_WINGS[id].some(make => crew[make] === 1 || crew[make] === 2)) n++;
  return n;
}

/** How many of the 68 tags are sealed. */
function sealedTags(ctx) {
  const tags = gameOf(ctx).tags;
  if (!tags || typeof tags !== 'object') return 0;
  let n = 0;
  for (const k of Object.keys(tags)) { const t = tags[k]; if (t && typeof t === 'object' && t.sealed === true) n++; }
  return Math.min(INDEX_TAGS, n);
}

/** The deepest chain the save can prove: the ledger record, or the job running right now. */
function bestChain(ctx) {
  const rec = num(recordsOf(ctx).bestChain);
  const live = ctx.save && ctx.save.inProgress && ctx.save.inProgress.game;
  return Math.max(rec, live && typeof live === 'object' ? num(live.chain) : 0);
}

/**
 * The rolling Brier over the last 20 INFORMATIVE calls.
 *
 * WHAT `save.player.rating.calls` HOLDS (round-2 window fix, and this comment was wrong about it
 * until round 3). It holds the last **50 CALLS**, not the last 50 informative ones: a call whose
 * weight is under `RATING.informativeMin` still takes its slot and is stored as a **blank slot**
 * with `p: null, w: 0` (`js/job/call.js callEntry`, and the banner at `windowPush` — "This used to
 * `return list` unchanged when `w < 0.25` … Every call now takes its slot"). So the
 * `Number.isFinite(c.p)` filter below is what SELECTS the informative calls. It is load-bearing,
 * not defensive: drop it and farmed blank slots feed the `calibrated` trophy, which is the exact
 * material the informative gate exists to exclude.
 *
 * AND THE FILTER COMES FIRST. `slice(-size)` before the filter asks for the last twenty SLOTS to
 * all be informative, which is a different and far harder claim than the one this trophy publishes
 * ("over 20 informative calls") — and it disagreed with the other surface that prints this same
 * number (`screens/stats.js reliabilityBlock`, which filters first). Measured on a 50-slot window
 * that alternates a calibrated 85-call at q̂ = 0.85 with a blank on mastered material: 25
 * informative calls at a true Brier of 0.0225, which Stats printed as "at or under 0.10" while
 * this predicate returned `null` and the trophy stayed unearned for ever.
 *
 * One entry is `{p, ok, w, …}`, so the Brier term is `(p − o)²` — the same quantity
 * `credit(p, ok) = 10 − 40(p − o)²` is built on. Fewer than 20 informative calls is not a
 * calibrated student yet, so it returns null rather than a flattering mean.
 */
function rollingBrier(ctx, size = CALIBRATED_WINDOW) {
  const r = playerOf(ctx).rating;
  const calls = r && Array.isArray(r.calls) ? r.calls : [];
  const informative = calls.filter(c => c && typeof c === 'object' && Number.isFinite(c.p));
  const win = informative.slice(-size);
  if (win.length < size) return null;
  let sum = 0;
  for (const c of win) { const d = c.p - (c.ok ? 1 : 0); sum += d * d; }
  return sum / win.length;
}

list.push(def('crew-held', 'craft', 'Crew Held',
  'Have a crew manned in all four wings — RECALL, FIGURES, WORDS and ALGEBRA — at the same time.',
  ctx => wingsManned(ctx) >= GAME_WING_IDS.length,
  ctx => ({ have: wingsManned(ctx), need: GAME_WING_IDS.length })));

list.push(def('index-25', 'craft', 'Twenty-five Sealed',
  `Seal ${INDEX_PART} entries in the Fault Index. A tag seals after three clean resolutions on three different days with no re-trigger in between.`,
  ctx => sealedTags(ctx) >= INDEX_PART,
  ctx => ({ have: Math.min(INDEX_PART, sealedTags(ctx)), need: INDEX_PART })));

list.push(def('index-68', 'craft', 'The Whole Index',
  `Seal all ${INDEX_TAGS} entries in the Fault Index — the ${INDEX_TAGS} mistakes you no longer make.`,
  ctx => sealedTags(ctx) >= INDEX_TAGS,
  ctx => ({ have: sealedTags(ctx), need: INDEX_TAGS })));

list.push(def('chain-8', 'runs', 'Chain of Eight',
  `Reach a chain of ${CHAIN_DEEP} inside one job. That is where the chain multiplier caps, at ×${CHAIN_MULT_CAP}.`,
  ctx => bestChain(ctx) >= CHAIN_DEEP,
  ctx => ({ have: Math.min(CHAIN_DEEP, bestChain(ctx)), need: CHAIN_DEEP })));

list.push(def('calibrated', 'runs', 'Calibrated',
  `Hold a rolling Brier score of ${CALIBRATED_BRIER_MAX.toFixed(2)} or better over ${CALIBRATED_WINDOW} informative calls — your calls match how often you are actually right.`,
  ctx => { const b = rollingBrier(ctx); return b != null && b <= CALIBRATED_BRIER_MAX; }));

list.push(def('clean-getaway', 'runs', 'Clean Getaway',
  'Finish the Night Before run on the eve of the test, the one night no board posts.',
  ctx => recordsOf(ctx).cleanGetaway === true));

/* ---- habit ---- */
list.push(def('streak-3', 'habit', 'Three Days',
  'Meet the daily goal three days running.',
  ctx => ctx.streakBest >= 3,
  ctx => ({ have: Math.min(3, ctx.streakBest), need: 3 })));
list.push(def('streak-7', 'habit', 'Seven Days',
  'Meet the daily goal seven days running.',
  ctx => ctx.streakBest >= 7,
  ctx => ({ have: Math.min(7, ctx.streakBest), need: 7 })));

/* ------------------------------------------------------------------ exports */

export const trophies = Object.freeze(list);
export const TROPHY_IDS = Object.freeze(trophies.map(t => t.id));
export const trophyById = Object.freeze(Object.fromEntries(trophies.map(t => [t.id, t])));

/** Every trophy of a group, in catalogue order. */
export function trophiesOfGroup(groupId) {
  return trophies.filter(t => t.group === groupId);
}

export default trophies;
