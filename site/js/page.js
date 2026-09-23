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

import { cyrb53, mulberry32 } from './rng.js';
import { todayISO, dayIndex as dayIndexOf, daysUntilTest } from './days.js';
import { cards as ALL_CARDS, byId as cardById } from '../data/cards.js';
import { topoOrder } from '../data/skills.js';
import { moduleById, families, bosses } from '../data/modules.js';
import { getFigure } from '../data/figures.js';
import { getTemplate, templatesFor, templatesForSkill, tagFor } from '../data/templates.js';
import { isBonus } from '../data/source-manifest.js';
import { familyRarity } from './rarity.js';
import { dueList, needsMet, pendingRematches, testAtOf, MIN_MS } from './schedule.js';
import { isCleared, weakSpots, latestMock } from './readiness.js';

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
   THE GAME LAYER'S HALF OF THIS FILE IS GONE (notes/DEMOLISH.md)
   ==========================================================================================
   `composeBundles`, `draftUnion`, `jobBudget`, `jobTargetOf`, the contract letters, the critical
   replication, the coverage proof and the supply rows were the board of 5 and the 3-of-5 draft,
   both of which designs/CUT-BRIEF.md deletes. The game no longer partitions anything: it runs
   `composePage`'s queue, in order, with a different top strip (`js/job/state.js startJob`).
   ========================================================================================== */
