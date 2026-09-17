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
list.push(counterDef('forge-flash', 'craft', 'Forge Flash',
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
list.push(setDef('forge-18', 'craft', 'Forge 18',
  'Clear all 18 Kuta factorings.', FAC_18, 'clear'));

/* ---- runs & tests ---- */
list.push(def('oracle', 'runs', 'The Oracle',
  'Score 36 out of 36 in one "Full 36" sitting.',
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'full36' && r.status === 'done'
    && ctx.correctCount(r) >= 36)));

list.push(def('flawless-page', 'runs', 'Flawless Page',
  'Finish a whole Page with every item clean — first try, no hints.',
  ctx => ctx.someRun(r => ctx.kindOf(r) === 'page' && r.status === 'done'
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
