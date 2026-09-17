// blueprint.js — the Mock exam blueprint (COMPOSED S7 "Mock", S8 #13; BUILD-POLICY §2).
//
// The Mock is 20 items / 40 minutes in the doc's own section order; the Baseline (S7 "after placement
// Home offers Baseline") is the same machine at 10 items / 20 minutes, scored × 0.8 into Readiness's
// `A` term. This file is DATA + PURE SELECTION: it says which sources a slot may draw from and picks
// one per slot with a seeded RNG. No DOM, no generator import — `itemFor()` takes `generate` as an
// argument so `data/blueprint.js` never drags the whole `js/gen/*` graph onto the boot path.
//
//   import { buildPlan, itemFor, LIMITS } from '../../data/blueprint.js';
//   const plan = buildPlan(save, { kind: 'mock', index: 1 });      // → { kind, seed, items:[…] }
//   const { raw, parts } = itemFor(plan.items[0], generate);       // card object or generated item
//
// Slot sampling is S7's "coverage-first" rule, in this order:
//   1. an UNSEEN original of that slot's skill        (never cleared, no history)
//   2. an UNBEATEN original                            (attempted / cleared below Gold, or missed first try)
//   3. a generated Variant of one of the slot's templates
// with "an original appears at most once per 3 Mocks" (the ids of the two previous Mock-like runs are
// excluded) and "Mock #1 prefers originals" (index 1 never falls through to a Variant while any
// original is left). Section C is additionally "weighted to unseen/wrong" (S7).
//
// The five sections and their per-letter card pools are exactly `source-manifest.js`'s `mock` letters —
// `tests/mock.test.mjs` asserts the equality in both directions, so this file and the manifest can
// never drift apart silently.

import { cards, byId } from './cards.js';
import { isBonus, manifestIds } from './source-manifest.js';
import { rngFrom } from '../js/rng.js';

/* ------------------------------------------------------------------ shape */

export const SECTIONS = Object.freeze([
  Object.freeze({ id: 'A', name: 'Vocab / Notation', count: 4 }),
  Object.freeze({ id: 'B', name: 'Figures', count: 2 }),
  Object.freeze({ id: 'C', name: 'Always / Sometimes / Never', count: 4 }),
  Object.freeze({ id: 'D', name: 'Angle algebra', count: 6 }),
  Object.freeze({ id: 'E', name: 'Algebra review', count: 4 }),
]);

export const SECTION_NAME = Object.freeze(Object.fromEntries(SECTIONS.map(s => [s.id, s.name])));

/** S7: 20 items / 40 min · S8 #13: the Baseline is 10 items / 20 min, scored × 0.8 into Readiness. */
export const LIMITS = Object.freeze({
  mock: Object.freeze({ kind: 'mock', items: 20, limitMs: 40 * 60 * 1000, label: 'Mock', mini: false, factor: 1 }),
  baseline: Object.freeze({ kind: 'baseline', items: 10, limitMs: 20 * 60 * 1000, label: 'Baseline', mini: true, factor: 0.8 }),
});

export const POINTS_PER_ITEM = 5;          // S7 "score /100 (5 per item, partial credit by parts)"
export const EQUATION_SHARE = 0.4;         // S3 / S7: section D's CS-* setup is 40 % of the item
export const REUSE_GAP = 3;                // "an original appears at most once per 3 Mocks"
export const LATE_HOUR = 21.5;             // S7: after 21:30 a full Mock asks "start anyway?"

/* ------------------------------------------------------------------ pools */

const ids = (...list) => Object.freeze(list.flat());
const has = (id) => !!byId[id];
const withSkill = (...want) => cards.filter(c => !isBonus(c.id) && (c.skills || []).some(s => want.includes(s))).map(c => c.id);
const partTypes = (id) => (byId[id]?.parts || []).map(p => p.type);

/** The three Kuta factorings whose GCF comes out first (S7 slot E2 "FAC1/GCF"). */
export const GCF_FAC = ids('fac-08', 'fac-09', 'fac-18');
/** Notation cards that ask you to READ a symbol (mc) vs WRITE one (the notation builder). */
export const NOTE_READ = Object.freeze(cards.filter(c => /^not-/.test(c.id) && partTypes(c.id).includes('mc')).map(c => c.id));
export const NOTE_WRITE = Object.freeze(cards.filter(c => /^not-/.test(c.id) && partTypes(c.id).includes('notation')).map(c => c.id));
/** Every card that can be posed as a verdict item (S7 section C: asn-*, qz-* **and fact-***). */
export const VERDICT = Object.freeze(cards.filter(c => !isBonus(c.id) && (c.parts || []).some(p => p.type === 'asn')).map(c => c.id));
/** Definition recall: the 23 §0 terms (mc / type-the-term) and the 14 "complete the definition" cloze cards. */
export const DEFINITION = Object.freeze(cards.filter(c => /^(voc|def)-/.test(c.id)).map(c => c.id));

/** The part ids a slot poses for a given card (a `pick:'one'` card is pinned here, never left to chance). */
function partsForSlot(slotId, cardId, rng) {
  const card = byId[cardId];
  if (!card) return null;
  if (slotId.startsWith('C')) return (card.parts || []).filter(p => p.type === 'asn').map(p => p.id);
  if (/^voc-/.test(cardId)) return [rng && rng.chance(0.5) ? 'term' : 'mc'];        // recognition or recall
  if (card.pick === 'one') return [card.parts[0].id];
  return (card.parts || []).map(p => p.id);
}

/**
 * A slot: one question on the paper.
 *   id/section/label   what the rail and the report print
 *   cards              the originals it may draw (ids, in packet order)
 *   templates          the generators it falls back to, each with the params it may force
 *   weight             'coverage' (default) or 'wrong' (section C: weighted to unseen/wrong)
 */
const slot = (id, label, cardIds, templates, opts = {}) => Object.freeze({
  id, section: id.charAt(0), label,
  cards: Object.freeze(cardIds.filter(has)),
  templates: Object.freeze(templates.map(t => Object.freeze(typeof t === 'string' ? { template: t, modes: null } : t))),
  weight: opts.weight || 'coverage',
  note: opts.note || '',
});

const T_NOTATION = { template: 'T-notation', modes: null };
const T_SYS = { template: 'T-sys', modes: ['sub', 'elim', 'general'] };

/** The 20-item paper, in the doc's order (S7 "sections in the doc's order"). */
export const MOCK_SLOTS = Object.freeze([
  slot('A1', 'Definition', DEFINITION, ['T-vocab']),
  slot('A2', 'Definition', DEFINITION, ['T-vocab']),
  slot('A3', 'Read the notation', NOTE_READ, [T_NOTATION]),
  slot('A4', 'Write the notation', NOTE_WRITE, [T_NOTATION]),

  slot('B1', 'Pairs in the figure', ids('ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5'), ['T-fig-pairs']),
  slot('B2', 'Classify / name', ids('cls-01', 'cls-02', 'cls-03', 'cls-04', 'not-06'), ['T-classify']),

  slot('C1', 'Always / Sometimes / Never', VERDICT, [], { weight: 'wrong' }),
  slot('C2', 'Always / Sometimes / Never', VERDICT, [], { weight: 'wrong' }),
  slot('C3', 'Always / Sometimes / Never', VERDICT, [], { weight: 'wrong' }),
  slot('C4', 'Always / Sometimes / Never', VERDICT, [], { weight: 'wrong' }),

  slot('D1', 'Complement / supplement — linear', withSkill('CS-LIN'), ['T-cs-lin']),
  slot('D2', 'Complement / supplement — linear', withSkill('CS-LIN'), ['T-cs-lin']),
  slot('D3', 'Ratio', withSkill('CS-RATIO'), ['T-cs-ratio']),
  slot('D4', 'Product / midpoint (two cases)', withSkill('CS-QUAD', 'SEG-ALG'), ['T-cs-quad', 'T-seg-mid']),
  slot('D5', 'Diagram algebra', withSkill('FIG-ALG'), ['T-fig-xlines-L', 'T-fig-xlines-Q', 'T-fig-system']),
  slot('D6', 'Does it bisect?', withSkill('BISECT-L', 'BISECT-Q'), ['T-fig-bisect-L', 'T-fig-bisect-Q']),

  slot('E1', 'Factoring a > 1', cards.filter(c => /^fac-/.test(c.id) && !GCF_FAC.includes(c.id)).map(c => c.id), ['T-factor-a2', 'T-factor-neg']),
  slot('E2', 'Factoring — GCF first', GCF_FAC, ['T-factor-a1', 'T-factor-gcf']),
  slot('E3', 'Solve by factoring', ids('quad-01', 'quad-02', 'quad-03'), ['T-quad-solve', 'T-quad-ctx']),
  slot('E4', 'System of equations', [], [T_SYS]),
]);

/** The 10-item Baseline: the same sections, halved, so day 1 still touches all five (S7). */
export const BASELINE_SLOTS = Object.freeze([
  slot('A1', 'Definition', DEFINITION, ['T-vocab']),
  slot('A4', 'Write the notation', NOTE_WRITE, [T_NOTATION]),
  slot('B1', 'Figure', ids('ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5', 'cls-01', 'cls-02', 'cls-03', 'cls-04', 'not-06'), ['T-fig-pairs', 'T-classify']),
  slot('C1', 'Always / Sometimes / Never', VERDICT, [], { weight: 'wrong' }),
  slot('C2', 'Always / Sometimes / Never', VERDICT, [], { weight: 'wrong' }),
  slot('D1', 'Complement / supplement — linear', withSkill('CS-LIN'), ['T-cs-lin']),
  slot('D3', 'Ratio', withSkill('CS-RATIO'), ['T-cs-ratio']),
  slot('D5', 'Diagram algebra / bisector', withSkill('FIG-ALG', 'BISECT-L', 'BISECT-Q'), ['T-fig-xlines-L', 'T-fig-bisect-L']),
  slot('E1', 'Factoring a > 1', cards.filter(c => /^fac-/.test(c.id) && !GCF_FAC.includes(c.id)).map(c => c.id), ['T-factor-a2']),
  slot('E3', 'Solve by factoring', ids('quad-01', 'quad-02', 'quad-03'), ['T-quad-solve']),
]);

export const blueprint = Object.freeze({ mock: MOCK_SLOTS, baseline: BASELINE_SLOTS });

/* ------------------------------------------------------------------ queries */

export function kindOf(kind) {
  return LIMITS[String(kind || 'mock').split(':')[0]] || LIMITS.mock;
}

/** The slot list for a run kind ('mock' | 'baseline'). */
export function slotsFor(kind = 'mock') {
  return kindOf(kind).kind === 'baseline' ? BASELINE_SLOTS : MOCK_SLOTS;
}

/** Sections present in a run kind, with the number of items each contributes. */
export function sectionsFor(kind = 'mock') {
  const out = [];
  for (const s of slotsFor(kind)) {
    const row = out.find(r => r.id === s.section);
    if (row) row.count++;
    else out.push({ id: s.section, name: SECTION_NAME[s.section], count: 1 });
  }
  return out;
}

/**
 * Every distinct source a slot can draw from: its originals plus one entry per template (per mode when
 * the template has them). S8 #13's acceptance check is "≥ 3 candidate sources per slot".
 */
export function sourcesOf(slot) {
  const out = slot.cards.map(id => ({ kind: 'card', id }));
  for (const t of slot.templates) {
    if (t.modes && t.modes.length) for (const mode of t.modes) out.push({ kind: 'template', template: t.template, mode });
    else out.push({ kind: 'template', template: t.template, mode: null });
  }
  return out;
}

/** The card ids a Mock section may draw (the union of its slots' pools). */
export function candidates(letter) {
  const set = new Set();
  for (const s of MOCK_SLOTS) if (s.section === String(letter).toUpperCase()) for (const id of s.cards) set.add(id);
  return [...set];
}

/** Is this original eligible for that Mock section? (`coverage.test.mjs` calls this adapter.) */
export function eligible(id, letter) {
  const cardId = typeof id === 'string' ? id : id && id.id;
  if (!cardId || isBonus(cardId)) return false;
  const L = String(letter || '').toUpperCase();
  return MOCK_SLOTS.some(s => s.section === L && s.cards.includes(cardId));
}

/** The section letters an original can appear in (`[]` for a bonus card or an unknown id). */
export function sectionsOf(id) {
  return SECTIONS.map(s => s.id).filter(L => eligible(id, L));
}

/** Every non-bonus id this blueprint can serve (used by the coverage + mock tests). */
export function coveredIds() {
  const set = new Set();
  for (const s of MOCK_SLOTS) for (const id of s.cards) set.add(id);
  return [...set];
}

/* ------------------------------------------------------------------ selection */

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/** S7's Mock seeds: `mock#1`, `mock#2`, … (the Baseline is `baseline#1`). */
export function seedFor(kind, index) {
  return `${kindOf(kind).kind}#${Math.max(1, Math.floor(index || 1))}`;
}

/** Ordinal of the next run of this kind (1-based), counting every started run (open or done). */
export function nextIndex(save, kind = 'mock') {
  const k = kindOf(kind).kind;
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  return runs.filter(r => isObj(r) && String(r.kind || '').split(':')[0] === k).length + 1;
}

/** The originals used by the previous `REUSE_GAP − 1` Mock-like runs — kept out of this paper (S7). */
export function recentOriginals(save, { gap = REUSE_GAP } = {}) {
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  const mocks = runs.filter(r => isObj(r) && ['mock', 'baseline'].includes(String(r.kind || '').split(':')[0]));
  const out = new Set();
  for (const r of mocks.slice(-Math.max(0, gap - 1))) {
    for (const it of Array.isArray(r.items) ? r.items : []) if (it && it.cardId) out.add(it.cardId);
  }
  return out;
}

/** 0 = never seen · 1 = seen but not beaten · 2 = beaten (cleared Gold+ first try). */
export function coverageRank(save, id) {
  const rec = save?.cards?.[id];
  if (!isObj(rec)) return 0;
  const played = rec.attempts > 0 || (Array.isArray(rec.history) && rec.history.length > 0) || rec.cleared === true;
  if (!played) return 0;
  const beaten = rec.cleared === true && (rec.rarity === 'gold' || rec.rarity === 'platinum') && rec.lastFirstTry !== false;
  return beaten ? 2 : 1;
}

/** Has this original been missed before (an uncleared error entry, a reveal, or a non-first-try clear)? */
export function wasMissed(save, id) {
  const rec = save?.cards?.[id];
  if (isObj(rec) && (rec.lastFirstTry === false || rec.solutionShown === true || (rec.attempts > 0 && rec.cleared !== true))) return true;
  const errors = Array.isArray(save?.errors) ? save.errors : [];
  return errors.some(e => isObj(e) && (e.item === id || e.forCard === id) && e.cleared !== true);
}

/** Sampling weight inside the chosen rank band. Section C leans on unseen and previously-wrong items. */
function weightFor(save, id, mode) {
  if (mode !== 'wrong') return 1;
  let w = 1;
  if (coverageRank(save, id) === 0) w += 2;
  if (wasMissed(save, id)) w += 3;
  return w;
}

/**
 * buildPlan(save, opts) → { kind, index, seed, limitMs, items:[plan] }
 * Pure and deterministic for a given (save, kind, seed): the same seed on the same save yields the same
 * paper. A "RETRY SAME SEED" never recomputes this — it replays the stored items (the save has moved on).
 */
export function buildPlan(save, { kind = 'mock', index = null, seed = null, gap = REUSE_GAP } = {}) {
  const spec = kindOf(kind);
  const n = index == null ? nextIndex(save, spec.kind) : Math.max(1, Math.floor(index));
  const runSeed = seed || seedFor(spec.kind, n);
  const rng = rngFrom('blueprint', spec.kind, runSeed);
  const slots = slotsFor(spec.kind);
  const recent = recentOriginals(save, { gap });
  const used = new Set();
  const items = [];

  for (const s of slots) {
    const unused = s.cards.filter(id => !used.has(id));
    const free = unused.filter(id => !recent.has(id));
    // The reuse gap holds while the slot has a generator to fall back on; a slot with neither (section C
    // never generates) yields the gap rather than leaving a question off the paper.
    const pool = free.length ? free : (s.templates.length ? [] : unused);
    const unseen = pool.filter(id => coverageRank(save, id) === 0);
    const unbeaten = pool.filter(id => coverageRank(save, id) === 1);
    const band = unseen.length ? unseen : unbeaten.length ? unbeaten : (n === 1 ? pool : []);
    let plan = null;
    if (band.length) {
      const id = rng.weighted(band, band.map(x => weightFor(save, x, s.weight)));
      used.add(id);
      plan = planForCard(s, id, rng);
    } else if (s.templates.length) {
      plan = planForTemplate(s, rng, runSeed);
    } else if (pool.length) {
      const id = rng.weighted(pool, pool.map(x => weightFor(save, x, s.weight)));
      used.add(id);
      plan = planForCard(s, id, rng);
    }
    if (!plan) continue;                                         // a slot with neither cards nor templates
    plan.n = items.length + 1;
    items.push(Object.freeze(plan));
  }

  return { kind: spec.kind, index: n, seed: runSeed, limitMs: spec.limitMs, items: Object.freeze(items) };
}

function planForCard(slot, id, rng) {
  const card = byId[id];
  return {
    n: 0, slotId: slot.id, section: slot.section, sectionName: SECTION_NAME[slot.section], label: slot.label,
    source: 'card', id, cardId: id, template: null, seed: null, params: null,
    partIds: partsForSlot(slot.id, id, rng),
    skill: (card.skills || [])[0] || null, skills: (card.skills || []).slice(), tier: card.tier ?? 2,
  };
}

function planForTemplate(slot, rng, runSeed) {
  const t = rng.pick(slot.templates);
  const mode = t.modes && t.modes.length ? rng.pick(t.modes) : null;
  const seed = `${runSeed}|${slot.id}`;
  return {
    n: 0, slotId: slot.id, section: slot.section, sectionName: SECTION_NAME[slot.section], label: slot.label,
    source: 'variant', id: null, cardId: null, template: t.template, seed, params: mode ? { mode } : null,
    partIds: null, skill: null, skills: [], tier: null,
  };
}

/**
 * itemFor(plan, generate) → { raw, parts }
 * `raw` is the card object (with only the slot's parts, and `pick` resolved) or the generated item;
 * `parts` is the list the Mock mounts and grades. `generate` is `data/templates.js`'s — passed in so
 * this module stays off the generator graph.
 */
export function itemFor(plan, generate) {
  if (!plan) return null;
  if (plan.source === 'card') {
    const card = byId[plan.cardId];
    if (!card) return null;
    const keep = Array.isArray(plan.partIds) && plan.partIds.length
      ? card.parts.filter(p => plan.partIds.includes(p.id))
      : card.parts.slice();
    const parts = keep.length ? keep : card.parts.slice();
    return { raw: { ...card, parts, pick: null }, parts };
  }
  if (typeof generate !== 'function') throw new TypeError('itemFor: a generated slot needs data/templates.js generate()');
  const item = generate(plan.template, plan.seed, plan.params || {});
  return { raw: item, parts: (item.parts || []).slice() };
}

/** Points a fully correct item is worth (S7: 5 each, so a 20-item Mock is /100). */
export function pointsFor() { return POINTS_PER_ITEM; }

/** Score a finished paper: 5 points per item, partial credit by parts. */
export function scoreOf(items, { count = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  const total = (count ?? list.length) * POINTS_PER_ITEM;
  const got = list.reduce((sum, it) => sum + Math.max(0, Math.min(1, Number(it?.credit) || 0)) * POINTS_PER_ITEM, 0);
  const accuracy = total > 0 ? got / total : 0;
  return { points: Math.round(got * 100) / 100, pointsMax: total, accuracy, score: Math.round(accuracy * 100), scoreMax: 100 };
}

/** Every non-bonus manifest id (what the coverage assertions compare against). */
export const BANK_IDS = Object.freeze(manifestIds({ bonus: false }));

export default blueprint;
