// screens/run.js — #/run/:kind/:id?seed=  (COMPOSED S1 "Screens" + "Optional modes", S7 runs, S8 #16).
//
// ONE screen for every run kind the spec names, so no run type ever grows a route of its own and the
// route count stays 13 (S1). `params` arrive as { kind, id? } and the seed as `query.get('seed')`.
//
//   page      Today's Page — page.js's queue (resume/start), review re-queue, the Page Summary
//   blitz     M1 / M3 / M9 only: 60 s (M1, M3) or 90 s (M9), tier ≤ 2, score-only, a wrong answer
//             subtracts 3 s AND locks input for 1.2 s, three wrongs in a row end the round, a correct
//             answer auto-advances after 250 ms (S1 Global rule 4's single exception)
//   jump      JUMP HERE: 10 items; ≥ 8 marks the module placed (m = 80 with n = 5, placedAt, jumps[M])
//   drill     Drill 5 from one skill, unlimited, `scope 1` (no Variant discount), counts toward Foil
//   daily     Daily Challenge, seed = cyrb53(dateISO), +20 XP once a day
//   full36    all 36 ASN statements, untimed, reason chips on every item (mode 'full36')
//   missed    the missed-originals loop: 5 at a time until each is answered first-try
//   upgrade   every Bronze/Silver original (optionally one sheet), hints off
//   baseline  delegates to screens/mock.js (T13) when it exists; otherwise an honest stub
//   night     delegates to screens/night.js (T14) when it exists; otherwise an honest stub
//   morning   as night, in Test Morning mode
//
// Every card is the T09 card view (`createCardView`), embedded with `onDone` / `onContinue`, so grading,
// XP, mastery, Leitner, rarity, foil and the error log are written in exactly one place. This screen owns
// the queue, the clock, the mode rules and the Summary. `session.combo` (card.js) is deliberately NOT
// reset between items — a Page is one combo run.
//
// BLITZ is the one kind that does NOT use the card view: a 60-second recall sprint cannot afford a result
// strip, a par line and a Continue tap. It renders a lean prompt + answer row, grades through the same
// `grader/index.js`, and writes the clear itself (S4/S7: "a Full 36 or BLITZ clear counts as a clear" for
// Readiness C and the plan's R; S4 Foil class (c) counts a BLITZ clear of a due recall card). It pays no
// XP and touches no combo — S1 calls BLITZ "score-only".

import { h, navigate, bus, setHeader } from '../app.js';
import { getState, update, flush } from '../store.js';
import { todayISO, daysUntilTest } from '../days.js';
import { cyrb53, mulberry32 } from '../rng.js';
import { cards as ALL_CARDS, byId as cardById } from '../../data/cards.js';
import { moduleById, familyById } from '../../data/modules.js';
import { skillById, SKILL_IDS } from '../../data/skills.js';
import { sheetById, sheetOf, numbering } from '../../data/sheets.js';
import { isBonus } from '../../data/source-manifest.js';
import * as T from '../../data/templates.js';
import { mathfmt } from '../mathfmt.js';
import { isClean } from '../xp.js';
import { placeSkill, scoreFor, applyOutcome as applyMastery, decayAll } from '../mastery.js';
import { rarityOf, bestRarity, tileRarity, familyRarity } from '../rarity.js';
import { applyOutcome as applySchedule, outcomeOf, checkDailyGoal, dailyRecord } from '../schedule.js';
import { readiness, readinessDelta, logForecast, skillStates, coverageCount } from '../readiness.js';
import {
  resumePage, startPage, markItem, requeueReview, finishPage, missedOriginals,
  nextAction, pageLabel,
} from '../page.js';
import { composeOpts } from '../plan.js';   // W4 integration (notes/T14.md Requests → T16)
import { createCardView, familyOf, fmtClock } from './card.js';
import { options as mcOptions } from '../grader/mc.js';

/* ================================================================== constants */

/** BLITZ (S1 "Optional modes"): the only visible countdown outside the Mock. */
export const BLITZ = Object.freeze({
  penaltyMs: 3000,        // a wrong answer subtracts 3 s …
  lockoutMs: 1200,        // … and locks input for 1.2 s
  strikes: 3,             // three wrongs IN A ROW end the round
  advanceMs: 250,         // the one auto-advance in the app (Global rule 4)
  maxTier: 2,
  modules: Object.freeze(['M1', 'M3', 'M9']),
  defaultLimitMs: 60_000,
});

/** JUMP HERE (S1): 10 items, ≥ 8 marks the module placed at m = 80 with n = 5. */
export const JUMP = Object.freeze({ items: 10, pass: 8, m: 80 });

export const DRILL_ITEMS = 5;        // "Drill 5" (S7 Weak spots)
export const DAILY_ITEMS = 5;        // Daily Challenge
export const DAILY_XP = 20;          // S4 "Daily Challenge +20"
export const MISSED_PAGE = 5;        // S7 "cycles in 5-item pages"
export const UPGRADE_MAX = 12;       // one sitting of Bronze/Silver originals
export const FULL36_IDS = Object.freeze(Array.from({ length: 36 }, (_, i) => `asn-${String(i + 1).padStart(2, '0')}`));

const KIND_META = Object.freeze({
  page: { title: "Today's Page", back: '/today', mode: 'card' },
  blitz: { title: 'BLITZ', back: '/binder', mode: 'blitz' },
  jump: { title: 'JUMP HERE', back: '/binder', mode: 'card', hints: false },
  drill: { title: 'Drill 5', back: '/today', mode: 'card', drill: true },
  daily: { title: 'Daily Challenge', back: '/today', mode: 'card' },
  full36: { title: 'Full 36', back: '/binder', mode: 'full36' },
  missed: { title: 'Missed originals', back: '/today', mode: 'card' },
  upgrade: { title: 'Upgrade run', back: '/binder', mode: 'card', hints: false },
  baseline: { title: 'Baseline', back: '/today', mode: 'mock', delegate: 'mock' },
  night: { title: 'Night Before', back: '/today', mode: 'card', delegate: 'night' },
  morning: { title: 'Test Morning', back: '/today', mode: 'card', delegate: 'night' },
});

/**
 * Kinds whose screen is owned by another ticket. run.js is the ONE mount point (S1), but it is not the
 * one implementation: T13's Mock engine runs the Baseline, T14's timed-block runner runs Night Before /
 * Test Morning, and T14's JUMP screen (onboard.js, the same screen the Binder tiles link to) runs JUMP —
 * re-rendering any of them here would be a second implementation of a screen that already exists.
 * `fallback:'self'` means run.js's own runner takes over when the module or its export is missing.
 */
const DELEGATES = Object.freeze({
  baseline: { mod: './mock.js', fns: ['mountBaseline', 'mountMock'], fallback: 'stub' },
  night: { mod: './night.js', fns: ['mountRunKind', 'mountNight'], fallback: 'stub' },
  morning: { mod: './night.js', fns: ['mountRunKind', 'mountMorning'], fallback: 'stub' },
  jump: { mod: './onboard.js', fns: ['mountJump'], fallback: 'self' },
  // `post` is not one of S1's run kinds — it is the Post-test state T14 reaches through this route.
  // It is delegated (never listed in RUN_KINDS) so a deep link still lands on the screen that owns it.
  post: { mod: './night.js', fns: ['mountRunKind', 'mountPostTest'], fallback: 'stub' },
});
export const delegateOf = (kind) => DELEGATES[String(kind)] ?? null;

/** Every run kind that mounts here (S1: "every run type named anywhere in S1/S7 mounts here"). */
export const RUN_KINDS = Object.freeze(Object.keys(KIND_META));
export const isRunKind = (k) => Object.prototype.hasOwnProperty.call(KIND_META, String(k));
export const kindMeta = (k) => KIND_META[String(k)] ?? null;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ================================================================== seeds */

/**
 * The seed string for a run. `?seed=` wins (RETRY SAME SEED / a shared link); the Daily Challenge is
 * always cyrb53(dateISO) (S3 "Seeding"); everything else derives from the save so nothing uses Math.random.
 */
export function runSeed(kind, { id = null, seed = null, save = null, today = todayISO() } = {}) {
  if (typeof seed === 'string' && seed) return seed;
  if (kind === 'daily') return String(cyrb53(today) >>> 0);
  const pid = String(save?.profileId ?? 'anon').replace(/[^a-z0-9]/gi, '').slice(0, 8);
  const n = num(save?.seedCounter, 0);
  return `${kind}${id ? '-' + id : ''}|${pid}|${today}|${n}`;
}

/** A short, stable tag for the header corner (S3: the seed is shown on every generated card). */
export const seedTagOf = (seedStr) => (cyrb53(String(seedStr)) >>> 0).toString(16).padStart(8, '0').slice(-6);

/* ================================================================== queue items */

/** An original Card as a queue item — the shape page.js writes, so run.js renders one kind of thing. */
export function cardItem(card, role = 'new', extra = {}) {
  return {
    n: 0, id: card.id, kind: 'card', role,
    skill: (card.skills || [])[0] ?? null, skills: (card.skills || []).slice(),
    tier: num(card.tier, 1), module: card.module ?? null, sheet: card.sheet ?? null,
    isReview: role === 'review', isRematch: role === 'rematch', isVariant: false,
    done: false, result: null, ...extra,
  };
}

/** A generated Variant as a queue item (generated for real only when it is mounted). */
export function variantItem(template, seed, role = 'new', extra = {}) {
  const def = T.getTemplate(template);
  return {
    n: 0, id: `${template}#${T.tagFor(template, String(seed))}`, kind: 'variant', role,
    skill: (def?.skills || [])[0] ?? null, skills: (def?.skills || []).slice(),
    tier: num(def?.tier, 2), module: def?.module ?? null, sheet: def?.sheet ?? null,
    isReview: false, isRematch: role === 'rematch', isVariant: true,
    template, seed: String(seed), params: extra.params ?? {}, forCard: extra.forCard ?? def?.forCard ?? null,
    done: false, result: null, ...extra,
  };
}

/* ------------------------------------------------------------------ renamed reviews (S4) — r1 */

/**
 * S4: "figure-card reviews re-render with letters re-shuffled so the answer cannot be typed from memory."
 * page.js draws the map (spec letter → fresh letter, `it.rename`), but only the SVG used to honour it:
 * the stem still said "Point F is on EC and AD", the side list still offered ∠CFD, and the grader
 * accepted the printed letters — the figure and the question disagreed, and a student who read the
 * figure was marked wrong. So a renamed review is now ONE renamed card: the figure spec carries the
 * merged map (the pairs widget and grader resolve their model from `figure.rename`), and every text
 * field — stem, instruction, hints, solution, part prompts — is rewritten with the same letters.
 *
 * The card's own `figure.rename` (F1: `{A:'G'}`, the printed sheet's G for the teacher's A) is folded in:
 * both the teacher's A and the printed G map to the fresh letter, so "line AD" and "point G" agree.
 * The "printed figure labels the left point G" note is about the ORIGINAL letters and is replaced.
 */
export const RENAMED_NOTE = 'Review: the letters are re-shuffled — read them off the figure, not from memory.';

export function renameCard(card, rename) {
  if (!isObj(card) || !isObj(rename) || !Object.keys(rename).length || !isObj(card.figure)) return card;
  const base = isObj(card.figure.rename) ? card.figure.rename : {};
  const map = {};
  for (const [spec, fresh] of Object.entries(rename)) {
    if (typeof fresh !== 'string' || !/^[A-Z]$/.test(fresh)) continue;
    map[spec] = fresh;
    if (base[spec]) map[base[spec]] = fresh;              // the printed letter names the same point
  }
  if (!Object.keys(map).length) return card;
  const tx = (s) => renameLetters(s, map);
  const fig = (f) => (isObj(f) ? { ...f, rename: { ...(isObj(f.rename) ? f.rename : {}), ...rename } } : f);
  return {
    ...card,
    figure: fig(card.figure),
    stem: tx(card.stem), instruction: tx(card.instruction),
    note: card.note ? RENAMED_NOTE : card.note,
    hints: Array.isArray(card.hints) ? card.hints.map(tx) : card.hints,
    solution: Array.isArray(card.solution) ? card.solution.map((s) => (isObj(s) ? { ...s, say: tx(s.say), math: tx(s.math) } : s)) : card.solution,
    parts: Array.isArray(card.parts) ? card.parts.map((p) => (isObj(p) ? { ...p, prompt: tx(p.prompt), figure: p.figure ? fig(p.figure) : p.figure } : p)) : card.parts,
    renamed: true,
  };
}

/**
 * Rewrite the point letters of one string in ONE pass (so a letter that is both a source and a target
 * — F→G while G→L — is never renamed twice). Handles mathfmt tokens `{ang GFC}` `{m BFD}` `{line AD}`
 * `{seg AB}` `{ray FC}`, `∠GFC`, letter chains `G-F-D`, bare 2–3 letter names (`FG`, `GFC`; only when
 * every letter is a figure letter, so `ASN` / `XP` / `DOC` are untouched), and single letters — except
 * a bare `A`, which is the article unless a naming word precedes it ("Point A", "ray A", "at A").
 */
const RENAME_RE = /\{([a-z]+)\s+([A-Z]{1,3})\}|∠([A-Z]{3})\b|\b([A-Z](?:-[A-Z])+)\b|\b([A-Z]{2,3})\b|\b((?:[Pp]oint|line|ray|at|around|vertex|from|through|labels|and|with|to)\s+)?([A-Z])\b/g;
export function renameLetters(s, map) {
  if (typeof s !== 'string' || !s || !isObj(map)) return s;
  const one = (ch) => map[ch] ?? ch;
  const all = (str) => str.replace(/[A-Z]/g, one);
  const every = (str) => [...str.replace(/-/g, '')].every((ch) => ch in map);
  return s.replace(RENAME_RE, (m, tokKind, tokLetters, angLetters, chain, name, pre, single) => {
    if (tokKind) return `{${tokKind} ${all(tokLetters)}}`;
    if (angLetters) return `∠${all(angLetters)}`;
    if (chain) return all(chain);
    if (name) return every(name) ? all(name) : name;
    if (single === 'A' && !pre) return m;
    return (pre ?? '') + one(single);
  });
}

/** Deterministic Fisher–Yates (no Math.random anywhere under js/ — tests/no-random.test.mjs greps). */
export function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The template ids a module offers (modules.js is the authority; the registry is the fallback). */
export function templatesOfModule(moduleId) {
  const m = moduleById[moduleId];
  const listed = (m?.templates ?? []).filter((t) => T.has(t));
  return listed.length ? listed : T.templatesForModule(moduleId);
}

/** `count` Variants cycling a template list, seeded from `seed` — deterministic and repeatable. */
export function variantsFrom(templateIds, count, seed, { role = 'new', params = {}, forCard = null } = {}) {
  const out = [];
  if (!templateIds.length) return out;
  for (let i = 0; i < count; i++) {
    const tpl = templateIds[i % templateIds.length];
    out.push(variantItem(tpl, `${seed}|${i}`, role, { params: params[tpl] ?? {}, forCard }));
  }
  return out;
}

/** Originals of a module / skill, uncleared first, then by sheet order. Bonus is never drawn. */
export function originalsFor({ moduleId = null, skill = null, save = null } = {}) {
  const pool = ALL_CARDS.filter((c) => {
    if (isBonus(c.id) || c.module === 'M13') return false;
    if (moduleId && c.module !== moduleId) return false;
    if (skill && !(c.skills || []).includes(skill)) return false;
    return true;
  });
  const rank = (c) => {
    const rec = save?.cards?.[c.id];
    if (!rec || rec.lastAt == null) return 0;          // never seen first
    if (rec.cleared !== true) return 1;                // attempted, not cleared
    return 2;                                          // cleared
  };
  return pool.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

/**
 * buildRun(kind, save, opts) → { kind, id, seed, seedTag, title, subtitle, items, meta, ... }
 * Pure apart from reading the save: every kind's queue is decided here and nowhere else.
 * `page` is the exception — its queue lives in `save.inProgress` (page.js owns it) and is read by the view.
 */
export function buildRun(kind, save, { id = null, seed = null, now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const meta = KIND_META[kind];
  if (!meta) return null;
  const seedStr = runSeed(kind, { id, seed, save, today });
  const rng = mulberry32(cyrb53(seedStr));
  const base = {
    kind, id, seed: seedStr, seedTag: seedTagOf(seedStr),
    title: meta.title, subtitle: '', back: meta.back, mode: meta.mode ?? 'card',
    hints: meta.hints !== false, drill: !!meta.drill, items: [], meta: {},
    limitMs: null, empty: null,
  };

  if (kind === 'drill') {
    const skill = SKILL_IDS.includes(id) ? id : null;
    if (!skill) return { ...base, empty: 'Pick a weak spot on Today to drill — that link carries the skill.' };
    const tpls = T.templatesForSkill(skill);
    const items = tpls.length
      ? variantsFrom(tpls, DRILL_ITEMS, seedStr, { role: 'weak' })
      : originalsFor({ skill, save }).slice(0, DRILL_ITEMS).map((c) => cardItem(c, 'weak'));
    return { ...base, title: `Drill 5 · ${skillById[skill]?.name ?? skill}`, subtitle: 'Unlimited — these pay full XP (no Variant discount).', items, meta: { skill } };
  }

  if (kind === 'jump') {
    const m = moduleById[id];
    if (!m) return { ...base, empty: 'JUMP HERE starts from a module tile in the Binder.' };
    const tpls = templatesOfModule(m.id);
    let items = tpls.length ? variantsFrom(tpls, JUMP.items, seedStr, { role: 'new' }) : [];
    if (items.length < JUMP.items) {
      const need = JUMP.items - items.length;
      items = items.concat(shuffled(originalsFor({ moduleId: m.id, save }), rng).slice(0, need).map((c) => cardItem(c, 'new')));
    }
    if (!items.length) return { ...base, empty: `${m.name} has nothing to jump through yet.` };
    return {
      ...base, title: `JUMP HERE · ${m.name}`,
      subtitle: `${items.length} items — ${JUMP.pass} right marks ${m.name} placed. No hints.`,
      hints: false, items, meta: { module: m.id, pass: JUMP.pass },
    };
  }

  if (kind === 'blitz') {
    const mid = BLITZ.modules.includes(id) ? id : BLITZ.modules[0];
    const m = moduleById[mid];
    const limitMs = num(m?.blitz, 60) * 1000;
    const pool = blitzPool(mid, { rng, save });
    if (!pool.length) return { ...base, empty: `${m?.name ?? mid} has no BLITZ pool.` };
    return {
      ...base, title: `BLITZ · ${m.name}`, subtitle: `${Math.round(limitMs / 1000)} s · wrong = −3 s · 3 strikes`,
      limitMs, items: pool, meta: { module: mid },
    };
  }

  if (kind === 'full36') {
    const items = FULL36_IDS.map((cid) => cardById[cid]).filter(Boolean).map((c) => cardItem(c, 'new'));
    return { ...base, title: 'Full 36', subtitle: 'All 36 Always / Sometimes / Never statements, untimed, reason on every one.', items, meta: {} };
  }

  if (kind === 'missed') {
    const ids = missedOriginals(save);
    if (!ids.length) return { ...base, empty: 'Nothing missed is waiting — every original you have attempted was answered first try.' };
    const items = ids.slice(0, MISSED_PAGE).map((cid) => cardById[cid]).filter(Boolean).map((c) => cardItem(c, 'review'));
    return { ...base, title: 'Missed originals', subtitle: `${ids.length} waiting — ${items.length} this round.`, items, meta: { remaining: ids.length } };
  }

  if (kind === 'upgrade') {
    const sheet = id && sheetById[id] ? id : null;
    const ids = upgradeTargets(save, { sheet });
    if (!ids.length) {
      return { ...base, empty: sheet ? `Every original on ${sheetById[sheet]?.name ?? sheet} is Gold or better.` : 'No Bronze or Silver originals left — the Packet is Gold.' };
    }
    const items = ids.slice(0, UPGRADE_MAX).map((cid) => cardItem(cardById[cid], 'review'));
    return {
      ...base, title: sheet ? `Upgrade · ${sheetById[sheet]?.name ?? sheet}` : 'Upgrade run',
      subtitle: `${ids.length} Bronze/Silver original${ids.length === 1 ? '' : 's'} — hints off, first try only.`,
      hints: false, items, meta: { sheet, targets: ids.length },
    };
  }

  if (kind === 'daily') {
    const items = dailyQueue(save, { seed: seedStr, today });
    const done = !!save?.daily?.[today]?.dailyDone;
    return {
      ...base, title: 'Daily Challenge', subtitle: done ? `Today's set — already banked (+${DAILY_XP} XP).` : `${items.length} items from the whole Packet · +${DAILY_XP} XP for finishing.`,
      items, meta: { today, alreadyDone: done },
    };
  }

  return { ...base };   // page / baseline / night / morning are handled by the view
}

/** Every Bronze/Silver original (S7 "Upgrade run"), weakest first, optionally limited to one sheet. */
export function upgradeTargets(save, { sheet = null } = {}) {
  const out = [];
  for (const c of ALL_CARDS) {
    if (isBonus(c.id) || c.module === 'M13') continue;
    if (sheet && c.sheet !== sheet) continue;
    const r = tileRarity(c.id, save?.cards?.[c.id]);
    if (r === 'bronze' || r === 'silver') out.push({ id: c.id, r });
  }
  out.sort((a, b) => (a.r === b.r ? 0 : a.r === 'bronze' ? -1 : 1));
  return out.map((x) => x.id);
}

/** The Daily Challenge set: deterministic from cyrb53(dateISO), spread across the bank, tier ≤ 3. */
export function dailyQueue(save, { seed, today = todayISO() } = {}) {
  const rng = mulberry32(cyrb53(String(seed ?? today)));
  const pool = ALL_CARDS.filter((c) => !isBonus(c.id) && c.module !== 'M13' && num(c.tier, 1) <= 3);
  const picked = [];
  const seen = new Set();
  const order = shuffled(pool, rng);
  for (const c of order) {
    if (picked.length >= DAILY_ITEMS) break;
    if (seen.has(c.module)) continue;            // one per module first, so the set is never five vocab cards
    seen.add(c.module);
    picked.push(cardItem(c, 'new'));
  }
  for (const c of order) {
    if (picked.length >= DAILY_ITEMS) break;
    if (picked.some((p) => p.id === c.id)) continue;
    picked.push(cardItem(c, 'new'));
  }
  return picked;
}

/* ================================================================== BLITZ */

/**
 * The BLITZ pool for a module (S1: M1 / M3 / M9 only, tier ≤ 2).
 *  • M1 — every M1 card that has an `mc` (preferred) or `term` part; `blitz:false` parts are skipped.
 *  • M9 — every ASN / Quizlet statement, verdict only.
 *  • M3 — generated `T-csarith` chains at depth 1–2 (tier ≤ 2).
 * Each entry: { key, cardId?, template?, seed?, type, tier, skills, stem, part } — `part` is graded as-is.
 */
export function blitzPool(moduleId, { rng = mulberry32(1), save = null, count = 40 } = {}) {
  const out = [];
  if (moduleId === 'M3') {
    for (let i = 0; i < count; i++) {
      const depth = i % 3 === 2 ? 2 : 1;
      let item;
      try { item = T.generate('T-csarith', `blitz|${i}`, { depth }); } catch { continue; }
      const part = (item.parts || []).find((p) => p.type === 'num');
      if (!part) continue;
      out.push({
        key: item.id, template: 'T-csarith', seed: item.seed, cardId: null, type: 'num',
        tier: num(item.tier, 1), skills: item.skills || ['CSARITH'],
        stem: part.prompt || item.prompt || item.stem || '', part, item,
      });
    }
    return out;
  }
  const mod = moduleById[moduleId];
  if (!mod) return out;
  for (const id of mod.originals) {
    const card = cardById[id];
    if (!card || isBonus(id) || num(card.tier, 1) > BLITZ.maxTier) continue;
    const parts = (card.parts || []).filter((p) => p && p.blitz !== false);
    const part = moduleId === 'M9'
      ? parts.find((p) => p.type === 'asn')
      : (parts.find((p) => p.type === 'mc') || parts.find((p) => p.type === 'term'));
    if (!part) continue;
    out.push({
      key: card.id, cardId: card.id, template: null, seed: null, type: part.type,
      tier: num(card.tier, 1), skills: (card.skills || []).slice(),
      stem: part.prompt || part.statement || card.stem || card.prompt || '', part, card,
    });
  }
  return shuffled(out, rng);
}

/**
 * The BLITZ round, as a pure state machine (no DOM, no timers) — `tests/run.test.mjs` drives it directly.
 * Wall-clock throughout (S6 "Timers"): `remaining` is always `startedAt + limitMs − penalties − now`.
 */
export function createBlitzRound({
  limitMs = BLITZ.defaultLimitMs, penaltyMs = BLITZ.penaltyMs, lockoutMs = BLITZ.lockoutMs,
  maxStrikes = BLITZ.strikes, startedAt = Date.now(),
} = {}) {
  const st = {
    startedAt, limitMs, penaltyMs, lockoutMs, maxStrikes,
    penalties: 0, score: 0, wrong: 0, answered: 0, streak: 0, bestStreak: 0, strikes: 0,
    lockedUntil: 0, ended: false, reason: null, endedAt: null, answers: [],
  };
  const remaining = (now = Date.now()) => Math.max(0, st.startedAt + st.limitMs - st.penalties - now);
  const locked = (now = Date.now()) => !st.ended && now < st.lockedUntil;
  const end = (reason, now) => { if (!st.ended) { st.ended = true; st.reason = reason; st.endedAt = now; st.lockedUntil = 0; } return snapshot(now); };
  const snapshot = (now = Date.now()) => ({
    ended: st.ended, reason: st.reason, score: st.score, wrong: st.wrong, answered: st.answered,
    streak: st.streak, bestStreak: st.bestStreak, strikes: st.strikes, remaining: remaining(now),
    locked: locked(now), lockedUntil: st.lockedUntil, penalties: st.penalties,
  });

  return {
    state: st,
    remaining, locked, snapshot,
    /** Advance the clock: ends the round at 0:00. Returns a snapshot. */
    tick(now = Date.now()) {
      if (!st.ended && remaining(now) <= 0) return end('time', now);
      return snapshot(now);
    },
    /**
     * Record one answer. A wrong answer costs 3 s and locks input for 1.2 s; three wrongs IN A ROW end
     * the round, so spamming is never positive-EV (S1). Answers during the lockout are ignored.
     */
    answer(ok, { now = Date.now(), key = null } = {}) {
      if (st.ended) return snapshot(now);
      if (remaining(now) <= 0) return end('time', now);
      if (locked(now)) return snapshot(now);
      st.answered++;
      st.answers.push({ key, ok: !!ok, at: now });
      if (ok) {
        st.score++; st.streak++; st.strikes = 0;
        st.bestStreak = Math.max(st.bestStreak, st.streak);
      } else {
        st.wrong++; st.streak = 0; st.strikes++;
        st.penalties += st.penaltyMs;
        st.lockedUntil = now + st.lockoutMs;
        if (st.strikes >= st.maxStrikes) return end('strikes', now);
        if (remaining(now) <= 0) return end('time', now);
      }
      return snapshot(now);
    },
    /** Quit / navigate away. */
    stop(now = Date.now()) { return end('quit', now); },
  };
}

/**
 * Write a BLITZ answer into the save. Score-only (S1) — no XP, no combo — but a correct answer IS a clear:
 * S4 Readiness `C` and S7's plan `R` both say "a Full 36 or BLITZ clear counts", and Foil class (c) counts
 * a BLITZ clear of a card that was due. Call inside `update()`.
 */
export function recordBlitzAnswer(save, entry, { ok, ms = 0, now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const id = entry?.cardId;
  const skills = entry?.skills ?? [];
  const s = ok ? scoreFor({ firstTry: true, hints: 0, attempt: 1 }) : scoreFor({ firstTry: false, attempt: 3, hints: 0 });
  decayAll(save.skills, now);
  applyMastery(save.skills, skills, s, { at: now, dueReview: false });
  if (!id) return null;                                   // a generated M3 chain has no tile to mint
  const rec = cardRecordOf(save, id);
  const wasDue = rec.due != null && rec.due <= now;
  rec.attempts = num(rec.attempts, 0) + 1;
  rec.lastAt = now;
  rec.history.push({ at: now, ok: !!ok, attempt: 1, hints: 0, ms });
  if (ok) {
    rec.cleared = true;
    rec.rarity = bestRarity(rec.rarity, rarityOf({ id, firstTry: true, hints: 0, attempt: 1, setupTried: true }));
    rec.lastFirstTry = rec.lastFirstTry === false ? false : true;
    if (wasDue) rec.foilProgress.push({ day: today, via: 'review' });
    applySchedule(save, id, outcomeOf({ ok: true, firstTry: true, attempt: 1, hints: 0 }), { now });
    if (!isObj(save.counters)) save.counters = {};
    save.counters.clears = num(save.counters.clears, 0) + 1;
  } else {
    rec.lastFirstTry = false;
    applySchedule(save, id, 'wrong', { now });
  }
  return rec;
}

/** The S6 default record for `cards[id]` (the same shape card.js creates). */
export function cardRecordOf(save, id) {
  if (!isObj(save.cards)) save.cards = {};
  const cur = save.cards[id];
  if (isObj(cur)) {
    if (!Array.isArray(cur.history)) cur.history = [];
    if (!Array.isArray(cur.foilProgress)) cur.foilProgress = [];
    return cur;
  }
  return (save.cards[id] = {
    attempts: 0, cleared: false, rarity: null, foil: false, foilProgress: [], setupTried: false,
    bucket: 0, lastAt: null, due: null, hintsUsed: 0, solutionShown: false, bestMs: null,
    placed: false, work: '', history: [],
  });
}

/* ================================================================== JUMP */

/** ≥ 8 of 10 (S1). */
export function jumpPassed(correct, total = JUMP.items) {
  return num(correct, 0) >= Math.min(JUMP.pass, num(total, JUMP.items));
}

/**
 * Mark a module *placed* (S1 JUMP HERE / S7 placement): `m = 80` with `n = 5` on every skill of the module
 * so `m_shown = 80` at once, `placedAt` set, `jumps[M] = true` (the Binder's placed outline reads it).
 * Readiness `C` is deliberately untouched — it counts Cards actually cleared. Call inside `update()`.
 */
export function applyJump(save, moduleId, { correct = 0, total = JUMP.items, at = Date.now() } = {}) {
  const m = moduleById[moduleId];
  const passed = jumpPassed(correct, total);
  const skills = (m?.skills ?? []).filter((id) => SKILL_IDS.includes(id));
  if (!m || !passed) return { passed: false, moduleId, skills: [] };
  if (!isObj(save.skills)) save.skills = {};
  if (!isObj(save.jumps)) save.jumps = {};
  for (const id of skills) save.skills[id] = placeSkill(save.skills[id], JUMP.m, at);
  save.jumps[moduleId] = true;
  return { passed: true, moduleId, skills };
}

/* ================================================================== summary */

export const xpOfResult = (r) => num(r?.xp, num(r?.xpInfo?.xp, 0));

/**
 * The Page Summary's numbers (S1: "XP, flawless count, rarity histogram, tiles minted, skill bars
 * animating old→new, Readiness delta"). Pure: `results` are the objects card.js hands to `onDone`,
 * so `xp` is by construction the sum of `xp.js`'s own `xpFor()` values.
 */
export function summarizeRun(results = []) {
  const list = results.filter(isObj);
  const rarities = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  let xp = 0, cleared = 0, clean = 0, firstTry = 0, missed = 0, ms = 0;
  for (const r of list) {
    xp += xpOfResult(r);
    ms += num(r.elapsedMs, 0);
    if (r.cleared) {
      cleared++;
      if (r.firstTry) firstTry++;
      if (r.clean ?? isClean({ firstTry: r.firstTry, hints: r.hints })) clean++;
      if (r.rarity && r.rarity in rarities) rarities[r.rarity]++;
    } else {
      missed++;
      if (r.rarity && r.rarity in rarities) rarities[r.rarity]++;
    }
  }
  return {
    count: list.length, cleared, missed, clean, firstTry, xp, ms,
    rarities, accuracy: list.length ? cleared / list.length : 0,
  };
}

/** Which Binder tiles a queue can move: the originals it holds, plus each Variant's card and family tile. */
export function tileIdsOf(items = []) {
  const ids = new Set();
  for (const it of items) {
    if (!isObj(it)) continue;
    if (it.kind === 'card' && it.id) ids.add(it.id);
    if (it.forCard) ids.add(it.forCard);
    if (it.template) {
      const fam = familyOf({ template: it.template, params: it.params, meta: it.meta }, T);
      if (fam) ids.add(fam);
    }
  }
  return [...ids];
}

/** id → tile rarity now (originals through `tileRarity`, family tiles through `familyRarity`). */
export function tileSnapshot(save, ids = []) {
  const out = {};
  for (const id of ids) {
    out[id] = familyById[id] ? familyRarity(save?.variants?.[id]) : tileRarity(id, save?.cards?.[id]);
  }
  return out;
}

/** Tiles whose rarity improved during the run — the Summary's "minted" row (flip + foil sheen). */
export function mintedTiles(before = {}, after = {}) {
  const out = [];
  for (const id of Object.keys(after)) {
    const from = before[id] ?? null, to = after[id] ?? null;
    if (to && to !== from) out.push({ id, from, to, fam: !!familyById[id] });
  }
  return out;
}

/** Old→new `m_shown` for every skill the run touched (the animating bars). */
export function skillDeltas(before = [], after = [], ids = null) {
  const b = new Map(before.map((s) => [s.id, s]));
  const want = ids && ids.length ? new Set(ids) : null;
  return after
    .filter((s) => (want ? want.has(s.id) : true))
    .map((s) => ({ id: s.id, name: s.name, from: num(b.get(s.id)?.mShown, 0), to: num(s.mShown, 0), untested: s.untested }))
    .filter((s) => s.to !== s.from || (want && !s.untested))
    .sort((a, b2) => (b2.to - b2.from) - (a.to - a.from));
}

/** The S6 run record, with the fields `js/trophies.js` and `#/stats` read (notes/T11.md "run record fields"). */
export function makeRunRecord({
  kind, id = null, seed = null, seedTag = null, startedAt, submittedAt = Date.now(),
  results = [], items = null, extra = {},
} = {}) {
  const sum = summarizeRun(results);
  return {
    kind: id ? `${kind}:${id}` : kind, status: 'done', seed, seedTag,
    startedAt, submittedAt, limitMs: null, tabAway: 0,
    xp: sum.xp, acc: sum.accuracy, flawless: sum.clean,
    items: items ?? results.map((r) => ({
      id: r?.id ?? null, skill: r?.skill ?? null, tier: num(r?.tier, null),
      credit: r?.cleared ? 1 : 0, clean: !!(r?.clean ?? (r?.firstTry && !num(r?.hints, 0))),
      ms: num(r?.elapsedMs, 0), flagged: false,
    })),
    ...extra,
  };
}

/** Push a run record (store.applyCaps keeps the newest 40) and stamp its index. Call inside `update()`. */
export function pushRun(save, rec) {
  if (!Array.isArray(save.runs)) save.runs = [];
  const r = { n: save.runs.length + 1, ...rec };
  save.runs.push(r);
  return r;
}

/* ================================================================== the screen */

/** `screens['/run/:kind/:id?']` — (params, query) => (el) => cleanup */
export function mountRun(params, query) {
  const kind = String(params?.kind ?? '').toLowerCase();
  const id = params?.id ? String(params.id) : null;
  const seed = query?.get?.('seed') ?? null;
  return (el) => {
    if (DELEGATES[kind]) return delegateRun(el, kind, { id, seed, query });
    if (!isRunKind(kind)) return renderUnknown(el, kind);
    if (kind === 'blitz') return mountBlitz(el, { id, seed });
    return mountCardRun(el, { kind, id, seed });
  };
}

function renderUnknown(el, kind) {
  el.append(h('section.screen.run-screen',
    h('h1.fs-4', 'No such run'),
    h('p.muted', `"${kind || '—'}" is not a run kind. The kinds are: ${RUN_KINDS.join(', ')}.`),
    h('p', h('a.btn.btn-primary', { href: '#/today' }, 'Back to Today')),
  ));
}

/** Hand a delegated kind to the screen that owns it; fall back to run.js's own runner or an honest stub. */
function delegateRun(el, kind, { id, seed, query }) {
  const meta = KIND_META[kind] ?? { title: 'After the test', back: '/today' };
  const d = DELEGATES[kind];
  let live = true, cleanup = null;
  el.append(h('section.screen.run-screen.run-stub', { dataset: { kind } }, h('p.muted', `Opening ${meta.title}…`)));
  const fallback = () => {
    if (!live) return;
    el.replaceChildren();
    cleanup = d.fallback === 'self'
      ? (kind === 'blitz' ? mountBlitz(el, { id, seed }) : mountCardRun(el, { kind, id, seed }))
      : renderStub(el, kind);
  };
  import(d.mod)
    .then((m) => {
      if (!live) return;
      const fn = d.fns.map((k) => m[k]).find((f) => typeof f === 'function');
      if (!fn) throw new Error(`${d.mod} exports none of ${d.fns.join(' / ')}`);
      el.replaceChildren();
      const r = fn({ kind, id }, query, { mode: kind });
      cleanup = typeof r === 'function' ? r(el) : r;
    })
    .catch((e) => { console.warn(`run: ${kind} delegate unavailable`, e); fallback(); });
  return () => { live = false; if (typeof cleanup === 'function') { try { cleanup(); } catch { /* gone */ } } };
}

function renderStub(el, kind) {
  const meta = KIND_META[kind] ?? { title: 'After the test' };
  const owner = DELEGATES[kind]?.mod === './mock.js' ? 'T13 (js/screens/mock.js)' : 'T14 (js/screens/night.js)';
  const what = kind === 'post'
    ? 'The countdown is gone. Enter the real score when you have it; the Binder, the Bosses and the Mock stay open.'
    : kind === 'baseline'
    ? 'A 10-item mini-mock under Mock rules (~12 min) that gives Readiness a real accuracy term on day 1.'
    : kind === 'night'
      ? 'Notation flash · Final Sweep · an 8-item mini-mock · the cheat sheet you cannot bring.'
      : 'Six notation, two ASN and one factoring from cards you already own — then Readiness and "Go".';
  el.replaceChildren(h('section.screen.run-screen.run-stub', { dataset: { kind } },
    h('header.run-head', h('a.btn.run-quit', { href: '#/today' }, '← Today'), h('h1.run-title.fs-4', meta.title)),
    h('div.card.run-empty',
      h('p', what),
      h('p.muted.fs-1', `This run mounts here (#/run/${kind}) and lands with ${owner}. Everything it will use — the card engine, the queue, the Summary — is already live on the other run kinds.`),
      h('p.run-actions',
        h('a.btn.btn-primary', { href: '#/run/page' }, 'Run a Page instead'),
        h('a.btn', { href: '#/binder' }, 'Binder'),
      )),
  ));
}

/* ------------------------------------------------------------------ shared chrome */

function runHead({ title, subtitle, back, right = null, quitLabel = 'Quit' }) {
  const head = h('header.run-head');
  head.append(
    h('a.btn.run-quit', { href: '#' + back, 'aria-label': `${quitLabel} — progress is kept` }, '← ', quitLabel),
    h('div.run-titles', h('h1.run-title.fs-4', title), subtitle ? h('p.run-sub.muted.fs-1', subtitle) : null),
  );
  if (right) head.append(right);
  return head;
}

function progressBar(done, total, { retries = 0 } = {}) {
  const wrap = h('div.run-progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': retries ? `Run progress, ${retries} ${retries === 1 ? 'retry' : 'retries'}` : 'Run progress' },
    h('div.run-progress-track', h('div.run-progress-fill', { style: { transform: `scaleX(${total ? done / total : 0})` } })),
    h('span.run-progress-n.mono.fs-1', `${done} of ${total} done`, retries ? h('span.run-progress-retry', ` · +${retries} ${retries === 1 ? 'retry' : 'retries'}`) : null),
  );
  return wrap;
}

function emptyState(el, run) {
  el.replaceChildren(h('section.screen.run-screen', { dataset: { kind: run.kind } },
    runHead({ title: run.title, subtitle: '', back: run.back, quitLabel: 'Back' }),
    h('div.card.run-empty',
      h('p', run.empty),
      h('p.run-actions', h('a.btn.btn-primary', { href: '#/today' }, 'Today'), h('a.btn', { href: '#/binder' }, 'Binder')),
    ),
  ));
}

/* ------------------------------------------------------------------ the card-driven kinds */

function mountCardRun(host, { kind, id, seed }) {
  const meta = KIND_META[kind];
  let destroyed = false, view = null;
  const startedAt = Date.now();
  const results = [];
  let before = null, tilesBefore = null, tileIds = [];

  const root = h('section.screen.run-screen', { dataset: { kind } });
  const headSlot = h('div.run-head-slot');
  const stage = h('div.run-stage');
  root.append(headSlot, stage);
  host.append(root);

  let run = null, queue = [], idx = 0, ip = null;

  /* ---- the queue ---- */
  if (kind === 'page') {
    // W4: compose with the PLAN's tier-4 cap (notes/T14.md Requests). `q` is deliberately dropped —
    // page.js derives the identical target itself, and an explicit q switches off its session budget.
    const save = update((s) => { const { q, ...planOpts } = composeOpts(s); startPage(s, { ...planOpts, now: startedAt }); });
    ip = resumePage(save);
    if (!ip) { emptyState(host, { kind, title: "Today's Page", back: '/today', empty: 'There is nothing to run right now — the Binder is the place to pick your own work.' }); return () => {}; }
    run = {
      kind, id: null, seed: ip.seed, seedTag: ip.seedTag, title: "Today's Page",
      subtitle: pageLabel({ meta: ip.meta }).replace(/^RUN NEXT · /, ''), back: '/today',
      mode: 'card', hints: true, drill: false, items: ip.queue, meta: ip.meta ?? {},
    };
    queue = ip.queue; idx = ip.idx;
  } else {
    run = buildRun(kind, getState(), { id, seed, now: startedAt });
    if (!run || run.empty) { emptyState(host, run ?? { kind, title: meta.title, back: meta.back, empty: 'Nothing to run.' }); return () => {}; }
    queue = run.items; idx = 0;
    queue.forEach((it, i) => { it.n = i + 1; });
  }

  /* ---- before-snapshot for the Summary ---- */
  let resumed = false;
  {
    const save = getState();
    tileIds = tileIdsOf(queue);
    const stored = kind === 'page' ? pageBefore(ip) : null;
    if (stored) {
      // r1: a Page quit ("progress is kept") and reopened ends on the Summary of the WHOLE page, not of
      // the items since the reload — the before-snapshot was written on the first mount (S9 #10 honest).
      resumed = true;
      before = stored; tilesBefore = stored.tiles;
    } else {
      tilesBefore = tileSnapshot(save, tileIds);
      const rd = readiness(save);
      before = { skills: skillStates(save), readiness: { r: rd.r, provisional: !!rd.provisional }, xp: save.xp, coverage: coverageCount(save) };
      if (kind === 'page') {
        const snap = { ...before, tiles: tilesBefore };
        update((s) => { const p = resumePage(s); if (p) p.meta = { ...(isObj(p.meta) ? p.meta : {}), before: snap }; });
        ip = resumePage(getState()); queue = ip ? ip.queue : queue; run.items = queue; run.meta = ip?.meta ?? run.meta;
      }
    }
    if (kind === 'page') results.push(...pageResults(queue));   // the items answered before a reload
    setHeader({ readiness: before.readiness.r, provisional: before.readiness.provisional });
  }

  renderHead();
  renderItem();

  function renderHead() {
    // r1: a re-queued review is shown as a retry, not as a longer page ("3 of 17 done · +1 retry").
    const retries = kind === 'page' ? queue.filter((it) => it.requeued).length : 0;
    const done = kind === 'page' ? queue.filter((it) => it.done && !it.requeued).length : results.length;
    headSlot.replaceChildren(runHead({
      title: run.title, subtitle: run.subtitle, back: run.back,
      right: progressBar(done, queue.length - retries, { retries }),
      quitLabel: kind === 'page' ? 'Quit' : 'Back',
    }));
  }

  function itemAt(i) { return queue[i] ?? null; }

  function renderItem() {
    if (destroyed) return;
    if (idx >= queue.length) return finish();
    const it = itemAt(idx);
    if (!it) return finish();
    if (it.done) { idx++; return renderItem(); }
    renderHead();
    destroyView();
    stage.replaceChildren();
    let source;
    try {
      source = sourceFor(it);
    } catch (e) {
      console.error('run: cannot build item', it, e);      // a broken template must not strand the run
      it.done = true;
      return advance({ id: it.id, cleared: false, skipped: true });
    }
    view = createCardView(stage, source, {
      kind: it.kind === 'variant' ? 'variant' : 'card',
      review: it.isReview ? true : null,
      rematch: !!it.isRematch,
      drill: !!run.drill,
      forCard: it.forCard ?? null,
      back: run.back,
      mode: run.mode,
      hints: run.hints !== false,
      // r1: the rename is applied to the whole card in sourceFor() (figure + stem + list + grader agree);
      // handing card.js the map as well would only re-merge the same letters into the SVG.
      rename: null,
      onDone: (r) => record(it, r),
      onContinue: () => advance(),
    });
    // Each item starts at the top of the run: without this the next card mounts at the scroll position
    // the last card's result strip left behind, and the run head sits under the sticky app header.
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  function sourceFor(it) {
    if (it.kind === 'variant') {
      const raw = T.generate(it.template, it.seed, it.params ?? {});
      return { item: raw };
    }
    // r1 (S4): a review with `rename` is ONE renamed card, not a renamed SVG under the printed stem.
    const card = cardById[it.id];
    if (isObj(it.rename) && card) return { id: it.id, item: renameCard(card, it.rename) };
    return { id: it.id };
  }

  function record(it, result) {
    const r = { ...result, n: it.n, role: it.role, skill: it.skill ?? (it.skills || [])[0] ?? null, tier: it.tier };
    results.push(r);
    if (kind === 'page') {
      update((s) => {
        // A missed REVIEW item goes to the end of the review block (S1 step 4) before the pointer moves.
        if (!result?.cleared && (it.isReview || it.isRematch)) requeueReview(s, { idx, result: r });   // r1: once, never after a voluntary reveal
        markItem(s, r, { idx });
      });
      ip = resumePage(getState());
      queue = ip ? ip.queue : queue;
      run.items = queue;
    } else if (it.done !== true) {
      it.done = true; it.result = r;
    }
    renderHead();
  }

  function advance(skipResult = null) {
    if (destroyed) return;
    if (skipResult) results.push(skipResult);
    if (kind === 'page') { ip = resumePage(getState()); idx = ip ? ip.idx : queue.length; }
    else idx++;
    queueMicrotask(() => { if (!destroyed) renderItem(); });
  }

  function destroyView() {
    if (view) { try { view.destroy(); } catch (e) { console.error(e); } view = null; }
  }

  /* ---- the end ---- */
  function finish() {
    destroyView();
    const submittedAt = Date.now();
    const sum = summarizeRun(results);
    const outcome = { jump: null, dailyXp: 0 };

    const save = update((s) => {
      if (kind === 'page') finishPage(s);
      if (kind === 'jump') {
        const correct = results.filter((r) => r.cleared && r.firstTry).length;
        outcome.jump = applyJump(s, run.meta.module, { correct, total: queue.length, at: submittedAt });
        outcome.jump.correct = correct;
      }
      if (kind === 'daily') {
        const d = dailyRecord(s, todayISO(new Date(submittedAt)));
        if (!d.dailyDone && sum.count) { d.dailyDone = true; s.xp += DAILY_XP; d.xp = num(d.xp, 0) + DAILY_XP; outcome.dailyXp = DAILY_XP; }
      }
      // W4 integration (notes/T13.md open issue 1): S4's second daily-goal route is "a Mock completed AND
      // its misses drilled". The report used to set the flag when the button was TAPPED; a finished drill
      // is the honest moment. Only after a Mock today — a drill on its own is not that goal.
      if (kind === 'drill' && sum.count) {
        const d = dailyRecord(s, todayISO(new Date(submittedAt)));
        if (d.mockDone) d.missesDrilled = true;
      }
      pushRun(s, makeRunRecord({
        kind, id: runRecordId(kind, run), seed: run.seed, seedTag: run.seedTag,
        startedAt, submittedAt, results,
        extra: kind === 'jump' ? { placed: !!outcome.jump?.passed, score: results.filter((r) => r.cleared && r.firstTry).length, scoreMax: queue.length } : {},
      }));
      checkDailyGoal(s, todayISO(new Date(submittedAt)));
      logForecast(s, { today: todayISO(new Date(submittedAt)) });
    });
    try { flush(); } catch { /* memory store */ }

    const after = { skills: skillStates(save), readiness: readiness(save), xp: save.xp, coverage: coverageCount(save) };
    setHeader({ readiness: after.readiness.r, provisional: after.readiness.provisional });
    renderSummary(host, {
      kind, run, results, sum, before, after,
      tilesBefore, tilesAfter: tileSnapshot(save, tileIds), outcome, save,
      elapsedMs: resumed ? sum.ms : submittedAt - startedAt,   // r1: a resumed Page's clock is its items', not the days between
    });
  }

  const onHide = () => { if (document.visibilityState === 'hidden') { try { flush(); } catch { /* gone */ } } };
  document.addEventListener('visibilitychange', onHide);

  return () => {
    destroyed = true;
    destroyView();
    document.removeEventListener('visibilitychange', onHide);
    try { flush(); } catch { /* gone */ }
  };
}

/**
 * r1: the results a Page's queue already holds (page.js markItem stores `it.result` per item), in queue
 * order — what a remount seeds `results` with so the Summary covers the whole page after a quit/reload.
 */
export function pageResults(queue) {
  return (Array.isArray(queue) ? queue : []).filter((it) => it && it.done && isObj(it.result)).map((it) => ({
    ...it.result, n: it.n, role: it.role, skill: it.result.skill ?? it.skill ?? (it.skills || [])[0] ?? null, tier: it.result.tier ?? it.tier,
  }));
}

/** r1: the before-snapshot the first mount of this Page wrote into `inProgress.meta.before`, or null. */
export function pageBefore(ip) {
  const b = ip?.meta?.before;
  return isObj(b) && Array.isArray(b.skills) && isObj(b.readiness) && isObj(b.tiles) ? b : null;
}

/** `runs[].kind` is `kind` or `kind:id` (notes/T11.md: `boss:B4`, `upgrade:AP-1`). */
function runRecordId(kind, run) {
  if (kind === 'jump' || kind === 'blitz') return run.meta?.module ?? null;
  if (kind === 'drill') return run.meta?.skill ?? null;
  if (kind === 'upgrade') return run.meta?.sheet ?? null;
  return null;
}

/* ------------------------------------------------------------------ BLITZ view */

function mountBlitz(host, { id, seed }) {
  const run = buildRun('blitz', getState(), { id, seed });
  if (!run || run.empty) { emptyState(host, run ?? { kind: 'blitz', title: 'BLITZ', back: '/binder', empty: 'No BLITZ pool.' }); return () => {}; }

  let destroyed = false, tickId = 0, advanceId = 0, lockId = 0, i = 0, itemStart = Date.now();
  let inputLocked = false;      // declared up here: renderItem() → setLocked() runs before the body below
  const startedAt = Date.now();
  const results = [];
  const round = createBlitzRound({ limitMs: run.limitMs, startedAt });
  let graders = null;
  const tileIds = run.items.map((e) => e.cardId).filter(Boolean);
  const save0 = getState();
  const tilesBefore = tileSnapshot(save0, tileIds);
  const before = { skills: skillStates(save0), readiness: readiness(save0), xp: save0.xp, coverage: coverageCount(save0) };
  setHeader({ readiness: before.readiness.r, provisional: before.readiness.provisional });

  const root = h('section.screen.run-screen.blitz', { dataset: { kind: 'blitz' } });
  const clock = h('span.blitz-clock.mono', '—');
  const scoreEl = h('span.blitz-score.mono', '0');
  const strikeEl = h('span.blitz-strikes', { role: 'img', 'aria-label': '0 of 3 strikes' });
  const meter = h('div.blitz-meter', h('div.blitz-meter-fill'));
  const stem = h('div.blitz-stem');
  const answers = h('div.blitz-answers');
  const flash = h('p.blitz-flash', { role: 'status', 'aria-live': 'assertive' });
  const hint = h('p.blitz-hint.muted.fs-1');
  // r1: stem → flash → answers inside the card, so the "−3 s · …" line lands just above the thumb.
  const stage = h('div.blitz-stage', h('div.card.blitz-card', stem, flash, answers), hint);
  root.append(
    runHead({
      title: run.title, subtitle: run.subtitle, back: run.back, quitLabel: 'Quit',
      right: h('div.blitz-hud', h('span.blitz-hud-time', clock), h('span.blitz-hud-score', scoreEl, h('span.muted.fs-1', ' pts')), strikeEl),
    }),
    meter, stage,
  );
  host.append(root);

  import('../grader/index.js').then(async (m) => { await m.ready; if (!destroyed) { graders = m; } }).catch((e) => console.error('blitz graders', e));

  drawStrikes();
  renderItem();
  tickId = setInterval(() => {
    if (destroyed) return;
    const s = round.tick();
    drawClock(s);
    if (s.ended) endRound();
  }, 100);
  drawClock(round.snapshot());

  function drawClock(s) {
    const left = Math.max(0, s.remaining);
    clock.textContent = fmtClock(left);
    clock.dataset.low = String(left <= 10_000);
    meter.firstChild.style.transform = `scaleX(${run.limitMs ? clamp(left / run.limitMs, 0, 1) : 0})`;
    scoreEl.textContent = String(s.score);
  }

  function drawStrikes() {
    const st = round.state;
    strikeEl.replaceChildren(...[0, 1, 2].map((k) => h('span.blitz-strike' + (k < st.strikes ? '.is-out' : ''))));
    strikeEl.setAttribute('aria-label', `${st.strikes} of ${BLITZ.strikes} strikes`);
  }

  function entry() { return run.items[i % run.items.length]; }

  function renderItem() {
    if (destroyed || round.state.ended) return;
    const e = entry();
    itemStart = Date.now();
    flash.textContent = '';
    flash.dataset.tone = '';
    stem.innerHTML = mathfmt(String(e.stem ?? ''));
    answers.replaceChildren();
    answers.dataset.type = e.type;
    if (e.type === 'mc') {
      graderOptions(e).forEach((opt, k) => {
        answers.append(h('button.btn.blitz-opt', { type: 'button', onclick: () => submit(e, opt.text) },
          h('span.blitz-key.mono', String(k + 1)), h('span.blitz-opt-text', { html: mathfmt(opt.text) })));
      });
    } else if (e.type === 'asn') {
      [['A', 'Always'], ['S', 'Sometimes'], ['N', 'Never']].forEach(([letter, word]) => {
        answers.append(h('button.btn.blitz-asn', { type: 'button', onclick: () => submit(e, letter) },
          h('span.blitz-key.mono', letter), h('span.blitz-word', word)));
      });
    } else {
      const input = h('input.blitz-input', {
        type: 'text', inputmode: e.type === 'num' ? 'decimal' : 'text', autocomplete: 'off',
        autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Answer',
        onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(e, input.value); } },
      });
      answers.append(input, h('button.btn.btn-primary.blitz-go', { type: 'button', onclick: () => submit(e, input.value) }, 'Go'));
      setTimeout(() => { if (!destroyed && !round.state.ended) input.focus(); }, 0);
    }
    hint.textContent = e.type === 'asn' ? 'Tap, or press A / S / N.'
      : e.type === 'mc' ? 'Tap, or press the number.'
        : 'Type it and press Enter.';
    setLocked(round.locked());
  }

  function graderOptions(e) {
    return mcOptions(e.part, `${e.key}|blitz`);
  }

  function setLocked(on) {
    inputLocked = !!on;
    answers.dataset.locked = String(inputLocked);
    for (const el of answers.querySelectorAll('button, input')) el.disabled = inputLocked;
  }

  function submit(e, raw) {
    // `inputLocked` covers the 250 ms auto-advance window as well as the 1.2 s wrong-answer lockout:
    // without it a keystroke in that window would grade the same item twice.
    if (destroyed || round.state.ended || round.locked() || inputLocked) return;
    if (!graders) { flash.textContent = 'one moment…'; return; }
    const ms = Date.now() - itemStart;
    const res = graders.grade(e.part, raw, {
      mode: 'blitz', blitz: true, seed: `${e.key}|blitz`, card: e.card ?? e.item ?? null,
      misconceptions: (e.card ?? e.item)?.misconceptions ?? [], settings: getState().settings,
    });
    if (res.kind === 'malformed') { flash.textContent = res.msg || 'Type an answer.'; flash.dataset.tone = 'warn'; return; }
    const ok = res.kind === 'correct' && res.ok !== false;
    const snap = round.answer(ok, { key: e.key });
    results.push({ id: e.cardId ?? e.key, skill: (e.skills || [])[0] ?? null, tier: e.tier, cleared: ok, firstTry: true, hints: 0, clean: ok, rarity: null, xp: 0, elapsedMs: ms });
    update((s) => { recordBlitzAnswer(s, e, { ok, ms }); });
    bus.emit('sfx', ok ? 'correct' : 'wrong');
    drawClock(snap);
    drawStrikes();
    if (snap.ended) { flash.textContent = snap.reason === 'strikes' ? 'Three in a row — round over.' : "Time."; flash.dataset.tone = 'bad'; setLocked(true); return endRound(); }
    if (ok) {
      flash.textContent = '✓';
      flash.dataset.tone = 'ok';
      setLocked(true);
      advanceId = setTimeout(() => { i++; renderItem(); }, BLITZ.advanceMs);   // the one auto-advance (Global rule 4)
    } else {
      flash.textContent = `−3 s · ${res.msg || 'Not that one.'}`;
      flash.dataset.tone = 'bad';
      setLocked(true);
      lockId = setTimeout(() => { if (!destroyed && !round.state.ended) { i++; renderItem(); } }, BLITZ.lockoutMs);
    }
  }

  let ended = false;
  function endRound() {
    if (ended || destroyed) return;
    ended = true;
    clearInterval(tickId); clearTimeout(advanceId); clearTimeout(lockId);
    const submittedAt = Date.now();
    const st = round.state;
    const save = update((s) => {
      pushRun(s, makeRunRecord({
        kind: 'blitz', id: run.meta.module, seed: run.seed, seedTag: run.seedTag, startedAt, submittedAt, results,
        extra: { score: st.score, scoreMax: st.answered, limitMs: run.limitMs, bestStreak: st.bestStreak, reason: st.reason },
      }));
      checkDailyGoal(s, todayISO(new Date(submittedAt)));
      logForecast(s, { today: todayISO(new Date(submittedAt)) });
    });
    try { flush(); } catch { /* memory store */ }
    const after = { skills: skillStates(save), readiness: readiness(save), xp: save.xp, coverage: coverageCount(save) };
    setHeader({ readiness: after.readiness.r, provisional: after.readiness.provisional });
    renderSummary(host, {
      kind: 'blitz', run, results, sum: summarizeRun(results), before, after,
      tilesBefore, tilesAfter: tileSnapshot(save, tileIds), outcome: { blitz: { ...st } }, save,
      elapsedMs: submittedAt - startedAt,
    });
  }

  // The badges on every option ("1", "A") are a promise: bind the keys so they are true on a keyboard.
  const onKey = (ev) => {
    if (destroyed || round.state.ended || round.locked() || inputLocked) return;
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || !root.isConnected) return;
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target?.isContentEditable) return;
    const e = entry();
    const k = String(ev.key).toLowerCase();
    if (e.type === 'asn') {
      const letter = { a: 'A', s: 'S', n: 'N', 1: 'A', 2: 'S', 3: 'N' }[k];
      if (letter) { ev.preventDefault(); submit(e, letter); }
      return;
    }
    if (e.type === 'mc') {
      const i2 = '123456789'.indexOf(k);
      const opts = graderOptions(e);
      if (i2 >= 0 && i2 < opts.length) { ev.preventDefault(); submit(e, opts[i2].text); }
    }
  };
  document.addEventListener('keydown', onKey);

  return () => {
    destroyed = true;
    document.removeEventListener('keydown', onKey);
    clearInterval(tickId); clearTimeout(advanceId); clearTimeout(lockId);
    round.stop();
    try { flush(); } catch { /* gone */ }
  };
}

/* ------------------------------------------------------------------ the Summary */

const RARITY_ORDER = ['platinum', 'gold', 'silver', 'bronze'];

function renderSummary(host, ctx) {
  const { kind, run, results, sum, before, after, tilesBefore, tilesAfter, outcome, save, elapsedMs } = ctx;
  const minted = mintedTiles(tilesBefore, tilesAfter);
  const touched = [...new Set(results.flatMap((r) => (r.skill ? [r.skill] : [])))];
  const bars = skillDeltas(before.skills, after.skills, touched).slice(0, 6);
  const rDelta = after.readiness.r - before.readiness.r;
  const sinceYesterday = readinessDelta(save, { r: after.readiness.r });
  const next = nextAction(save);
  const isPage = kind === 'page';

  const root = h('section.screen.run-screen.run-summary', { dataset: { kind } });
  const head = h('header.sum-head',
    h('p.sum-eyebrow.muted.fs-1', `${run.title}${run.seedTag ? ' · ' : ''}`, run.seedTag ? h('span.mono', run.seedTag) : null),
    h('h1.fs-5', summaryTitle(kind, ctx)),
  );

  /* The headline: XP everywhere — except BLITZ, which is score-only (S1), so its hero IS the score. */
  const isBlitz = kind === 'blitz';
  const b = outcome.blitz ?? null;
  const roundS = Math.round((run.limitMs ?? 0) / 1000);
  const heroNum = h('span.sum-xp-num.mono', '0');
  const stats = h('div.sum-stats',
    h('div.sum-xp', heroNum, h('span.sum-xp-label.muted', isBlitz ? `right in ${roundS} s` : 'XP this run')),
    h('dl.sum-facts', ...(isBlitz
      ? [
        fact('Answered', String(b?.answered ?? sum.count), `${b?.wrong ?? sum.missed} wrong`),
        fact('Best streak', String(b?.bestStreak ?? 0), 'in a row'),
        fact('Ended on', b?.reason === 'strikes' ? '3 strikes' : b?.reason === 'time' ? 'the clock' : 'quit', b?.reason === 'strikes' ? 'three in a row' : '', false),
      ]
      : [
        fact('Flawless', `${sum.clean} / ${sum.count}`, 'first try, no hints'),
        fact('Cleared', `${sum.cleared} / ${sum.count}`, sum.missed ? `${sum.missed} went to the solution` : 'nothing revealed'),
        fact('Time', fmtClock(elapsedMs), sum.count ? `${fmtClock(Math.round(sum.ms / Math.max(1, sum.count)))} per item` : ''),
      ])),
  );

  /* rarity histogram */
  const hist = h('div.sum-hist');
  const anyRarity = RARITY_ORDER.some((r) => sum.rarities[r] > 0);
  if (anyRarity) {
    hist.append(h('h2.fs-3', 'Rarity'), h('ul.sum-hist-list',
      ...RARITY_ORDER.filter((r) => sum.rarities[r] > 0).map((r) =>
        h('li', h('span.rarity', { dataset: { r } }, r), h('span.mono.sum-hist-n', `×${sum.rarities[r]}`))),
    ));
  }

  /* minted tiles — the one flourish (S1): flip + foil sheen */
  const mintWrap = h('div.sum-mint');
  if (minted.length) {
    mintWrap.append(
      h('h2.fs-3', minted.length === 1 ? 'Tile minted' : `${minted.length} tiles minted`),
      h('ul.sum-tiles', ...minted.map((m, k) => h('li',
        h('span.tile.sum-tile', {
          dataset: { rarity: m.to, foil: String(m.to === 'platinum'), fam: String(m.fam), delay: String(k) },
          style: { animationDelay: `${k * 90}ms` },
          'aria-label': `${mintLabel(m)} — ${mintCaption(m)}`,
        },
          h('span.tile-num', m.fam ? '◆' : (numbering(m.id) || m.id)),
          h('span.tile-state', { 'aria-hidden': 'true' }, m.to === 'platinum' ? '★' : m.to === 'gold' ? '●' : m.to === 'silver' ? '◐' : '○'),
          // r1: EVERY mint gets the one foil sheen (S9 #7), timed to land after its own staggered flip;
          // `data-foil` (the platinum edge) stays platinum-only.
          h('span.tile-sheen', { 'aria-hidden': 'true', style: { animationDelay: `${420 + k * 90}ms` } }),
        ),
        h('span.sum-tile-cap.fs-1.muted', `${mintLabel(m)} · ${mintCaption(m)}`),
      ))),
    );
  }

  /* skill bars, animating old → new */
  const skillWrap = h('div.sum-skills');
  if (bars.length) {
    skillWrap.append(h('h2.fs-3', 'Skills'), h('ul.sum-bars', ...bars.map((b) => {
      const fill = h('span.sum-bar-fill', { style: { transform: `scaleX(${clamp(b.from / 100, 0, 1)})` } });
      const dn = h('span.sum-bar-n.mono.fs-1', `${Math.round(b.from)}`);
      return h('li.sum-bar', { dataset: { id: b.id } },
        h('span.sum-bar-name', b.name),
        h('span.sum-bar-track', fill, h('span.sum-bar-ghost', { style: { transform: `scaleX(${clamp(b.to / 100, 0, 1)})` } })),
        dn,
        h('span.sum-bar-delta.fs-1', { dataset: { tone: deltaTone(Math.round(b.to - b.from)) } }, deltaText(Math.round(b.to - b.from))),
      );
    })));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!root.isConnected) return;
      bars.forEach((b, k) => {
        const li = skillWrap.querySelectorAll('.sum-bar')[k];
        if (!li) return;
        li.querySelector('.sum-bar-fill').style.transform = `scaleX(${clamp(b.to / 100, 0, 1)})`;
        tween(li.querySelector('.sum-bar-n'), b.from, b.to, 600);
      });
    }));
  }

  /* Readiness */
  const rd = h('div.sum-readiness',
    h('h2.fs-3', 'Readiness'),
    h('p.sum-rd-line',
      h('span.mono.sum-rd-from', String(before.readiness.r)),
      h('span.sum-rd-arrow', '→'),
      h('span.mono.sum-rd-to', { dataset: { band: after.readiness.band.key } }, String(after.readiness.r)),
      h('span.sum-rd-delta', { dataset: { tone: deltaTone(rDelta) } }, deltaText(rDelta)),
    ),
    h('p.muted.fs-1',
      after.readiness.band.label,
      after.readiness.provisional ? ' · provisional — take a Mock or the Baseline to lock it' : '',
      sinceYesterday == null || sinceYesterday === rDelta ? '' : ` · ${sinceYesterday >= 0 ? '+' : ''}${sinceYesterday} since your last day`,
    ),
    h('p.muted.fs-1', `Binder ${after.coverage.cleared} / ${after.coverage.total} cleared`),
  );

  /* mode-specific verdict */
  const verdict = h('div.sum-verdict');
  if (kind === 'jump' && outcome.jump) {
    const j = outcome.jump;
    const m = moduleById[run.meta.module];
    verdict.append(j.passed
      ? h('p.sum-pass', h('strong', `${m?.name ?? run.meta.module} is placed.`), ` ${j.correct} of ${run.items.length} first try — ${j.skills.map((s) => skillById[s]?.name ?? s).join(' and ')} start at ${JUMP.m}. Those originals stop being scheduled as new; they still come back as reviews, in BLITZ and on the Upgrade run.`)
      : h('p.sum-fail', `${outcome.jump.correct ?? 0} of ${run.items.length} first try — ${JUMP.pass} places the module. Nothing is lost: the XP, mastery and tiles you just earned are yours.`));
  }
  if (isBlitz) {
    verdict.append(h('p.muted.fs-1', 'BLITZ is score-only — no XP, no combo. A right answer still counts as a clear of that card, and a wrong one still moves the skill.'));
  }
  if (kind === 'daily' && outcome.dailyXp) verdict.append(h('p.sum-pass', `Daily Challenge banked · +${outcome.dailyXp} XP`));
  if (kind === 'missed') {
    const left = missedOriginals(save).length;
    verdict.append(h('p', left ? `${left} missed original${left === 1 ? '' : 's'} still waiting.` : 'Every original you have attempted is now first-try clean.'));
  }

  /* plan state + buttons */
  const today = todayISO();
  const d = save.daily?.[today] ?? {};
  const goal = save.settings?.dailyGoal ?? 400;
  const plan = h('div.sum-plan',
    h('p.fs-2', h('span.mono', `${num(d.xp, 0)} / ${goal}`), ' XP today', d.goalMet ? h('span.chip', { dataset: { tone: 'accent' } }, 'goal met') : null),
    h('p.muted.fs-1', daysUntilTest(save.settings?.testDate) == null ? 'No test date set.' : `Next: ${next.label}`),
  );

  const actions = h('div.run-actions',
    isPage
      ? h('a.btn.btn-primary', { href: '#/run/page' }, 'Another page')
      : h('a.btn.btn-primary', { href: `#/run/${kind}${run.id ? '/' + run.id : ''}` }, againLabel(kind)),
    h('a.btn', { href: '#/binder' }, 'Binder'),
    h('a.btn', { href: '#/today' }, 'Today'),
  );

  for (const node of [head, stats, verdict, mintWrap, hist, skillWrap, rd, plan, actions]) {
    if (node.childNodes.length) root.append(node);          // an empty section still eats a 20 px grid gap
  }
  host.replaceChildren(root);
  window.scrollTo(0, 0);
  tween(heroNum, 0, isBlitz ? (b?.score ?? 0) : sum.xp + (outcome.dailyXp ?? 0), 500);
  bus.emit('run:done', { kind, id: run.id ?? null, sum, readiness: after.readiness.r });
}

function summaryTitle(kind, { sum, outcome, run }) {
  if (kind === 'page') return sum.missed === 0 && sum.count ? 'Page complete — flawless' : 'Page complete';
  if (kind === 'blitz') return outcome.blitz?.reason === 'strikes' ? 'Three strikes' : outcome.blitz?.reason === 'time' ? 'Time.' : 'Round over';   // r1: the hero is the score
  if (kind === 'jump') return outcome.jump?.passed ? 'Placed' : 'Not placed — yet';
  if (kind === 'full36') return `Full 36 · ${sum.cleared} / ${sum.count}`;
  if (kind === 'daily') return 'Daily Challenge done';
  if (kind === 'drill') return 'Drill done';
  if (kind === 'upgrade') return 'Upgrade run done';
  if (kind === 'missed') return 'Misses run done';
  return 'Run complete';
}

function againLabel(kind) {
  if (kind === 'blitz') return 'Again';
  if (kind === 'drill') return 'Drill 5 more';
  if (kind === 'jump') return 'Jump again';
  if (kind === 'missed') return 'Next 5';
  return 'Run it again';
}

/** r1: a bare "0" next to the big number read like a stray digit — "±0" in --muted says "no change". */
function deltaText(d) { return d > 0 ? `+${d}` : d < 0 ? String(d) : '±0'; }
function deltaTone(d) { return d > 0 ? 'ok' : d < 0 ? 'bad' : 'flat'; }

/** r1: a minted tile names its SHEET ("WP 1.", "ASN 3.", "AP-1 W2"), not a bare "1." (S9: placeable in the packet). */
function mintLabel(m) {
  if (m.fam) return familyById[m.id]?.name ?? m.id;
  const sheet = sheetOf(m.id) ?? cardById[m.id]?.sheet ?? null;
  const no = numbering(m.id) || m.id;
  return sheet ? `${sheet} ${no}` : no;
}
function mintCaption(m) { return m.from ? `${m.from} → ${m.to}` : m.to; }

function fact(label, value, note, mono = true) {
  return h('div.sum-fact', h('dt.muted.fs-1', label),
    h('dd', h(mono ? 'span.mono.sum-fact-v' : 'span.sum-fact-v', value), note ? h('span.muted.fs-1.sum-fact-note', note) : null));
}

/** Count a number up over `ms` (transform/opacity only elsewhere; this is text, so it tweens by value). */
function tween(el, from, to, ms) {
  if (!el) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || from === to) { el.textContent = String(Math.round(to)); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = clamp((t - t0) / ms, 0, 1);
    el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default mountRun;
