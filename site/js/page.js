// page.js — Today's Page composer (COMPOSED S1 "Session", S7 plan hooks, S4 spaced review).
//
// Pure and DOM-free: `composePage(save, opts)` returns the initial queue for a page; `startPage` writes it to
// `save.inProgress` (S6) so a reload mid-page restores the queue at `inProgress.idx`. The seed is
// cyrb53(profileId|dayIndex|pageIndex): the INITIAL composition is reproducible; dues and errors change as
// you answer, so the seed alone can never rebuild a half-answered page — the queue in the save can.
//
// Order (S1):
//   (1) the first two due reviews (a warm opener — never a tier-4 item);
//   (2) Rematches from the error log ≤ 3 (fresh-seed Variants of the missed template), counting toward the
//       tier-4 cap, overflow carried to the next Page;
//   (3) the remaining due reviews ≤ 12 sorted by overdue days desc (frozen Variants return byte-identical);
//   (4) q new Cards in prereq-TOPOLOGICAL order (never packet order), ≤ 3 modules of main work
//       (micro-cards — tier 1 recall — interleave 1-in-4 and come from those modules first), `needs`
//       respected, and the very first Page of a save carries ≥ 3 non-M1 items;
//   (5) 2–3 weak-skill Variants ordered by w × (1 − m/100), then the S7 floor of 2 M11/M12 Variants;
//   (6) a Boss prompt when a module's originals are all cleared (B3: M10 cleared ∧ every M11/M12 family tile
//       ≥ Bronze) — carried in `meta.boss`, never as a queue item.
// Interleave constraints: never 3 consecutive items of one skill; geometry and algebra alternate in the new
// block when both are present; tier ramps 1→4 (hard items never first; a Rematch is never item 1); at most
// 2 tier-4 items per page INCLUDING Rematches.
//
// Queue item (what run.js renders — everything needed to (re)generate it):
//   { n, id, kind:'card'|'variant', role:'review'|'rematch'|'new'|'weak'|'floor', skill, skills, tier, module,
//     sheet, isReview, isRematch, isVariant, template?, seed?, params?, forCard?, frozenKey?, templateVersion?,
//     rename?, done:false, result:null }

import { cyrb53, mulberry32, rngFrom } from './rng.js';
import { todayISO, dayIndex as dayIndexOf, daysUntilTest } from './days.js';
import { cards as ALL_CARDS, byId as cardById } from '../data/cards.js';
import { topoOrder } from '../data/skills.js';
import { moduleById, families, bosses } from '../data/modules.js';
import { getFigure } from '../data/figures.js';
import { getTemplate, templatesFor, templatesForSkill, tagFor } from '../data/templates.js';
import { isBonus } from '../data/source-manifest.js';
import { familyRarity } from './rarity.js';
import { dueList, needsMet, pendingRematches, testAtOf, MIN_MS, overdueDays as overdueDaysOf, isMastered } from './schedule.js';
import { isCleared, weakSpots, latestMock } from './readiness.js';
// J5 (COMPOSED-GAME G7 "Extended"): the three ADDITIVE job functions at the foot of this file. Nothing
// above this line reads them and `composePage` does not call them, so the study layer is unchanged.
import { BOARD, SHAPES, WING_OF_SKILL } from '../data/job.js';
import { postedFor, shapeTable, decisionCount, round as jobRound } from './job/econ.js';
import { wingSupply } from './gen/asn-reason.js';

export const LIMITS = Object.freeze({
  opener: 2, rematches: 3, dues: 12, q: 12, qMax: 40, qMin: 4, weakMin: 2, weakMax: 3, tier4: 2,
  modules: 3, microEvery: 4, firstPageNonM1: 3, algebraFloor: 2, sameSkillRun: 2,
  // W5 (notes/OPEN-ISSUES.md §A3): on a LOWERED day the plan strip promises that vocabulary and notation
  // carry the day. `opts.microFlashOnly` (from plan.composeOpts) makes every second new slot a tier-1
  // recall card instead of every fourth — the promise the strip prints, in the composer that keeps it.
  microEveryLowered: 2,
  // Session budget (S1: 10–25 min): reviews + rematches + new cards are held to `pageMax`; new cards shrink
  // to make room (never below qMin — progress continues; the rest lands on the day's second Page).
  pageMax: 20,
  // home r1 (OPEN-ISSUES B1): the item cap alone let a 17-review day compose ~34 min (weak Variants, the
  // algebra floor and the tier ramp ride on top of pageMax). The page is also held to a MINUTE budget:
  // once the estimate passes `minutesMax`, new cards shrink to qMin and no weak/floor Variants are added;
  // the rest carries to the day's next Page (the split-page path). Estimate per tier, in minutes.
  minutesMax: 25,
  minutesPerTier: Object.freeze({ 1: 0.5, 2: 1.5, 3: 3, 4: 5 }),
  // … and the review block itself stops filling `minutesReserve` (= qMin new cards) short of the budget, so
  // a 17-review day still ends with a few new cards; the dues it leaves stay due for the day's next Page.
  minutesReserve: 6,
});
/** Estimated minutes of a queue (the same numbers Home prints under RUN NEXT). */
export function estimateMinutes(queue) {
  return (queue ?? []).reduce((t, it) => t + (LIMITS.minutesPerTier[it?.tier] ?? 1.5), 0);
}
export const ALGEBRA_MODULES = Object.freeze(new Set(['M10', 'M11', 'M12']));
export const MICRO_TIER = 1;
/** S7 tier-weighted uncleared work: a 10-second ASN card is not a 5-minute diagram. */
export const TIER_WEIGHT = Object.freeze({ 1: 1 / 6, 2: 1 / 2, 3: 1, 4: 1 });
export const FAMILY_WEIGHT = 3;
export const ROLES = Object.freeze(['review', 'rematch', 'new', 'weak', 'floor']);
const LETTER_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');   // no I, no O (S2)

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const primarySkill = c => (Array.isArray(c?.skills) && c.skills[0]) || null;
const isAlgebra = moduleId => ALGEBRA_MODULES.has(moduleId);
const runKind = r => String(r?.kind ?? '').split(':')[0];

/* ---------------- seeds ---------------- */
/** cyrb53(profileId|dayIndex|pageIndex) >>> 0 — the S1 page seed. */
export function pageSeed(profileId, dayIndex, pageIndex) {
  return cyrb53(`${profileId}|${dayIndex}|${pageIndex}`) >>> 0;
}
export const seedHex = seed => (seed >>> 0).toString(16).padStart(8, '0').slice(-6);

/** How many Pages were started today (run records of kind `page` from today) → the next pageIndex. */
export function pageIndexFor(save, today = todayISO()) {
  let n = 0;
  for (const r of save?.runs ?? []) if (runKind(r) === 'page' && r.startedAt != null && todayISO(new Date(r.startedAt)) === today) n++;
  return n;
}

/** The very first Page of a save: no page run recorded yet. */
export function isFirstPage(save) {
  return !(save?.runs ?? []).some(r => runKind(r) === 'page') && !(save?.counters?.pages > 0);
}

/* ---------------- card facts ---------------- */
const cardIsPlaced = (save, c) => !!(save?.cards?.[c.id]?.placed || save?.jumps?.[c.module]);
const cardIsPlannable = c => !!c && !isBonus(c.id) && moduleById[c.module]?.plan !== false && Array.isArray(c.skills) && c.skills.length > 0;
const tierOf = x => (Number.isInteger(x?.tier) && x.tier >= 1 && x.tier <= 4 ? x.tier : 2);

/** The S7 tier-weighted uncleared work R and the day's new-card target q. */
export function qFor(save, { D = daysUntilTest(save?.settings?.testDate) } = {}) {
  let R = 0;
  for (const c of ALL_CARDS) {
    if (!cardIsPlannable(c) || isCleared(save?.cards?.[c.id]) || cardIsPlaced(save, c)) continue;
    R += TIER_WEIGHT[tierOf(c)];
  }
  for (const f of families) if (familyRarity(save?.variants?.[f.id]) == null) R += FAMILY_WEIGHT;
  const q = D == null ? LIMITS.q : Math.min(LIMITS.qMax, Math.ceil(R / Math.max(D - 1, 1)));
  const warn = q > LIMITS.q;
  return { q, R, warn, target: warn ? LIMITS.q : q, D };
}

/**
 * New-card candidates in prereq-topological order (ties: table order of skills, then sheet order):
 * uncleared, unplaced, non-bonus, plannable, with every `needs` skill at m ≥ 40 or placed.
 */
export function newCardPool(save) {
  const rank = new Map(topoOrder().map((id, i) => [id, i]));
  const out = [];
  ALL_CARDS.forEach((c, i) => {
    if (!cardIsPlannable(c) || isCleared(save?.cards?.[c.id]) || cardIsPlaced(save, c) || !needsMet(c.needs, save)) return;
    out.push({ card: c, order: i, rank: rank.get(primarySkill(c)) ?? 99 });
  });
  out.sort((a, b) => (a.rank - b.rank) || (a.order - b.order));
  return out.map(x => x.card);
}

/* ---------------- items ---------------- */
function cardItem(c, role, extra = {}) {
  return {
    n: 0, id: c.id, kind: 'card', role, skill: primarySkill(c), skills: (c.skills ?? []).slice(), tier: tierOf(c),
    module: c.module, sheet: c.sheet ?? null, isReview: role === 'review', isRematch: false, isVariant: false,
    done: false, result: null, ...extra,
  };
}
function variantItem(template, seed, role, { forCard = null, params = null, frozenKey = null, templateVersion = null, id = null } = {}) {
  const e = getTemplate(template);
  if (!e) return null;
  const item = {
    n: 0, id: id ?? `${template}#${tagFor(template, seed)}`, kind: 'variant', role, template, seed: String(seed),
    skill: e.skills?.[0] ?? null, skills: (e.skills ?? []).slice(), tier: tierOf(e), module: e.module ?? null, sheet: e.sheet ?? null,
    isReview: role === 'review', isRematch: role === 'rematch', isVariant: true, forCard: forCard ?? null,
    done: false, result: null,
  };
  if (params && Object.keys(params).length) item.params = { ...params };
  if (frozenKey) item.frozenKey = frozenKey;
  if (templateVersion != null) item.templateVersion = templateVersion;
  return item;
}

/**
 * Figure-card reviews re-render with letters re-shuffled (S4) so the answer cannot be typed from memory.
 * Applied to `pairs` cards (the answer IS the letters): a fresh injective map spec-letter → new letter over
 * the figure's vertex + points, drawn from the no-I/no-O pool. Screens pass `{ ...card.figure, rename }` to
 * `figure/model.js resolve()`. Returns null for cards without a figure or without a pairs part.
 */
export function renameFor(card, rng) {
  if (!card?.figure?.id || !Array.isArray(card.parts) || !card.parts.some(p => p?.type === 'pairs')) return null;
  const fig = getFigure(card.figure.id);
  if (!fig) return null;
  const letters = fig.kind === 'fan' ? [fig.vertex, ...(fig.rays ?? []).map(r => r.n)] : Object.keys(fig.points ?? {});
  if (!letters.length) return null;
  const fresh = rng.sample(LETTER_POOL, letters.length);
  const map = {};
  letters.forEach((l, i) => { map[l] = fresh[i]; });
  if (letters.every(l => map[l] === l)) { const [a, b] = letters; if (b) { map[a] = fresh[1]; map[b] = fresh[0]; } }
  return map;
}

/* ---------------- Boss prompt (S1 step 6) ---------------- */
/**
 * Bosses whose modules are complete and whose stamp is not yet earned: every module's originals cleared
 * and every family tile ≥ Bronze (B3: M10 ∧ M11/M12 tiles). → [{ id, name, elite }]
 */
export function bossReady(save) {
  const out = [];
  for (const b of bosses) {
    if (save?.trophies?.[`boss:${b.id}`]) continue;
    const mods = b.modules.map(mid => moduleById[mid]);
    if (mods.some(m => !m)) continue;
    // A module with neither originals nor family tiles is GENERATOR-ONLY (M3 "Comp/Supp Sprint" is the
    // one: all of its work is Variants, so there is nothing to clear). It is vacuously satisfied.
    // W4 integration: requiring content per module made B1 (M1 + M3) unreachable forever — a whole boss
    // a real student could never meet, since M3 can never be "cleared". The gate is now: every module
    // that HAS content is fully cleared, and at least one module of the boss has content.
    const ok = mods.every(m => {
      if (m.originals.length && !m.originals.every(id => isCleared(save?.cards?.[id]))) return false;
      if (m.families.length && !m.families.every(f => familyRarity(save?.variants?.[f]) != null)) return false;
      return true;
    }) && mods.some(m => m.originals.length > 0 || m.families.length > 0);
    if (ok) out.push({ id: b.id, name: b.name, elite: b.elite });
  }
  return out;
}

/* ---------------- the composer ---------------- */
function templateForCardId(id) {
  const c = cardById[id];
  if (!c) return null;
  const list = templatesFor(id);
  return list.length ? list[0].id : null;
}

/** Pick a template for a weak skill: primary-skill templates first, needs met, a coin per page for variety. */
function templateForSkill(skill, save, rng, { avoidTier4 = false } = {}) {
  let list = templatesForSkill(skill).map(getTemplate).filter(Boolean).filter(e => needsMet(e.needs, save));
  if (avoidTier4) list = list.filter(e => tierOf(e) < 4);
  if (!list.length) return null;
  const primary = list.filter(e => e.skills?.[0] === skill);
  return rng.pick(primary.length ? primary : list)?.id ?? null;
}

/** Spread one skill: no run of more than LIMITS.sameSkillRun (2) consecutive items with the same primary skill. */
export function spreadSkills(queue, { sameSkillRun = LIMITS.sameSkillRun } = {}) {
  const q = queue.slice();
  const dropped = [];
  const sk = i => q[i]?.skill ?? null;
  const runBefore = (i) => { let r = 0; for (let k = i - 1; k >= 0 && sk(k) === sk(i); k--) r++; return r; };
  for (let i = sameSkillRun; i < q.length; i++) {
    if (runBefore(i) < sameSkillRun) continue;
    // find the nearest later item with a different skill whose arrival also breaks nothing behind it
    let j = -1;
    for (let k = i + 1; k < q.length; k++) {
      if (sk(k) === sk(i)) continue;
      let r = 0; for (let t = i - 1; t >= 0 && sk(t) === sk(k); t--) r++;
      if (r < sameSkillRun) { j = k; break; }
    }
    if (j < 0) { dropped.push(...q.splice(i, 1)); i--; continue; }
    const [moved] = q.splice(j, 1);
    q.splice(i, 0, moved);
  }
  return { queue: q, dropped };
}

/**
 * composePage(save, opts) → { seed, seedTag, queue, meta }
 * opts: { now, today, profileId, dayIndex, pageIndex, q, D, first }
 */
export function composePage(save, opts = {}) {
  const now = opts.now ?? Date.now();
  const today = opts.today ?? todayISO(new Date(now));
  const D = opts.D !== undefined ? opts.D : daysUntilTest(save?.settings?.testDate, today);
  const profileId = opts.profileId ?? save?.profileId ?? 'anon';
  const dayIndex = opts.dayIndex ?? dayIndexOf(save?.createdAt ?? now, today);
  const pageIndex = opts.pageIndex ?? pageIndexFor(save, today);
  const first = opts.first ?? isFirstPage(save);
  const seed = pageSeed(profileId, dayIndex, pageIndex);
  const tag = seedHex(seed);
  const rng = mulberry32(seed);
  const qInfo = qFor(save, { D });
  const q = Number.isInteger(opts.q) ? Math.max(0, Math.min(LIMITS.qMax, opts.q)) : qInfo.target;
  // W4 integration (notes/T14.md Requests → T10): when the plan LOWERS the day's target it also promises
  // "tier-4 to one a day" in print on the plan strip. `plan.composeOpts(save)` puts that number in
  // `opts.tier4`; honouring it here is what makes the promise true. Absent → the S1 default (2).
  const tier4Max = Number.isInteger(opts.tier4) ? Math.max(0, opts.tier4) : LIMITS.tier4;

  const used = new Set();
  const queue = [];
  const carried = [];
  let tier4 = 0;
  const take = (item) => {
    if (!item || used.has(item.id)) return false;
    if (item.tier >= 4 && tier4 >= tier4Max) { carried.push(item); return false; }
    used.add(item.id);
    if (item.tier >= 4) tier4++;
    queue.push(item);
    return true;
  };
  const counts = { review: 0, rematch: 0, due: 0, new: 0, weak: 0, floor: 0 };

  // ---- dues → items
  const dues = dueList(save, { now, today, D }).map(d => {
    if (d.kind === 'card') {
      const c = cardById[d.id];
      if (!c) return null;
      const item = cardItem(c, 'review', { bucket: d.bucket, overdue: Math.round(d.overdue * 10) / 10, sweep: d.sweep });
      const rename = renameFor(c, rng.fork(`rename|${c.id}`));
      if (rename) item.rename = rename;
      return item;
    }
    return variantItem(d.template, d.seed, 'review', { forCard: d.forCard, params: d.params, frozenKey: d.key, templateVersion: d.templateVersion, id: d.key });
  }).filter(Boolean);

  // (1) opener: the first two dues that are not hard items
  let opener = 0;
  for (let i = 0; i < dues.length && opener < LIMITS.opener; i++) {
    if (dues[i].tier >= 4 || used.has(dues[i].id)) continue;
    if (take(dues[i])) { opener++; counts.review++; }
  }

  // (2) rematches ≤ 3, fresh-seed Variants of the missed template
  const rematches = pendingRematches(save, { templateFor: templateForCardId });
  rematches.sort((a, b) => tierOf(getTemplate(a.template)) - tierOf(getTemplate(b.template)));
  let k = 0;
  for (const r of rematches) {
    if (counts.rematch >= LIMITS.rematches) break;
    const item = variantItem(r.template, `${tag}-r${k++}`, 'rematch', { forCard: r.forCard });
    if (!item) continue;
    if (take(item)) counts.rematch++;
  }

  // (3) remaining dues ≤ 12, overdue desc (already sorted) — and within the minute budget (home r1)
  const minutesMax = Number.isFinite(opts.minutes) ? opts.minutes : LIMITS.minutesMax;
  for (const d of dues) {
    if (counts.due >= LIMITS.dues) break;
    if (estimateMinutes(queue) >= minutesMax - LIMITS.minutesReserve) break;
    if (used.has(d.id)) continue;
    if (take(d)) { counts.due++; counts.review++; }
  }

  // (4) q new Cards — shrunk when reviews are heavy (LIMITS.pageMax), never below qMin
  // home r1: the minute budget (LIMITS.minutesMax) — reviews are never dropped (S1: the block ends when every
  // review is right), so a heavy day is paid for by the optional parts: new shrinks to qMin, weak/floor skip.
  const overBudget = () => estimateMinutes(queue) > minutesMax;
  const fits = (item) => estimateMinutes(queue) + (LIMITS.minutesPerTier[item?.tier] ?? 1.5) <= minutesMax;
  const qEff = Number.isInteger(opts.q) ? q : Math.max(Math.min(q, LIMITS.qMin), Math.min(q, overBudget() ? LIMITS.qMin : LIMITS.pageMax - queue.length));
  const pool = newCardPool(save);
  const main = pool.filter(c => tierOf(c) > MICRO_TIER);
  const micro = pool.filter(c => tierOf(c) <= MICRO_TIER);
  // ≤ 3 modules of main work: up to 2 geometry + 1 algebra in topo order (3 of one family when the other is absent)
  const geoMods = [], algMods = [];
  for (const c of main) {
    const list = isAlgebra(c.module) ? algMods : geoMods;
    if (!list.includes(c.module)) list.push(c.module);
  }
  let chosen;
  if (algMods.length && geoMods.length) chosen = [...geoMods.slice(0, LIMITS.modules - 1), algMods[0]];
  else chosen = (algMods.length ? algMods : geoMods).slice(0, LIMITS.modules);
  const chosenSet = new Set(chosen);
  const byTier = (a, b) => tierOf(a) - tierOf(b);
  const geoMain = main.filter(c => chosenSet.has(c.module) && !isAlgebra(c.module)).sort(byTier);
  const algMain = main.filter(c => chosenSet.has(c.module) && isAlgebra(c.module)).sort(byTier);
  const mainSeq = [];
  for (let i = 0; geoMain.length || algMain.length; i++) {
    const fromGeo = i % 2 === 0 ? geoMain.length > 0 : algMain.length === 0;
    mainSeq.push(fromGeo ? geoMain.shift() : algMain.shift());
  }
  const microSeq = [...micro.filter(c => chosenSet.has(c.module)), ...micro.filter(c => !chosenSet.has(c.module))];
  // W5 (§A3): a lowered day leans on the tier-1 recall cards — every second new slot, not every fourth.
  const microEvery = opts.microFlashOnly === true ? LIMITS.microEveryLowered : LIMITS.microEvery;
  let slot = 0;
  while (counts.new < qEff && (mainSeq.length || microSeq.length)) {
    slot++;
    const wantMicro = slot % microEvery === 0;
    let c = wantMicro ? (microSeq.shift() ?? mainSeq.shift()) : (mainSeq.shift() ?? microSeq.shift());
    if (!c) break;
    if (counts.new >= LIMITS.qMin && !fits(c)) break;   // home r1: minute budget (qMin always lands)
    if (take(cardItem(c, 'new'))) counts.new++;
  }
  // first Page of a save: ≥ 3 non-M1 items
  if (first) {
    let nonM1 = queue.filter(it => it.module !== 'M1').length;
    for (const c of pool) {
      if (nonM1 >= LIMITS.firstPageNonM1) break;
      if (c.module === 'M1' || used.has(c.id) || tierOf(c) >= 4) continue;
      if (take(cardItem(c, 'new'))) { counts.new++; nonM1++; }
    }
  }

  // (5) 2–3 weak-skill Variants by w × (1 − m/100)
  const weak = weakSpots(save, { max: LIMITS.weakMax });
  const weakCount = weak.length === 0 ? 0 : weak.length === 1 ? LIMITS.weakMin : LIMITS.weakMax;
  for (let i = 0, w = 0; i < weakCount; i++) {
    if (overBudget()) break;                       // home r1: minute budget
    const s = weak[i % weak.length];
    const template = templateForSkill(s.id, save, rng.fork(`weak|${s.id}|${i}`), { avoidTier4: tier4 >= tier4Max });
    if (template) {
      const item = variantItem(template, `${tag}-w${w++}`, 'weak');
      if (item && !fits(item)) break;              // home r1: the Variant would push the page past the budget
      if (take(item)) counts.weak++;
      continue;
    }
    // a skill with no generator (ASN): its most needed original — uncleared first, then lowest bucket
    const cands = ALL_CARDS.filter(c => cardIsPlannable(c) && primarySkill(c) === s.id && !used.has(c.id))
      .sort((a, b) => (isCleared(save?.cards?.[a.id]) - isCleared(save?.cards?.[b.id])) || ((save?.cards?.[a.id]?.bucket ?? 0) - (save?.cards?.[b.id]?.bucket ?? 0)));
    if (cands.length && take(cardItem(cands[0], 'weak'))) counts.weak++;
  }

  // S7 floor: ≥ 2 M11/M12 Variants a day keep the doc's named algebra topic on the plan
  const quadOk = needsMet(['QUAD-SOLVE'], save);
  let alg = queue.filter(it => it.module === 'M11' || it.module === 'M12').length;
  for (let f = 0; alg < LIMITS.algebraFloor && f < LIMITS.algebraFloor * 2; f++) {
    if (overBudget()) break;                       // home r1: minute budget (the floor returns on the next Page)
    const sys = (f + pageIndex) % 2 === 0;
    const template = sys ? 'T-sys' : 'T-quad-solve';
    const params = sys ? null : { mode: quadOk && rng.chance(0.5) ? 'a2' : 'a1' };
    const item = variantItem(template, `${tag}-f${f}`, 'floor', { params });
    if (item && !fits(item)) break;                // home r1: minute budget
    if (take(item)) { counts.floor++; alg++; }
  }

  // ---- ordering: hard items never first, a Rematch never item 1, then the same-skill spread
  let ordered = queue;
  const firstOk = it => !it.isRematch && it.tier < 4;
  if (ordered.length && !firstOk(ordered[0])) {
    const j = ordered.findIndex(firstOk);
    if (j > 0) { const [lead] = ordered.splice(j, 1); ordered.unshift(lead); }
  }
  const spread = spreadSkills(ordered);
  ordered = spread.queue;
  for (const it of spread.dropped) { used.delete(it.id); carried.push(it); }
  if (ordered.length && !firstOk(ordered[0])) {
    const j = ordered.findIndex(firstOk);
    if (j > 0) { const [lead] = ordered.splice(j, 1); ordered.unshift(lead); }
  }
  ordered.forEach((it, i) => { it.n = i + 1; });
  counts.tier4 = ordered.filter(it => it.tier >= 4).length;
  const roleCounts = { review: 0, rematch: 0, new: 0, weak: 0, floor: 0 };
  for (const it of ordered) roleCounts[it.role] = (roleCounts[it.role] ?? 0) + 1;

  const meta = {
    day: today, dayIndex, pageIndex, D, q, qEff, R: Math.round(qInfo.R * 10) / 10, warn: qInfo.warn, first,
    counts: roleCounts, tier4: counts.tier4, modules: chosen, carried: carried.map(it => it.id),
    boss: bossReady(save)[0] ?? null, seedTag: tag,
    minutes: Math.round(estimateMinutes(ordered)), minutesMax,
  };
  return { seed, seedTag: tag, queue: ordered, meta };
}

/* ---------------- the primary button ---------------- */
/** `RUN NEXT · 6 reviews + 8 new` from a composed page (or its meta). */
export function pageLabel(page) {
  const c = page?.meta?.counts ?? page?.counts ?? {};
  const reviews = (c.review ?? 0) + (c.rematch ?? 0);
  const fresh = c.new ?? 0;
  const variants = (c.weak ?? 0) + (c.floor ?? 0);
  const parts = [];
  if (reviews) parts.push(`${reviews} review${reviews === 1 ? '' : 's'}`);
  if (fresh) parts.push(`${fresh} new`);
  if (variants) parts.push(`${variants} variant${variants === 1 ? '' : 's'}`);
  return parts.length ? `RUN NEXT · ${parts.join(' + ')}` : 'RUN NEXT';
}

/** Missed originals (S7 loop): attempted, not cleared first-try — cleared Bronze, or attempted and uncleared. */
export function missedOriginals(save) {
  const out = [];
  for (const [id, rec] of Object.entries(save?.cards ?? {})) {
    const c = cardById[id];
    if (!c || isBonus(id) || !isObj(rec) || rec.lastAt == null) continue;
    if (rec.lastFirstTry === false || (rec.cleared !== true) || rec.rarity === 'bronze' || rec.solutionShown === true) out.push(id);
  }
  return out;
}

/**
 * nextAction(save) → { kind, label, href, page? } — Home's one primary button (S1): the next correct action.
 * kinds: resume · post · morning · night · warmup · boss · mock · missed · page
 */
export function nextAction(save, { now = Date.now(), today = todayISO(new Date(now)), compose = null } = {}) {
  const D = daysUntilTest(save?.settings?.testDate, today);
  const testAt = testAtOf(save);
  const post = (testAt != null && now > testAt + 90 * MIN_MS) || (D != null && D < 0);
  const ip = resumePage(save);
  if (ip) return { kind: 'resume', label: `Continue page · ${Math.min(ip.idx + 1, ip.queue.length)} of ${ip.queue.length}`, href: '#/run/page' };
  if (post) return { kind: 'post', label: 'After the test · Binder', href: '#/binder' };
  if (D === 0) return { kind: 'morning', label: 'Test Morning', href: '#/run/morning' };
  if (D === 1) return { kind: 'night', label: 'Night Before', href: '#/run/night' };
  const attempted = Object.values(save?.cards ?? {}).some(r => isObj(r) && r.lastAt != null);
  if (!save?.placement?.done && !attempted && !(save?.runs ?? []).length) return { kind: 'warmup', label: 'Warm-up', href: '#/onboard' };
  const boss = bossReady(save)[0];
  if (boss) return { kind: 'boss', label: `Boss: ${boss.name}`, href: `#/boss/${boss.id}` };
  const daily = save?.daily?.[today];
  const goalMet = !!daily?.goalMet;
  const fullMocks = (save?.runs ?? []).filter(r => runKind(r) === 'mock' && r.status === 'done').length;
  if (D != null && D <= 4 && goalMet && !daily?.mockDone && !latestMock(save)) return { kind: 'mock', label: `Mock #${fullMocks + 1}`, href: '#/mock' };
  if (goalMet && missedOriginals(save).length) return { kind: 'missed', label: 'Drill what you missed', href: '#/run/missed' };
  // `compose` lets the caller preview the page it is about to START with the same opts (W4: Home hands
  // this `plan.composeOpts(save)`, so the "~N min / seed" line describes the queue the button will build).
  const page = composePage(save, { ...(isObj(compose) ? compose : null), now, today });
  return { kind: 'page', label: pageLabel(page), href: '#/run/page', page };
}

/* ---------------- inProgress (S6) ---------------- */
/** Compose and write the queue to `save.inProgress`; returns it. A page already in progress is kept. */
export function startPage(save, opts = {}) {
  const ip = resumePage(save);
  if (ip && !opts.force) return ip;
  const now = opts.now ?? Date.now();
  const page = composePage(save, { ...opts, now });
  save.inProgress = {
    kind: 'page', seed: page.seed, seedTag: page.seedTag, queue: page.queue, idx: 0, hearts: null, xp: 0,
    startedAt: now, day: page.meta.day, dayIndex: page.meta.dayIndex, pageIndex: page.meta.pageIndex, meta: page.meta,
  };
  return save.inProgress;
}

/** The page in progress (queue at `idx`), or null. */
export function resumePage(save) {
  const ip = save?.inProgress;
  if (!isObj(ip) || ip.kind !== 'page' || !Array.isArray(ip.queue) || !ip.queue.length) return null;
  if (!Number.isInteger(ip.idx) || ip.idx < 0) ip.idx = 0;
  return ip;
}

export const currentItem = ip => (ip && ip.queue[Math.min(ip.idx, ip.queue.length - 1)]) || null;

/** Record an item's result on the queue and advance `idx`. Returns the next item (null when the page is done). */
export function markItem(save, result, { idx } = {}) {
  const ip = resumePage(save);
  if (!ip) return null;
  const i = Number.isInteger(idx) ? idx : ip.idx;
  const it = ip.queue[i];
  if (it) { it.done = true; it.result = result ?? { ok: true }; }
  if (i === ip.idx) ip.idx = Math.min(ip.queue.length, ip.idx + 1);
  return ip.idx < ip.queue.length ? ip.queue[ip.idx] : null;
}

/**
 * In the Review block a missed item is re-queued to the end of the block (S1 step 4): a copy of the item
 * at `idx` (default the current one) is inserted after the last review/rematch item, marked `requeued`.
 */
export function requeueReview(save, { idx, result = null } = {}) {
  const ip = resumePage(save);
  if (!ip) return null;
  const i = Number.isInteger(idx) ? idx : ip.idx;
  const it = ip.queue[i];
  if (!it || !(it.isReview || it.isRematch)) return null;
  // r1: ONE retry per review. Every miss already books a Rematch for the next Page (card.js), so a copy
  // that fails again has nowhere left to go but a third copy — the queue grew from 25 to 60+ items and
  // the Page never ended. A voluntary "Show solution" is not re-queued at all: retrying the same item
  // straight after reading its solution is copying, and the next-Page Rematch covers it.
  if ((it.requeued ?? 0) >= MAX_REQUEUE) return null;
  const r = result ?? it.result;
  if (r && r.reason === 'revealed') return null;
  let last = i;
  for (let k = ip.queue.length - 1; k > i; k--) if (ip.queue[k].isReview || ip.queue[k].isRematch) { last = k; break; }
  const copy = { ...it, done: false, result: null, requeued: (it.requeued ?? 0) + 1 };
  ip.queue.splice(last + 1, 0, copy);
  ip.queue.forEach((q, n) => { q.n = n + 1; });
  return copy;
}

/** r1: a review is re-queued at most this many times in one Page (S1 step 4, bounded). */
export const MAX_REQUEUE = 1;

/** Close the page: clears inProgress and returns the finished queue (run.js writes the run record). */
export function finishPage(save) {
  const ip = resumePage(save);
  if (!ip) return null;
  save.inProgress = null;
  if (!isObj(save.counters)) save.counters = {};
  save.counters.pages = (save.counters.pages ?? 0) + 1;
  return ip;
}

/** One line per item — for notes, tests and the console. */
export function describeQueue(queue) {
  return queue.map(it => `${String(it.n).padStart(2)} ${it.role.padEnd(7)} t${it.tier} ${(it.skill ?? '-').padEnd(10)} ${it.id}${it.forCard ? ` (for ${it.forCard})` : ''}`).join('\n');
}

/* ==========================================================================================
   J5 — THE JOB: board bundles (COMPOSED-GAME G1 "What a contract is", G3.7 proof 7, G4)
   ------------------------------------------------------------------------------------------
   ADDITIVE ONLY. `composePage` above is untouched: nothing below this line is called from it, and
   `tests/job-board.test.mjs` §1 pins its output with FOUR HUNDRED digests (saves 0…399, the same
   corpus generator, regenerated nowhere).

   ROUND 3 — WHAT "UNTOUCHED" DOES AND DOES NOT MEAN, because the old wording here said "stays
   byte-identical for the same seed" and that was false by one save in four hundred. The FUNCTION is
   byte-identical to pre-ticket — `git diff` against the pre-ticket tree removes exactly two lines
   from this file, both of them `import` statements; what moves a Page is a new file in a protected
   directory (`js/gen/asn-reason.js`) reached through the registry. The composed PAGE is not always,
   because the layer's one content-adjacent edit — J5b's `data/templates.js` entry for
   `T-asn-reason` — is read by `templateForSkill` → `templatesForSkill` above, so a save whose
   weak-skill draw lands on ASN-PLP or ASN-ANG now resolves that slot differently.

   ROUND-2 VERIFICATION — THE RATE AND THE SECOND MECHANISM. "One divergence (save 102)" is what the
   400-save pin can SEE, not the rate, and it describes only one of the two ways the registry entry
   moves a Page. Swept to 2 000 saves against the same pre-ticket registry (deleting the one J5b
   entry IS the pre-ticket registry — `allTemplates()` reads the object live):

       13 divergences of 2 000 = 0.65 %, not 1 in 400 — 2.6× what the pinned window can see
       12 of them DRAW `T-asn-reason` into the weak slot
        1 of them (save 656) draws no template at all and comes out one item SHORTER (14 against 15)

   The second mechanism is step 5 below, the weak-skill loop. Pre-ticket `templateForSkill` returned
   null for ASN-PLP, the loop fell through to the ASN fallback and took the ORIGINAL card `fact-01`.
   With J5b registered it returns `T-asn-reason`, builds a Variant, the Variant does not fit the
   minute budget, `if (item && !fits(item)) break;` leaves the loop — and the fallback card is never
   taken. So registering a template can make a Page SHORTER, and "except where the template is drawn"
   is not the whole exception. Global rule 5 is intact either way: `fact-01` is still scheduled and
   returns on a later Page.

   THE OBVIOUS FIX IS REFUTED, WITH THE MEASUREMENT: making that `break` fall through to the ASN
   fallback moves 667 of the same 2 000 Pages (33.4 %), 123 of them inside the pinned 400, because
   every weak slot with a generator also stops breaking. One save gets its item back and a third of
   the corpus gets a different Page. The wording is what is wrong, not the loop
   (`tests/job-board.test.mjs` "…and the J5b exception is BOTH mechanisms, swept to 2000 saves";
   designs/SPEC-CORRECTIONS.md A-4).

   Three functions are added beside `composePage`, and the game layer never composes: it partitions
   what the composer composed.

     composeBundles(save, opts) → { bundles[≤5], critical[], supply, minutes, … }
       partitions `composePage`'s queue into contracts for PRICING AND SELECTION only, replicating
       every critical due into ≥ 3 of the 5 so that any legal 3-of-5 draft contains all of them
       (|A ∩ B| ≥ 3 + 3 − 5 = 1 — that is the whole proof).
     draftUnion(bundles, picks) → dedupe, then the composer's own `spreadSkills` + the 1→4 tier ramp.
       Contracts survive only as a source label (`from`), never as consecutive blocks (G10 #19).
     jobBudget(shape) → the shape's target/tier/minute/second budget, recomputed from `econ.js`.

   COMPOSED Global rule 5 holds by construction: nothing here marks, drops or re-schedules an item.
   A target a job does not reach is simply not posted tonight; it stays DUE and returns on a later
   Page. It is not guaranteed to be on the NEXT Page, and that is `composePage`'s business rather
   than the game's: `LIMITS.dues` serves twelve, so the least overdue of eighteen waits (4 of 1 162
   boards over 400 saves × every shape), and a deferred critical does not always lead the review
   block (14 of 1 162 — a TIER-4 one can never lead a Page at all, because a hard item is never
   first). The schedule itself is intact on 1 162 of 1 162
   (`tests/job-board.test.mjs` "a target a job does not reach stays due…"; SPEC-CORRECTIONS A-5).
   ========================================================================================== */

/** The five contract letters (G1's board prints `A`–`E`). */
export const JOB_BUNDLE_IDS = Object.freeze(['A', 'B', 'C', 'D', 'E']);
/**
 * A contract is at least this many locks, which is what turns a thin queue into a thin board:
 * `posted = clamp(floor(queue / 2), 1, 5)` (G4 response 1 "the board posts what exists").
 * The VALUE lives in `data/job.js BOARD.minLocks` (notes/J5.md §7, moved at integration); this is a
 * re-export so the existing importers and `tests/job-board.test.mjs` keep their name.
 */
export const JOB_MIN_LOCKS = BOARD.minLocks;

const jobWingOf = (skill) => WING_OF_SKILL[skill] ?? null;
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ---------------------------------------------------------------- the shape's budget */

/**
 * jobBudget(shape) → the JOB's own budget for a shape, every number recomputed from `data/job.js`
 * and `job/econ.js` rather than transcribed (G1's shape table is the authority for the seconds).
 * @param {string|object} [shape='JOB']  a SHAPES id ('RUN' | 'JOB' | 'JOB12' | 'VAULT') or the entry
 */
export function jobBudget(shape = 'JOB') {
  const id = typeof shape === 'string' ? shape : shape?.id;
  const s = SHAPES[id] ?? SHAPES[String(id ?? '').toUpperCase()] ?? SHAPES.JOB;
  const table = shapeTable(s);
  const tierMix = { ...s.tierMix };
  let minutes = 0;
  for (const [tier, n] of Object.entries(tierMix)) minutes += n * (LIMITS.minutesPerTier[tier] ?? 1.5);
  const posted = BOARD.postedMax;
  return Object.freeze({
    id: s.id, name: s.name,
    targets: s.targets,
    tierMix: Object.freeze(tierMix),
    tierMax: Math.max(...Object.keys(tierMix).map(Number)),
    tier4: tierMix[4] ?? 0,
    briefs: s.briefs,
    briefAfter: Object.freeze(BOARD.briefAfterTargets.slice(0, s.briefs)),
    vault: !!s.vault,
    minutes: jobRound(minutes, 1),
    posted,
    draft: BOARD.draftFor[posted] ?? 0,
    answerS: table.answerS,
    decisionS: table.decisionS,
    gameS: Object.freeze({ ...table.gameS }),
    wallS: Object.freeze({ ...table.wallS }),
    split: Object.freeze({ ...table.split }),
    lootMean: table.lootMean,
    decisions: Object.freeze({ ...decisionCount(s), perItem: Object.freeze({ ...decisionCount(s).perItem }) }),
  });
}

/* ---------------------------------------------------------------- one target, priced */

/** `xp.scopeFor` flags for a composed queue item (`scopeOf` in econ.js turns these into the number). */
function scopeFlagsFor(it, save) {
  const mastered = !it.isReview && !it.isVariant && !!isMastered(save?.skills?.[it.skill]);
  return { isReview: !!it.isReview, isVariant: !!it.isVariant, isMastered: mastered, isBonusBank: false };
}

/**
 * jobTargetOf(item, save, opts) → the game's view of ONE composed queue item. The queue item itself is
 * never mutated: `item` is carried through as `.item` so `run.js` / `card.js` still render it verbatim.
 * @param {object} it        a `composePage` queue item
 * @param {object} save
 * @param {{now?:number, order?:number, tellFor?:(skill:string)=>object|null}} [opts]
 */
export function jobTargetOf(it, save, { now = Date.now(), order = 0, tellFor = null } = {}) {
  const rec = it.isVariant ? (save?.frozen?.[it.id] ?? null) : (save?.cards?.[it.id] ?? null);
  const bucket = Number.isFinite(it.bucket) ? it.bucket : (Number.isFinite(rec?.bucket) ? rec.bucket : null);
  const overdueDays = Number.isFinite(it.overdue)
    ? Math.max(0, it.overdue)
    : (rec?.due != null ? Math.max(0, overdueDaysOf(rec, now)) : 0);
  const scopeFlags = scopeFlagsFor(it, save);
  const tell = typeof tellFor === 'function' ? (tellFor(it.skill, it) ?? null) : null;
  const priced = {
    tier: it.tier, scopeFlags,
    bucket: bucket ?? undefined,
    overdueDays: bucket == null ? undefined : overdueDays,
    tell,
  };
  return {
    id: it.id,
    item: it,
    order,
    skill: it.skill ?? null,
    wing: jobWingOf(it.skill),
    tier: it.tier,
    role: it.role,
    bucket, overdueDays,
    sweep: !!it.sweep,
    scopeFlags,
    tell,
    critical: isCriticalTarget({ role: it.role, isReview: it.isReview, bucket, overdueDays, sweep: !!it.sweep }),
    posted: postedFor(priced),
    minutes: LIMITS.minutesPerTier[it.tier] ?? 1.5,
  };
}

/**
 * G3.7 proof 7 — a **critical** item is a due review that is cold, low-bucket or test-clamped:
 * `bucket ≤ 2`, or `overdue ≥ 1 day`, or the Final-Sweep clamp (`schedule.dueList`'s `sweep` flag).
 * Items with no Leitner record (new cards, weak/floor Variants) are never critical.
 */
export function isCriticalTarget(t) {
  if (!t) return false;
  const isReview = t.role === 'review' || t.isReview === true;
  if (!isReview) return false;
  if (t.bucket == null) return false;
  return (t.bucket <= BOARD.criticalBucketMax)
    || ((t.overdueDays ?? 0) >= BOARD.criticalOverdueDays)
    || t.sweep === true;
}

/** How many contracts a queue of `n` items can post: `min(5, available)` (G4 response 1). */
export function postedCountFor(n) {
  if (!(n > 0)) return 0;
  return Math.max(1, Math.min(BOARD.postedMax, Math.floor(n / JOB_MIN_LOCKS)));
}

/** How many of the posted contracts you draft: 5 → 3 · 4 or 3 → 2 · ≤ 2 → no draft. */
export const draftCountFor = (posted) => BOARD.draftFor[posted] ?? 0;

/**
 * The replication factor: a critical must land in enough contracts that EVERY legal draft contains it.
 * With `n` posted and `d` drafted, two subsets of a common `n`-set of sizes `r` and `d` intersect when
 * `r + d − n ≥ 1`, so `r = max(3, n − d + 1)`, capped at `n`. (n = 5, d = 3 → 3, which is G3.7's number.)
 */
export function criticalReplicationFor(posted, draft) {
  if (posted <= 0) return 0;
  return Math.min(posted, Math.max(BOARD.criticalReplicationMin, posted - draft + 1));
}

const comb = (n, k) => {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
  return Math.round(out);
};

/**
 * The share of the `C(n, d)` legal drafts that pick up a lock posted in `r` of the `n` contracts:
 * `1 − C(n − r, d)/C(n, d)`. It is exactly 1 once `r ≥ n − d + 1` — which is the critical case.
 */
export function coverageOf(posted, draft, rep) {
  if (posted <= 0 || draft <= 0) return 1;
  const total = comb(posted, draft);
  if (!total) return 1;
  return 1 - comb(posted - rep, draft) / total;
}

/**
 * How many CHOICE locks each contract carries — locks posted in exactly one contract, so a `d`-draft
 * takes exactly `d` of the `n` posted. One per contract keeps `core = targets − d` (7 of a JOB-10's
 * 10 locks are in every draft) while still making the draft a decision with three different answers.
 */
export const JOB_CHOICE_LOCKS = 1;

/** G3.4's wing floor: below three wings on the board the guard's fixed point collapses (§3.4). */
export const JOB_WINGS_MIN = 3;

/**
 * THE RUN CAP AS A COUNT, not as an order: the most locks of ONE make a `targets`-long job can hold
 * and still admit an order with no run longer than `k`.
 *
 * Spread `m` locks of one make as far apart as possible and they cut the other `targets − m` into
 * blocks; the arrangement exists exactly when `m ≤ k · (targets − m + 1)`, i.e.
 * `m ≤ k · (targets + 1) / (k + 1)`. For the four shapes at `k = 2`: RUN-6 → 4, VAULT-7 → 5,
 * JOB-10 → 7, JOB12 → 8. Above it no arranger can keep `LIMITS.sameSkillRun`, because no such
 * ORDER EXISTS — which is why this is a rule about what the board may POST, not about `arrangeJob`.
 *
 * Round 3: the school window's RUN posts 6 targets, and `composeBundles` was free to fill them with
 * 5 locks of one make. `postBoard(save, day, {shape:'RUN'})` on corpus save 69 drafted
 * `VOC VOC PAIRS VOC VOC VOC` — a run of 3 — and the arranger was not at fault: `existsMonotone`
 * and a memoised run oracle both agree that 5 VOC + 1 PAIRS admits no order under the cap at all.
 * The flat Page never serves this because `spreadSkills` DROPS the overflow; a job may not drop
 * (COMPOSED Global rule 5), so the job has to not post it. One break in 15 984 drafts before this
 * rule (4 shapes × 400 saves × every legal draft), zero after, and the cap only ever binds where
 * the composed Page has another make to offer.
 */
export function runCapFor(targets, k = LIMITS.sameSkillRun) {
  if (!(targets > 0) || !(k > 0)) return Infinity;
  return Math.floor((k * (targets + 1)) / (k + 1));
}

/**
 * The CHOICE locks: `n` items of the composed Page that are NOT in the core, one per contract.
 *
 * Order of preference, all of it inside the composer's own queue — this function never invents an
 * item and never re-orders what the composer chose, it only decides which of the composer's own
 * leftovers get posted tonight:
 *   0. THE RUN CAP FIRST (round 3, see `runCapFor`). One choice lock goes to each contract, so a
 *      `d`-draft can take ANY `d` of them: a make with `c` locks in the core and `j` among the
 *      choice locks reaches `c + min(j, d)` in the worst draft, and that has to stay inside
 *      `runCapFor(targets)` or the drafted queue admits no legal order. Candidates that would break
 *      it are skipped in every pass below and taken only in the last-resort fill, so the count the
 *      shape needs is still posted exactly on a Page that has nothing else to give.
 *   1. the WING FLOOR (G3.4) — one lock per wing the Page carries and the core missed, up to
 *      `min(3, wings on the Page)`. Without it a Page of four wings whose ten coldest dues are all
 *      RECALL posts a one-wing board, and `guardDist` prints a 1.00 bar (notes/board-fix.md §2).
 *   2. the composer's own NON-critical work, in the composer's order (new cards, weak Variants,
 *      warm reviews) — the work that used to be composed and then never posted.
 *   3. only then the next criticals, most overdue first, on a Page that is nothing but cold dues.
 *
 * @param {object[]} all   every priced item of the composed Page, in the composer's order
 * @param {object[]} core  the locks already in the core
 * @param {number} n       how many choice locks to post
 * @param {{draft?: number, targets?: number, sameSkillRun?: number}} [opts]  the shape's own numbers
 */
function choiceLocks(all, core, n, opts = {}) {
  if (!(n > 0)) return [];
  const draft = Math.max(0, Number.isFinite(opts.draft) ? opts.draft : 0);
  const cap = runCapFor(Number.isFinite(opts.targets) ? opts.targets : 0,
    Number.isFinite(opts.sameSkillRun) ? opts.sameSkillRun : LIMITS.sameSkillRun);
  const inCore = new Map();
  for (const t of core) inCore.set(t.skill, (inCore.get(t.skill) ?? 0) + 1);
  const inChoice = new Map();
  /** would posting `t` let some legal draft hold more of one make than any order can spread? */
  const breaksRunCap = (t) => {
    if (!(draft > 0) || !Number.isFinite(cap)) return false;
    const c = inCore.get(t.skill) ?? 0;
    const j = inChoice.get(t.skill) ?? 0;
    return c + Math.min(j + 1, draft) > cap;
  };
  const taken = new Set(core.map(t => t.id));
  const out = [];
  const push = (t, { capped = true } = {}) => {
    if (!t || taken.has(t.id) || out.length >= n) return false;
    if (capped && breaksRunCap(t)) return false;
    taken.add(t.id); out.push(t);
    inChoice.set(t.skill, (inChoice.get(t.skill) ?? 0) + 1);
    return true;
  };
  const pageWings = [...new Set(all.map(t => t.wing).filter(Boolean))];
  const have = new Set(core.map(t => t.wing).filter(Boolean));
  const floor = Math.min(JOB_WINGS_MIN, pageWings.length);
  for (const w of pageWings) {
    if (out.length >= n || have.size >= floor) break;
    if (have.has(w)) continue;
    /* the first lock of this wing the run cap can still hold; the wing floor is not worth a queue
       that cannot be ordered, and the last-resort fill below will take one anyway if nothing else
       is left */
    if (push(all.find(t => t.wing === w && !taken.has(t.id) && !breaksRunCap(t)))) have.add(w);
  }
  for (const t of all) { if (out.length >= n) break; if (!t.critical) push(t); }
  const byOverdue = all.filter(t => t.critical)
    .slice()
    .sort((a, b) => (b.overdueDays - a.overdueDays) || (a.bucket - b.bucket) || (a.order - b.order));
  for (const t of byOverdue) { if (out.length >= n) break; push(t); }
  /* LAST RESORT — the shape's target count is exact (`core + d·choicePer = targets`) and Global rule
     5 forbids dropping, so a Page with nothing else to offer still fills the board. The run cap then
     cannot be kept by anybody, and `tests/job-board.test.mjs` asserts the order laws against an
     exact oracle rather than against the cap, so this case is measured instead of hidden. */
  for (const t of all) { if (out.length >= n) break; push(t, { capped: false }); }
  return out;
}

/* ---------------------------------------------------------------- composeBundles */

/**
 * composeBundles(save, opts) → the posted board.
 *
 * @param {object} save
 * @param {object} [opts]  every `composePage` option, plus:
 *   `page`      a composed page to partition (default: `composePage(save, opts)`)
 *   `shape`     a SHAPES id (default 'JOB')
 *   `seed`      the PINNED job seed string (G3.7 proof 6 — a resume may not re-roll the partition)
 *   `jobIndex`  which job of the day this is
 *   `tellFor`   `(skillId, item) → tag record | null` (J7 owns the Fault Index; default: no tell)
 * THE CRITICAL DUES ARE IN THREE NAMED PARTS, and the sum of them is every critical on the composed
 * Page — nothing is silently dropped (Global rule 5, and notes/board-fix.md §1):
 *   `critical[]`         the CORE: replicated into `r` contracts, so EVERY legal draft carries them
 *   `criticalOptional[]` posted as CHOICE locks: one contract each, so a `d`-draft carries `d` of `n`
 *   `deferred[]`         not posted tonight at all; still due, and they lead the next board
 *
 * @returns {{bundles:object[], critical:string[], criticalOptional:string[], deferred:string[],
 *            supply:object, minutes:number, page:object, pool:object[], core:object[],
 *            choice:object[], posted:number, draft:number, thin:boolean, wings:string[],
 *            supplyLines:string[], seed:string, budget:object}}
 */
export function composeBundles(save, opts = {}) {
  const now = opts.now ?? Date.now();
  const today = opts.today ?? todayISO(new Date(now));
  const page = opts.page ?? composePage(save, opts);
  const budget = jobBudget(opts.shape ?? 'JOB');
  const jobIndex = Number.isInteger(opts.jobIndex) ? opts.jobIndex : 0;
  const seed = opts.seed ?? `${page.seedTag}|job|${jobIndex}`;
  const rng = rngFrom('bundles', seed);

  /* 1 — price every composed item. Nothing is added to the queue and nothing is taken out of it. */
  const all = page.queue.map((it, i) => jobTargetOf(it, save, { now, order: i, tellFor: opts.tellFor ?? null }));

  /* 2 — the criticals, most overdue first. A job cannot carry more criticals than it has targets, so
         the overflow is posted as a CHOICE lock or named in `deferred[]`; either way it stays due and
         leads the next board (Global rule 5 — nothing here drops an item from the schedule). */
  const criticalAll = all.filter(t => t.critical)
    .slice()
    .sort((a, b) => (b.overdueDays - a.overdueDays) || (a.bucket - b.bucket) || (a.order - b.order));
  const critAll = new Set(criticalAll.map(t => t.id));

  /* 3 — how many contracts the board can post, and how many of them you draft. */
  const posted = postedCountFor(all.length);
  const draft = draftCountFor(posted);

  /* 4 — WHAT THE SHAPE HAS ROOM FOR, in two kinds of lock:
         CORE   — replicated into `r = max(3, n − d + 1)` of the `n` contracts, so any `d`-draft meets
                  every one of them (`r + d − n ≥ 1` — G3.7 proof 7's whole proof). The criticals lead
                  it, most overdue first; anything after them is the composer's own queue order.
         CHOICE — posted in exactly ONE contract, so a `d`-draft carries exactly `d` of the `n`.
         `core + d·choicePer = targets`, so EVERY legal draft serves the shape's target count exactly
         AND the draft is a real decision: the `n` choice locks differ and you take `d` of them.
         The choice locks are the composer's own NON-critical work first (new cards, weak Variants,
         warm reviews): on a page that is nothing but cold dues the board would otherwise post
         `targets` reviews in every contract and the DRAFT verb would be a coin flip on the posted
         number, with the new work the composer scheduled never posted at all (notes/board-fix.md §3).
         A page too thin to feed `core + n` locks posts what it has, with no choice locks at all. */
  const targets = budget.targets;
  const choicePer = (draft > 0 && targets > draft && all.length >= (targets - draft) + posted)
    ? JOB_CHOICE_LOCKS : 0;
  const coreN = Math.max(0, Math.min(targets - draft * choicePer, all.length));
  const byPriority = [...criticalAll, ...all.filter(t => !critAll.has(t.id))];
  const core = byPriority.slice(0, coreN);
  const choice = choiceLocks(all, core, posted * choicePer, { draft, targets });
  const chosen = new Set([...core, ...choice].map(t => t.id));
  const pool = all.filter(t => chosen.has(t.id));              // the composer's own order
  const criticals = core.filter(t => t.critical);
  const criticalOptional = choice.filter(t => t.critical).map(t => t.id);
  const deferred = criticalAll.filter(t => !chosen.has(t.id)).map(t => t.id);

  /* 5 — the partition. One CHOICE lock to a contract (rotated by the pinned seed), so the five rows
         differ, the board spans the wings `choiceLocks` reserved, and drafting is a real choice. */
  const bundles = Array.from({ length: posted }, (_, i) => ({ idx: i, id: JOB_BUNDLE_IDS[i], targets: [] }));
  const rot = posted > 0 ? rng.int(0, posted - 1) : 0;
  choice.forEach((t, i) => { if (posted > 0) bundles[(i + rot) % posted].targets.push(t); });

  /* 6 — the core, replicated (G3.7 proof 7). The core is walked in make order and each lock lands in
         `r` CONSECUTIVE contracts (a sliding window, rotated by the same pinned seed): the load is
         exactly even, every contract still sees a different slice of the review block — which is what
         keeps the five dominant makes distinct on a board that is nothing but cold reviews — and any
         `r`- and `d`-subsets of the `n` contracts still intersect, which is the whole proof. */
  const r = criticalReplicationFor(posted, draft);
  const byMake = core.slice().sort((a, b) =>
    cmpStr(a.wing ?? '~', b.wing ?? '~') || cmpStr(a.skill ?? '~', b.skill ?? '~')
    || (b.overdueDays - a.overdueDays) || (a.order - b.order));
  byMake.forEach((t, i) => {
    for (let j = 0; j < r; j++) bundles[(i + j + rot) % posted].targets.push(t);
  });

  /* 7 — G3.4 "any legal 3-of-5 draft spans ≥ 2 wings": a draft is one-winged only when every one of
         its `d` contracts is confined to that wing, so no wing may own `d` pure contracts. One
         cross-wing lock in the smallest offender fixes it, and the overflow is printed (`A · VOC +2`). */
  if (draft > 0) {
    for (let guard = 0; guard < posted * 2 + 4; guard++) {
      const pure = new Map();
      for (const b of bundles) {
        const ws = [...new Set(b.targets.map(t => t.wing).filter(Boolean))];
        if (ws.length === 1) { if (!pure.has(ws[0])) pure.set(ws[0], []); pure.get(ws[0]).push(b); }
      }
      const bad = [...pure.entries()].find(([, bs]) => bs.length >= draft);
      if (!bad) break;
      const [w, bs] = bad;
      const target = bs.slice().sort((a, b) => (a.targets.length - b.targets.length) || (a.idx - b.idx))[0];
      const have = new Set(target.targets.map(t => t.id));
      const donor = pool.find(t => t.wing && t.wing !== w && !have.has(t.id));
      if (!donor) break;
      target.targets.push(donor);
    }
  }

  /* 8 — finish each contract: composer order inside it, then the printed row. A contract's own
         `critical[]` names every due it holds, core or choice; the board's `critical[]` names only
         the core, because only the core is in EVERY draft. */
  const postedCrit = new Set([...criticals.map(t => t.id), ...criticalOptional]);
  const names = assignLabels(bundles);
  const out = bundles.map((b, i) => finishBundle(b, postedCrit, names[i]));

  const supply = wingSupply(save, { now, templatesForSkill, templatesFor });
  return {
    bundles: out,
    critical: criticals.map(t => t.id),
    criticalOptional,
    supply: supply.wings,
    minutes: jobRound(pool.reduce((s, t) => s + t.minutes, 0), 1),
    supplyLines: supply.lines,
    /* the wing order `wingSupply` built those lines in — `supply` is a record, and a board that
       re-prints the numbers in a shorter form (round 3, player-feel: `job/board.js supplyRow`) has
       to keep the supply file's own order rather than invent one. */
    supplyOrder: supply.order,
    supplyThin: supply.thin,
    deferred,
    page,
    pool,
    core,
    choice,
    posted,
    draft,
    replication: r,
    choicePer,
    thin: posted < BOARD.postedMax,
    wings: [...new Set(out.flatMap(b => b.wings))],
    seed,
    today,
    jobIndex,
    budget,
  };
}

/** One bundle's makes, most-supplied first, ties by skill id — the order a name is preferred in. */
function rankedMakes(b) {
  const bySkill = new Map();
  for (const t of b.targets) bySkill.set(t.skill, (bySkill.get(t.skill) ?? 0) + 1);
  return {
    bySkill,
    ranked: [...bySkill.entries()].sort((x, y) => (y[1] - x[1]) || cmpStr(String(x[0]), String(y[0]))),
  };
}

/**
 * assignLabels(bundles) → one name per contract, ALL OF THEM AT ONCE.
 *
 * G1: "A bundle's label is the make that supplies most of its locks, printed with the overflow:
 * `A · VOC +2`." Round 1 broke a TIE at the top count towards a make no earlier contract had taken,
 * so `A NOTE · B VOC · C CLASS` rather than VOC three times. Round 2 (player-feel, "the draft and
 * the press are both no-ops on a recall-heavy board") found that a tie-break is not enough. A save
 * whose whole due list is one sheet — 36 ASN-ANG dues; the RECALL wing owns 5 of the 19 makes,
 * including both 35-card ASN sheets and the 37-card VOC sheet, so this is ordinary and not exotic —
 * gives every contract the SAME STRICT top-count make, with no tie to break, and the board printed
 *
 *     1 A ASN-ANG +2   5 locks · RECALL · ~4 min · posted 62
 *     2 B ASN-ANG +3   6 locks · RECALL · ~4 min · posted 69
 *     3 C ASN-ANG +3   6 locks · RECALL · ~4 min · posted 73
 *     4 D ASN-ANG +2   5 locks · RECALL · ~4 min · posted 62
 *     5 E ASN-ANG +2   5 locks · RECALL · ~4 min · posted 57
 *
 * — five rows a student reads as one row, in front of a DRAFT that G1 counts among the 24 mandatory
 * decisions. The locks underneath really did differ and really did span three wings (round 1's
 * `choiceLocks` wing floor), but the only part of a contract that reaches the eye is its NAME.
 *
 * So the names are a MATCHING, not five independent choices: Kuhn's algorithm over
 * (contract → the makes it actually holds), each contract's candidates tried most-supplied first,
 * contracts taken in board order. That is a MAXIMUM matching, so the board carries as many distinct
 * names as the posted locks can possibly support — a greedy first-come pass cannot promise that
 * (measured: corpus save 5 posted six makes across five contracts and greedily named only four of
 * them, `VOC ASN-ANG ASN-PLP CS-LIN VOC`). A contract the matching cannot name uniquely — because
 * every make it holds is better used elsewhere — keeps its own top make, which is the old rule.
 * `overflow` then counts from the make the contract is NAMED after, so `B · VOC +5` reads "the VOC
 * one, plus five other locks", exactly as G1's own `A · VOC +2` reads.
 */
function assignLabels(bundles) {
  const cands = bundles.map(b => rankedMakes(b).ranked.map(e => e[0]));
  const owner = new Map();                       // make → contract index that has claimed it
  const tryAssign = (i, seen) => {
    for (const make of cands[i]) {
      if (seen.has(make)) continue;
      seen.add(make);
      const held = owner.get(make);
      if (held === undefined || tryAssign(held, seen)) { owner.set(make, i); return true; }
    }
    return false;
  };
  const out = bundles.map(() => null);
  for (let i = 0; i < bundles.length; i++) tryAssign(i, new Set());
  for (const [make, i] of owner) out[i] = make;
  /* a contract the matching could not name uniquely keeps its own top make (the pre-round-1 rule) */
  for (let i = 0; i < bundles.length; i++) if (out[i] == null) out[i] = cands[i][0] ?? null;
  return out;
}

/**
 * One contract's printed facts: its name (see `assignLabels`), overflow, wing, gross posted, grade
 * band, coldest lock.
 */
function finishBundle(b, critSet, assigned = null) {
  const targets = b.targets.slice().sort((x, y) => x.order - y.order);
  const { bySkill, ranked } = rankedMakes({ targets });
  const best = ranked.length ? ranked[0][1] : -1;
  const label = (assigned != null && bySkill.has(assigned)) ? assigned : (ranked[0]?.[0] ?? null);
  const named = label != null ? (bySkill.get(label) ?? best) : best;
  const tiers = targets.map(t => t.tier);
  const wings = [...new Set(targets.map(t => t.wing).filter(Boolean))];
  const cold = targets.reduce((m, t) => Math.max(m, t.overdueDays ?? 0), 0);
  const critical = targets.filter(t => critSet.has(t.id)).map(t => t.id);
  const grade = tiers.length ? Math.min(...tiers) : 1;
  const gradeHi = tiers.length ? Math.max(...tiers) : 1;
  return {
    id: b.id,
    label: label ?? '—',
    overflow: Math.max(0, targets.length - named),
    wing: wings.length ? (jobWingOf(label) ?? wings[0]) : null,
    wings,
    posted: targets.reduce((s, t) => s + t.posted, 0),
    minutes: jobRound(targets.reduce((s, t) => s + t.minutes, 0), 1),
    grade,
    gradeHi,
    gradeLabel: grade === gradeHi ? `grade ${grade}` : `grade ${grade}–${gradeHi}`,
    cold: Math.round(cold),
    locks: targets.map(t => t.id),
    targets,
    critical,
    coldLocks: targets.filter(t => (t.overdueDays ?? 0) > 0).length,
  };
}

/* ---------------------------------------------------------------- draftUnion */

/**
 * arrangeJob(list) — the 1→4 tier ramp AND `LIMITS.sameSkillRun` on one pass.
 *
 * Two passes, in this order, so the common case is untouched and the ramp is never broken when it
 * could have been kept:
 *
 *   1. the GREEDY pass below (`arrangeGreedy`), which is what every shipped job has always served;
 *   2. if — and only if — its order is not monotone, the EXACT band search (`arrangeBands`), which
 *      decides the question `tests/job-board.test.mjs existsMonotone` asks and returns the witness.
 *
 * Why the second pass exists: the greedy is myopic. Its feasibility filter asks only whether the rest
 * stays arrangeable under the run cap, never whether taking a higher-tier lock NOW forfeits
 * monotonicity, so when the only remaining lowest-tier lock is blocked by the run cap it reaches into
 * the next tier band and comes back — a tier-2 at index 3 followed by a tier-1 at index 4, on a draft
 * where `VOC VOC NOTE VOC` then the T2 band was available all along. Measured on the shipped corpus
 * generator out to 400 saves: 1 of 3996 drafts (save 211, picks ACD), 0 of the 50 saves that ship
 * (notes/board-fix.md §4). The band search closes it for every draft, not for those fifty.
 */
function arrangeJob(list, { sameSkillRun = LIMITS.sameSkillRun } = {}) {
  const greedy = arrangeGreedy(list, { sameSkillRun });
  if (greedy.every((t, i) => i === 0 || t.tier >= greedy[i - 1].tier)) return greedy;
  return arrangeBands(list, sameSkillRun) ?? greedy;
}

/**
 * The EXACT answer to "is there an order that is both monotone non-decreasing in tier and inside the
 * run cap?", with the order itself when there is one — the same memoised DFS the suite's oracle runs:
 * monotone fixes the tier bands in ascending order, so this is a per-band arrangement problem with a
 * carried `(last make, run)`. Ties inside a band are broken exactly as the greedy breaks them (the
 * make with the most locks left, then the composer's own order), so the two passes agree wherever
 * both are monotone.
 *
 * @returns {object[]|null} the arrangement, or `null` when the run cap makes the ramp impossible
 */
function arrangeBands(list, k) {
  const keyOf = t => t.skill ?? `#${t.id}`;
  const tiers = [...new Set(list.map(t => t.tier))].sort((a, b) => a - b);
  const bands = tiers.map((tier) => {
    const m = new Map();
    for (const t of list.filter(x => x.tier === tier).slice().sort((a, b) => (a.order - b.order) || cmpStr(String(a.id), String(b.id)))) {
      const kk = keyOf(t);
      if (!m.has(kk)) m.set(kk, []);
      m.get(kk).push(t);
    }
    return m;
  });
  if (!bands.length) return list.slice();
  const counts = bands.map(m => new Map([...m.entries()].map(([kk, v]) => [kk, v.length])));
  const itemAt = (b, skill, left) => bands[b].get(skill)[bands[b].get(skill).length - left];
  const seen = new Set();
  const out = [];
  const key = (b, c, last, run) =>
    `${b}|${[...c.entries()].sort().map(e => e.join(':')).join(',')}|${last}|${run}`;
  const go = (b, c, last, run) => {
    if (c.size === 0) {
      if (b + 1 >= bands.length) return true;
      return go(b + 1, new Map(counts[b + 1]), last, run);
    }
    const kk = key(b, c, last, run);
    if (seen.has(kk)) return false;
    seen.add(kk);
    const cands = [...c.entries()].sort((x, y) =>
      (y[1] - x[1]) || (itemAt(b, x[0], x[1]).order - itemAt(b, y[0], y[1]).order) || cmpStr(String(x[0]), String(y[0])));
    for (const [skill, left] of cands) {
      if (skill === last && run >= k) continue;
      const next = new Map(c);
      if (left > 1) next.set(skill, left - 1); else next.delete(skill);
      out.push(itemAt(b, skill, left));
      if (go(b, next, skill, skill === last ? run + 1 : 1)) return true;
      out.pop();
    }
    return false;
  };
  return go(0, new Map(counts[0]), null, 0) ? out : null;
}

/**
 * The greedy pass: at each beat take the LOWEST-tier remaining lock whose make does not open a run of
 * three and whose removal leaves the rest arrangeable (a multiset of counts is arrangeable under a run
 * cap `k` iff `max ≤ k·(total − max + 1)`, less the run already standing). Lowest-tier-first is the
 * ramp; the feasibility filter is what stops the ramp painting the last three locks into one make.
 */
function arrangeGreedy(list, { sameSkillRun = LIMITS.sameSkillRun } = {}) {
  const keyOf = t => t.skill ?? `#${t.id}`;
  const pool = list.slice();
  if (pool.length <= sameSkillRun) return pool;
  const left = new Map();
  for (const t of pool) left.set(keyOf(t), (left.get(keyOf(t)) ?? 0) + 1);
  const arrangeable = (counts, total, last, runLen) => {
    let mx = 0, mk = null;
    for (const [k, c] of counts) if (c > mx || (c === mx && cmpStr(String(k), String(mk)) < 0)) { mx = c; mk = k; }
    if (mx === 0) return true;
    return mx <= sameSkillRun * (total - mx + 1) - (mk === last ? runLen : 0);
  };
  const out = [];
  let last = null, run = 0;
  while (pool.length) {
    let cands = pool.filter(t => !(keyOf(t) === last && run >= sameSkillRun));
    if (!cands.length) cands = pool.slice();
    const safe = cands.filter(t => {
      const k = keyOf(t);
      const next = new Map(left);
      const c = next.get(k) - 1;
      if (c > 0) next.set(k, c); else next.delete(k);
      return arrangeable(next, pool.length - 1, k, k === last ? run + 1 : 1);
    });
    const from = safe.length ? safe : cands;
    from.sort((a, b) => (a.tier - b.tier)
      || ((left.get(keyOf(b)) ?? 0) - (left.get(keyOf(a)) ?? 0))
      || (a.order - b.order)
      || cmpStr(String(a.id), String(b.id)));
    const pick = from[0];
    const k = keyOf(pick);
    run = k === last ? run + 1 : 1;
    last = k;
    const c = left.get(k) - 1;
    if (c > 0) left.set(k, c); else left.delete(k);
    pool.splice(pool.indexOf(pick), 1);
    out.push(pick);
  }
  return out;
}

/**
 * draftUnion(bundles, picks, opts) → the answered job.
 *
 * Dedupe (a replicated critical is answered ONCE — G3.7 proof 7), then the composer's own
 * `spreadSkills` and the 1→4 tier ramp, so `LIMITS.sameSkillRun = 2` and the ramp hold inside a job
 * exactly as they hold on the flat Page (G10 #19). Contracts survive only as `from` on the envelope.
 *
 * @param {object[]} bundles           `composeBundles().bundles`
 * @param {string[]|number[]} picks    contract ids ('A','D','E') or indices
 * @param {{x2?:boolean[]|((i:number)=>boolean), sameSkillRun?:number}} [opts]
 * @returns {{picks:string[], queue:object[], targets:object[], union:string[],
 *            postedGross:number, postedNet:number, shared:number, postedLive:number,
 *            minutes:number, wings:string[], skills:string[], sameSkillRun:number,
 *            monotone:boolean, dropped:object[], x2:number}}
 */
export function draftUnion(bundles, picks, opts = {}) {
  const list = Array.isArray(bundles) ? bundles : [];
  const chosen = [];
  for (const p of (Array.isArray(picks) ? picks : [])) {
    const b = typeof p === 'number' ? list[p] : list.find(x => x.id === p);
    if (b && !chosen.includes(b)) chosen.push(b);
  }
  const sameSkillRun = opts.sameSkillRun ?? LIMITS.sameSkillRun;

  /* dedupe, in board order; the first contract that posted a lock is its source label */
  const seen = new Map();
  for (const b of chosen) {
    for (const t of b.targets) {
      if (seen.has(t.id)) { seen.get(t.id).sources.push(b.id); continue; }
      seen.set(t.id, { target: t, from: b.id, sources: [b.id] });
    }
  }
  const union = [...seen.values()];

  /* the ramp + the spread, then the composer's own `spreadSkills` as the final pass. It drops nothing
     on an already-legal queue; if it ever did, the pre-spread order is kept — Global rule 5 means the
     game never removes an item from the schedule. */
  let arranged = arrangeJob(union.map(u => u.target), { sameSkillRun });
  const spread = spreadSkills(arranged, { sameSkillRun });
  if (spread.dropped.length === 0) arranged = spread.queue;
  /**
   * composePage's own two ordering laws: a hard lock is never first, a Rematch is never item 1.
   *
   * THIS PASS OUTRANKS THE 1→4 RAMP, AND THE PUBLISHED LAW NOW SAYS SO (round-3 verification,
   * board-schedule). COMPOSED-GAME G1 read "`LIMITS.sameSkillRun = 2` holds inside a job absolutely,
   * and the 1→4 tier ramp holds wherever an order under that cap admits one", and the escape clause
   * named only the run cap. It is not the only law that can win: when the drafted queue's ONLY
   * tier-1 lock is a Rematch, no order is both monotone and legally led, and this splice promotes a
   * tier-2 lock to the front and breaks the ramp. Over every shape × 2 000 seeded saves × every legal
   * draft (8 000 boards, 79 968 drafts, the `job-board-corpus` generator):
   *
   *      run-cap breaks                                           0
   *      ramp breaks (a monotone run-safe order exists)          11, on 3 save/shape pairs
   *        …of which on the RECOMMENDED draft                     2   (RUN save 918, VAULT save 918)
   *      ramp breaks (…AND a non-Rematch tier-1 lead exists)      0
   *
   * — the last row is the whole point: model this law in the feasibility oracle and every break is
   * accounted for, so the composer is not myopic here and there is nothing to repair in the arranger.
   * The splice is already MINIMAL: `arranged` is in ramp order, so `findIndex(firstOk)` takes the
   * lead from the lowest tier band that has a legal one, which keeps the ramp whenever the leading
   * band holds any non-Rematch at all. The breaks are all at 400 < i < 1 000, which is why the suite
   * saw none of them; `tests/job-board.test.mjs` now runs the order laws to `ORDER_N` and its
   * `existsMonotone` requires a legal lead.
   */
  const firstOk = t => !t.item?.isRematch && t.tier < 4;
  if (arranged.length && !firstOk(arranged[0])) {
    const j = arranged.findIndex(firstOk);
    if (j > 0) { const [lead] = arranged.splice(j, 1); arranged.unshift(lead); }
  }

  const x2At = typeof opts.x2 === 'function' ? opts.x2
    : Array.isArray(opts.x2) ? (i => !!opts.x2[i])
      : (() => false);

  const queue = arranged.map((t, i) => {
    const u = seen.get(t.id);
    const on = !!x2At(i);
    return {
      ...t.item,
      n: i + 1,
      from: u.from,
      sources: u.sources.slice(),
      wing: t.wing,
      posted: on ? postedFor({ tier: t.tier, scopeFlags: t.scopeFlags, bucket: t.bucket ?? undefined, overdueDays: t.bucket == null ? undefined : t.overdueDays, tell: t.tell, x2: true }) : t.posted,
      x2: on,
      critical: t.critical,
    };
  });

  const postedGross = chosen.reduce((s, b) => s + b.posted, 0);
  const postedNet = union.reduce((s, u) => s + u.target.posted, 0);
  let worst = 0, run = 0, lastSkill = null, monotone = true;
  for (let i = 0; i < arranged.length; i++) {
    run = arranged[i].skill === lastSkill ? run + 1 : 1;
    lastSkill = arranged[i].skill;
    worst = Math.max(worst, run);
    if (i && arranged[i].tier < arranged[i - 1].tier) monotone = false;
  }
  return {
    picks: chosen.map(b => b.id),
    queue,
    targets: arranged,
    union: arranged.map(t => t.id),
    postedGross,
    postedNet,
    shared: postedGross - postedNet,
    postedLive: queue.reduce((s, it) => s + it.posted, 0),
    minutes: jobRound(arranged.reduce((s, t) => s + t.minutes, 0), 1),
    wings: [...new Set(arranged.map(t => t.wing).filter(Boolean))],
    skills: [...new Set(arranged.map(t => t.skill).filter(Boolean))],
    sameSkillRun: worst,
    monotone,
    dropped: spread.dropped,
    x2: queue.filter(it => it.x2).length,
  };
}
