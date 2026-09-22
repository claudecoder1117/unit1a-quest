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
import { rarityOf, bestRarity, tileRarity, familyRarity, foilRule, FAMILY_STEPS, FAMILY_PLATINUM_GOLD, FAMILY_PLATINUM_DAYS } from '../rarity.js';
import { applyOutcome as applySchedule, outcomeOf, checkDailyGoal, dailyRecord, needsMet, dueList } from '../schedule.js';
import { readiness, readinessDelta, logForecast, skillStates, coverageCount, weakSpots } from '../readiness.js';
import {
  resumePage, startPage, markItem, requeueReview, finishPage, missedOriginals,
  nextAction, pageLabel,
} from '../page.js';
import { composeOpts } from '../plan.js';   // W4 integration (notes/T14.md Requests → T16)
import { createCardView, familyOf, fmtClock } from './card.js';
import { options as mcOptions } from '../grader/mc.js';
/* === J6b === the debrief. All four are DOM-free game modules (G7 "every one under js/job/ is DOM-free
   and Node-testable"); this screen reads them and prints, and writes nothing they own. */
import * as jobEcon from '../job/econ.js';
import * as jobCall from '../job/call.js';
import * as jobGuard from '../job/guard.js';
import * as jobIndex from '../job/index.js';
import {
  COPY as JOB_COPY, ANIMATION as JOB_ANIMATION, SHAPES as JOB_SHAPES,
  GUARD as JOB_GUARD, AUTO_BAG as JOB_AUTO_BAG, PHASE_MEANS_DEFAULT as JOB_PHASE_MEANS,
  WING_IDS as JOB_WING_IDS,
} from '../../data/job.js';

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
  // J6 (COMPOSED-GAME G7 "Extended", G10 #14 "zero new routes"): THE JOB is `#/run/job?seed=`.
  // `game: true` keeps it out of RUN_KINDS below — it is not one of S1's run kinds, it is the game
  // layer's one mount point, exactly as `post` is T14's Post-test state (see DELEGATES).
  job: { title: 'The Job', back: '/today', mode: 'card', delegate: 'job', game: true },
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
  // J6 — THE JOB's screen (js/screens/job.js), the same delegate pattern baseline and night use.
  job: { mod: './job.js', fns: ['mountJob'], fallback: 'stub' },
  // `post` is not one of S1's run kinds — it is the Post-test state T14 reaches through this route.
  // It is delegated (never listed in RUN_KINDS) so a deep link still lands on the screen that owns it.
  post: { mod: './night.js', fns: ['mountRunKind', 'mountPostTest'], fallback: 'stub' },
});
export const delegateOf = (kind) => DELEGATES[String(kind)] ?? null;

/**
 * Every run kind that mounts here (S1: "every run type named anywhere in S1/S7 mounts here").
 * J6: a `game: true` entry is NOT one of S1's run kinds — `job` mounts on this route the way `post`
 * is delegated to it, so the route count stays 13 while S1's list stays the eleven it names.
 */
export const RUN_KINDS = Object.freeze(Object.keys(KIND_META).filter((k) => KIND_META[k].game !== true));
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
    // J5b (one-line addition, BUILD-POLICY §2 — see notes/J5b.md "Requests"): Drill 5 picks a template
    // the same way page.js's weak slot does, item-level `needs` met. Nothing is locked: an unmet skill
    // drills its originals, exactly as a skill with no generator does.
    const tpls = T.templatesForSkill(skill).filter((t) => needsMet(T.getTemplate(t)?.needs, save));
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

function runHead({ title, subtitle, back, right = null, quitLabel = 'Quit', kind = null }) {
  // fix5 run r2: data-kind so a phone hides ONLY the Page's subtitle ("11 new + 2 variants"); every other run's
  // subtitle is its rule ("hints off, first try only", "pay full XP") and stays on its own line (polish.css).
  const head = h('header.run-head', kind ? { dataset: { kind } } : {});
  head.append(
    // fix5 run r1: arrow + label in their own spans so a phone shows a 44 px "←" icon button (the label is
    // visually hidden ≤ 639 px, the aria-label carries it) and the whole head fits one slim row (polish.css).
    h('a.btn.run-quit', { href: '#' + back, 'aria-label': `${quitLabel} — progress is kept`, title: quitLabel }, h('span.run-quit-arrow', { 'aria-hidden': 'true' }, '←'), h('span.run-quit-label', ' ', quitLabel)),
    h('div.run-titles', h('h1.run-title.fs-4', title), subtitle ? h('p.run-sub.muted.fs-1', subtitle) : null),
  );
  if (right) head.append(right);
  return head;
}

function progressBar(done, total, { retries = 0 } = {}) {
  const wrap = h('div.run-progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': retries ? `Run progress, ${retries} ${retries === 1 ? 'retry' : 'retries'}` : 'Run progress' },
    h('div.run-progress-track', h('div.run-progress-fill', { style: { transform: `scaleX(${total ? done / total : 0})` } })),
    h('span.run-progress-n.mono.fs-1', `${done} of ${total} done`, retries ? h('span.run-progress-retry', ` · ${retries} ${retries === 1 ? 'retry' : 'retries'}`) : null),
  );
  return wrap;
}

function emptyState(el, run) {
  el.replaceChildren(h('section.screen.run-screen', { dataset: { kind: run.kind } },
    runHead({ title: run.title, subtitle: '', back: run.back, quitLabel: 'Back', kind: run.kind }),
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
    // fix5:home: the header shows the LIVE number — a resumed Page's `before` is the page-start snapshot (kept for the
    // Summary delta), and showing it read 57 right after Home had shown 60 for the same save.
    { const live = readiness(getState()); setHeader({ readiness: live.r, provisional: !!live.provisional }); }
  }

  renderHead();
  renderItem();

  function renderHead() {
    // page r2: one denominator for the whole page — every item played (retries included) over the queue
    // ("16 of 20 done · 3 retries"), so the bar moves on a retry and the Summary's "/ 20" is the same 20.
    // (r1 counted only first plays, which froze the head at "13 of 17" for three consecutive retries.)
    const retries = kind === 'page' ? queue.filter((it) => it.requeued).length : 0;
    const done = kind === 'page' ? queue.filter((it) => it.done).length : results.length;
    headSlot.replaceChildren(runHead({
      title: run.title, subtitle: run.subtitle, back: run.back,
      right: progressBar(done, queue.length, { retries }),
      quitLabel: kind === 'page' ? 'Quit' : 'Back', kind,
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
      title: run.title, subtitle: run.subtitle, back: run.back, quitLabel: 'Quit', kind: 'blitz',
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
      // page r2: `data-ok` lets a wrong tap mark the pressed option ✗ AND the right one ✓ (never colour-only).
      graderOptions(e).forEach((opt, k) => {
        answers.append(h('button.btn.blitz-opt', { type: 'button', dataset: { ok: String(!!opt.ok) }, onclick: (ev) => submit(e, opt.text, ev.currentTarget) },
          h('span.blitz-key.mono', String(k + 1)), h('span.blitz-opt-text', { html: mathfmt(opt.text) })));
      });
    } else if (e.type === 'asn') {
      [['A', 'Always'], ['S', 'Sometimes'], ['N', 'Never']].forEach(([letter, word]) => {
        answers.append(h('button.btn.blitz-asn', { type: 'button', dataset: { ok: String(letter === String(e.part?.answer ?? '').toUpperCase()) }, onclick: (ev) => submit(e, letter, ev.currentTarget) },
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

  /** page r2: mark the pressed option and the right one for the lockout (S5 wrong = shake the offending part). */
  function markOptions(pressed, ok) {
    const right = answers.querySelector('button[data-ok="true"]');
    if (pressed) { pressed.dataset.state = ok ? 'ok' : 'bad'; pressed.append(h('span.blitz-mark', { 'aria-hidden': 'true' }, ok ? '✓' : '✗')); }
    if (!ok && right && right !== pressed) { right.dataset.state = 'ok'; right.append(h('span.blitz-mark', { 'aria-hidden': 'true' }, '✓')); }
  }

  function submit(e, raw, pressed = null) {
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
    markOptions(pressed, ok);
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
      if (letter) { ev.preventDefault(); submit(e, letter, [...answers.querySelectorAll('.blitz-asn')].find((b) => b.querySelector('.blitz-key')?.textContent === letter) ?? null); }
      return;
    }
    if (e.type === 'mc') {
      const i2 = '123456789'.indexOf(k);
      const opts = graderOptions(e);
      if (i2 >= 0 && i2 < opts.length) { ev.preventDefault(); submit(e, opts[i2].text, answers.querySelectorAll('.blitz-opt')[i2] ?? null); }
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
const RARITY_GLYPH = { platinum: '★', gold: '●', silver: '◐', bronze: '○' };

function renderSummary(host, ctx) {
  const { kind, run, results, sum, before, after, tilesBefore, tilesAfter, outcome, save, elapsedMs } = ctx;
  /* J6b — the debrief IS this screen (G7 "Today's Page ↔ jobs"). `ctx.job` is `state.endJob`'s return
     value; without it every line below runs exactly as it did before, which is what makes the tile
     mint / skill bars / Readiness delta byte-identical with the layer off. */
  const job = isObj(ctx.job) ? ctx.job : null;
  const hold = job ? bagDropMs() : 0;          // ms the summary's own cues are held for the bag drop
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
  // page r2: "right in 60 s" was untrue after a 3-strike end at 0:23 — the hero names the seconds actually played.
  const playedS = b?.reason === 'time' ? roundS : Math.max(1, Math.round(elapsedMs / 1000));
  const retries = isPage ? (run.items ?? []).filter((it) => it && it.requeued).length : 0;
  const heroNum = h('span.sum-xp-num.mono', '0');
  const stats = h('div.sum-stats',
    h('div.sum-xp', heroNum, h('span.sum-xp-label.muted', isBlitz ? `right in ${playedS} s` : 'XP this run')),
    h('dl.sum-facts', ...(isBlitz
      ? [
        fact('Answered', String(b?.answered ?? sum.count), `${b?.wrong ?? sum.missed} wrong`),
        fact('Best streak', String(b?.bestStreak ?? 0), 'in a row'),
        fact('Ended on', b?.reason === 'strikes' ? '3 strikes' : b?.reason === 'time' ? 'the clock' : 'quit', b?.reason === 'strikes' ? 'three in a row' : '', false),
      ]
      : [
        fact('Flawless', `${sum.clean} / ${sum.count}`, 'first try, no hints'),
        fact('Cleared', `${sum.cleared} / ${sum.count}`, (sum.missed ? `${sum.missed} went to the solution` : 'nothing revealed') + (retries ? ` · ${retries} retried` : '')),
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
      h('ul.sum-tiles', ...minted.map((m, k) => h('li', { dataset: { fam: String(m.fam) } },
        h('span.tile.sum-tile', {
          dataset: { rarity: m.to, foil: String(m.to === 'platinum'), fam: String(m.fam), delay: String(k) },
          style: { animationDelay: `${k * 90}ms` },
          'aria-label': m.fam ? familyAria(m, save?.variants?.[m.id]) : `${mintLabel(m)} — ${mintCaption(m)}`,
        },
          h('span.tile-num', m.fam ? '◆' : (numbering(m.id) || m.id)),
          h('span.tile-state', { 'aria-hidden': 'true' }, m.to === 'platinum' ? '★' : m.to === 'gold' ? '●' : m.to === 'silver' ? '◐' : '○'),
          // r1: EVERY mint gets the one foil sheen (S9 #7), timed to land after its own staggered flip;
          // `data-foil` (the platinum edge) stays platinum-only.
          h('span.tile-sheen', { 'aria-hidden': 'true', style: { animationDelay: `${420 + k * 90}ms` } }),
        ),
        h('span.sum-tile-cap.fs-1.muted', { 'aria-hidden': m.fam ? 'true' : null },
          h('span.sum-tile-name', m.fam ? familyNameNodes(mintLabel(m)) : mintLabel(m)),
          h('span.sum-tile-move', `${RARITY_GLYPH[m.to] ?? ''} ${m.to}`),   // page r2: two short lines under a 60 px tile
          // fix5 run r1 (S4 family ladder): a family tile counts Gold VARIANTS, so it reads bronze right after a
          // "◆ GOLD" card — the third line says where it stands ("1/6 ◆ → Silver at 2", r2: the Binder's /6).
          m.fam ? h('span.sum-tile-fam', familyProgressLine(save?.variants?.[m.id])) : null),
      ))),
    );
    if (minted.some((m) => m.fam)) {
      mintWrap.append(h('p.sum-fam-legend.muted.fs-1', h('span.sum-fam-legend-k', '◆ Family tile'), ` — it counts Gold Variants, not one card: ${FAMILY_LADDER_TEXT}`));
    }
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
    afterHold(hold, () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!root.isConnected) return;
      bars.forEach((b, k) => {
        const li = skillWrap.querySelectorAll('.sum-bar')[k];
        if (!li) return;
        li.querySelector('.sum-bar-fill').style.transform = `scaleX(${clamp(b.to / 100, 0, 1)})`;
        tween(li.querySelector('.sum-bar-n'), b.from, b.to, 600);
      });
    })));
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
    h('p.muted.fs-1', daysUntilTest(save.settings?.testDate) == null ? 'No test date set.' : `Next: ${String(next.label ?? '').replace(/^RUN NEXT(?: · )?/, '') || 'a Page'}`),   // page r2: the Home button label, not its prefix
  );

  /* J6b — the debrief's own two blocks. Both are EMPTY when `ctx.job` is null, and an empty section is
     never appended (the loop below), so the flat path's node list is unchanged. */
  const jobTake = job ? jobTakeBlock(job, ctx) : h('div.sum-job-take');
  const jobLedger = job ? jobLedgerBlock(job, ctx) : h('div.sum-job-ledger');
  /* r1 — G5 #1's hook, the debrief's LAST line, under the buttons' own block so it is the last thing
     read before Home. Empty on the flat path, so the flat Summary's node list is still unchanged. */
  const jobTomorrow = job ? jobTomorrowBlock(ctx) : h('div.sum-job-tomorrow');

  const actions = job
    // G6: "the app never says 'one more?' — the debrief's primary button is Home, and Another board is
    // the secondary." The rest of Today's Page, if a job left any, is offered as the calm page.
    ? h('div.run-actions',
      h('a.btn.btn-primary', { href: '#/today' }, 'Home'),
      h('a.btn', { href: '#/run/job' }, 'Another board'),
      num(job.left, 0) > 0 ? h('a.btn', { href: '#/run/page' }, 'Today’s Page') : null,
      h('a.btn', { href: '#/stats' }, 'Ledger'),
      h('a.btn', { href: '#/binder' }, 'Binder'),
    )
    : h('div.run-actions',
      isPage
        ? h('a.btn.btn-primary', { href: '#/run/page' }, 'Another page')
        : h('a.btn.btn-primary', { href: `#/run/${kind}${run.id ? '/' + run.id : ''}` }, againLabel(kind)),
      h('a.btn', { href: '#/binder' }, 'Binder'),
      h('a.btn', { href: '#/today' }, 'Today'),
    );

  for (const node of [head, stats, verdict, jobTake, mintWrap, hist, skillWrap, rd, jobLedger, plan, jobTomorrow, actions]) {
    if (node.childNodes.length) root.append(node);          // an empty section still eats a 20 px grid gap
  }
  host.replaceChildren(root);
  window.scrollTo(0, 0);
  /* J6b — THE BAG DROP (G6, G10 #13, G12 #32). It starts on the frame the debrief lands, it is the only
     thing animating for its 600 ms, and the screen stays interactive underneath: nothing is disabled,
     nothing is `position: fixed`, and every control above is already in the accessibility tree. */
  if (job) startBagDrop(root, job, hold);
  afterHold(hold, () => tween(heroNum, 0, isBlitz ? (b?.score ?? 0) : sum.xp + (outcome.dailyXp ?? 0), 500));
  bus.emit('run:done', { kind, id: run.id ?? null, sum, readiness: after.readiness.r, ...(job ? { job } : null) });
}

function summaryTitle(kind, { sum, outcome, run, job }) {
  if (isObj(job)) return JOB_TITLES[String(job.outcome)] ?? 'Job over';
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

/* ---- fix5 run r1: family tiles on the Summary (S4: Bronze/Silver/Gold at 1/2/3 Gold Variants, Platinum at
   6 across ≥ 2 days — the same rule the Binder tooltip prints via foilRule) ---- */
export const FAMILY_LADDER_TEXT = foilRule('fam-sys');
/** "Quadratics, a > 1" → "Quadratics (a > 1)": no comma that can be orphaned at the start of a line. */
export function familyDisplayName(name) {
  return String(name ?? '').replace(/^(.*?),\s*(.+)$/, '$1 ($2)');
}
/** The name as nodes: the parenthetical qualifier is one unbreakable span, so a line never starts with punctuation. */
function familyNameNodes(name) {
  const disp = familyDisplayName(name);
  const m = disp.match(/^(.*\S)\s+(\([^)]*\))$/);
  return m ? [m[1], ' ', h('span.sum-nowrap', m[2])] : [disp];
}
/**
 * Where a family tile stands on its ladder, one short line (≤ 19 characters, fits the 130 px caption at 11 px
 * mono). fix5 run r2: the SAME fraction the Binder popover prints ("1 / 6 Gold Variants", capped at 6), plus the
 * next rung: "0/6 ◆ → Bronze at 1", "1/6 ◆ → Silver at 2", "2/6 ◆ → Gold at 3", "3/6 ◆ → Platinum" (Platinum
 * is at 6, the denominator), then the day rule: "6/6 ◆ · 1 of 2 days", "6/6 ◆ · 2 of 2 days" (Platinum).
 * @param {{ clearsGold?:number, goldDays?:string[] }} rec  save.variants[famId]
 */
export function familyProgressLine(rec) {
  const { n, have, days } = familyCounts(rec);
  const frac = `${have}/${FAMILY_PLATINUM_GOLD} ◆`;
  if (n < FAMILY_STEPS.bronze) return `${frac} → Bronze at ${FAMILY_STEPS.bronze}`;
  if (n < FAMILY_STEPS.silver) return `${frac} → Silver at ${FAMILY_STEPS.silver}`;
  if (n < FAMILY_STEPS.gold) return `${frac} → Gold at ${FAMILY_STEPS.gold}`;
  if (n < FAMILY_PLATINUM_GOLD) return `${frac} → Platinum`;
  return `${frac} · ${Math.min(days, FAMILY_PLATINUM_DAYS)} of ${FAMILY_PLATINUM_DAYS} days`;
}
function familyCounts(rec) {
  const n = rec && Number.isFinite(rec.clearsGold) ? Math.max(0, Math.floor(rec.clearsGold)) : 0;
  const days = new Set((rec && Array.isArray(rec.goldDays) ? rec.goldDays : []).filter((d) => typeof d === 'string')).size;
  return { n, have: Math.min(FAMILY_PLATINUM_GOLD, n), days };
}
function familyAria(m, rec) {
  const { have, days } = familyCounts(rec);
  return `${familyDisplayName(mintLabel(m))} family tile — ${m.to}, ${have} of ${FAMILY_PLATINUM_GOLD} Gold Variants, ${Math.min(days, FAMILY_PLATINUM_DAYS)} of ${FAMILY_PLATINUM_DAYS} days. ${FAMILY_LADDER_TEXT}`;
}

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

/* ==================================================================================================
   === J6b === THE DEBRIEF — the Page Summary, with the job's numbers on it.
   ==================================================================================================

   G7 "Today's Page ↔ jobs": *"The Page Summary becomes the debrief (same screen, same tile mint, same
   skill bars, same Readiness delta, plus the bag drop, the rating delta, the guard redraw, the regret
   lines, the split and the decision count)."*  So this is not a second summary screen — it is
   `renderSummary` with `ctx.job` set, which is the only way "byte-identical to the flat-path Page
   Summary with the layer off" can be structural rather than a promise: the mint, the bars and the
   Readiness block are built by the SAME three expressions either way, and this block only ever adds
   sibling sections and holds the summary's own cues back for 600 ms.

   Three laws this block keeps:

     1. **The bag drop is the only thing animating while it runs** (G6, G10 #13, G12 #32). Every other
        animation in the document is PAUSED for its 600 ms and resumed after — the tile flip included,
        so S9 #7's signature moment lands immediately after the drop rather than under it. Under
        `prefers-reduced-motion` the hold is 0 ms and nothing animates at all.
     2. **The debrief stays interactive underneath.** Nothing is disabled, nothing is `position: fixed`
        and no overlay is created; the drop is a transform on the numerals in the take block.
     3. **Evidence after the decision** (Global law 6). This is the ONE surface that may name the
        argmax rung, because every call it names is already answered. `js/screens/job.js` still must
        not import `argmaxCall` — the debrief lives here.
   ------------------------------------------------------------------------------------------------ */

/** The debrief's headline, one per terminal word of `job/state.js`'s `OUTCOMES`. Numbers-first, dry. */
const JOB_TITLES = Object.freeze({
  completed: 'Job complete',
  cracked: 'Vault cracked',
  walked: 'Walked with the bag',
  quit: 'Left mid-job',
  called: 'Stakes off',
  commit: 'Walked at the declared minute',
  quiet22: 'Banked at 22:00',
});

/**
 * THE REGRET LINE'S LADDER — one ladder, named and priced in the same currency (r3).
 *
 * notes/J2.md §5.7 asked J6b to pick a ladder and write it down; J6b picked `{best:'carry',
 * cost:'rating'}` on the claim that G5 #2's own worked line — `envelope 6: you called 85, EV-max was
 * 70; that cost 0.3 rating` — *"only reproduces"* under that pair. **That claim is false**, and the
 * pair it justified is the one combination that can print a losing instruction:
 *
 *   `honestCall(0.75) === argmaxCall(0.75) === 70` — the two ladders AGREE at the worked line's
 *   `q̂`, so the rating-consistent pair reproduces it exactly (`credit(.70,.75) − credit(.85,.75)
 *   = 0.3`, in the rating units the sentence itself names). The carry pair reproduces the rung and
 *   then misprices it: its own cost is 0.05 loot, not 0.3 rating.
 *
 * Inside G3.1's published disagreement bands the mixed pair breaks. At `q̂ = 0.885` (band 2, *money
 * 95, rank 85*) it named 95 — the CARRY argmax — and charged the difference in RATING credit, where
 * 95 is the worse rung: `E[c](.95) = 5.760 < E[c](.85) = 5.880`. A student who followed the printed
 * advice LOST 0.12 credit, on the one line the design writes to teach. G3.1 calls that band *"the
 * only place in the game where the player must choose what they are playing for"* — so the debrief
 * must not silently resolve it, least of all in the currency the other ladder is denominated in.
 *
 * So the line runs on ONE ladder: `call.regretOf({..., ladder: 'rating'})` — `best = honestCall(q̂)`,
 * the maximiser of the expected credit the sentence prices, which is also the rating delta printed
 * three lines above it. `COPY.regret2`'s `EV-max` is that maximiser (the call ladder is strictly
 * proper, so it is the honest rung). The carry argmax keeps its own published home: Settings, where
 * both ladders and both disagreement bands are printed side by side (G3.1) — evidence the student
 * reads BEFORE the call, which is where a money-vs-rank choice belongs (Global law 6).
 */
export const DEBRIEF_CALL_LADDER = Object.freeze({ best: 'rating', cost: 'rating' });

/** A job's identity for the once-per-job guard: everything that makes it a different job. */
export const jobSignature = (job) => [
  job?.shape ?? '?', job?.outcome ?? '?', num(job?.targets, 0), num(job?.of, 0),
  num(job?.finalBagged ?? job?.bagged, 0), Math.round(num(job?.tGame, 0)), Math.round(num(job?.tAnswer, 0)),
].join(':');

/** The bag drop's budget, read from `data/job.js` — 0 ms under `prefers-reduced-motion` (G6). */
export function bagDropMs() {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return JOB_ANIMATION.reducedMotionMs;
  return JOB_ANIMATION.bagDrop.ms;
}

const mmss = (ms) => fmtClock(num(ms, 0));
const pct1 = (x) => `${Math.round(num(x, 0) * 100)} %`;

/* The debrief's own layout, inline, because `css/screens.css` and `css/job.css` belong to other
   tickets (BUILD-POLICY §2) and a block appended to either would be a second owner of this screen's
   look. Every value is a theme token, every bar is laid out at its FINAL size and only its fill is
   transformed, so the guard redraw and the Fault Index deltas shift nothing. A request to move this
   into `css/job.css` as its own marked block is in notes/J6b.md section 7. */
const BAG_LINE_CSS = Object.freeze({ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '10px', margin: '0 0 6px' });
const BAG_DIGITS_CSS = Object.freeze({ display: 'inline-flex', overflow: 'hidden', lineHeight: '1.15' });
const GUARD_BARS_CSS = Object.freeze({ listStyle: 'none', margin: '0', padding: '0', display: 'grid', gap: '6px' });
const GUARD_BAR_CSS = Object.freeze({ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 8ch), max-content) 1fr max-content', gap: '8px', alignItems: 'center' });
const GUARD_TRACK_CSS = Object.freeze({ display: 'block', blockSize: '8px', borderRadius: '4px', background: 'var(--surface2)', overflow: 'hidden' });
const GUARD_FILL_CSS = Object.freeze({ display: 'block', blockSize: '100%', inlineSize: '100%', transformOrigin: 'left center' });

/** Run `fn` after `ms`, or synchronously when the hold is 0 (reduced motion, or no job). */
function afterHold(ms, fn) {
  if (!(num(ms, 0) > 0)) { fn(); return null; }
  return setTimeout(fn, ms);
}

/* ------------------------------------------------------------------ the realised order */

/**
 * The realised order, in the shape `econ.regretLine` / `econ.playOrder` read.
 *
 * `inProgress.game.calls[]` keeps `{call, ok, w, skill, rung, d, at}` — the realised rung, the call and
 * the realised Δloose, but NOT the pricing that produced it and NOT the BAG/PUSH vector (notes/J5c.md;
 * a request to record both is filed in notes/J6b.md §7). Both are recoverable:
 *
 *   · the pricing collapses into ONE number per target. `carryFor` is
 *     `round(L·ρ·m_chain·W·scope·wing·cold·tell·x2·mult)`, so a synthetic target with every published
 *     multiplier at 1 and `mult = d / (ρ · m_chain · W)` reproduces the realised Δ exactly at the
 *     realised chain AND scales correctly at every other chain — which is all the solver needs, since
 *     the only freedom in the replay is where you banked.
 *   · a miss is capped by the pile (`−min(LOOSE, …)`). When the cap did not bite, `mult` is exact the
 *     same way; when it did, the uncapped loss is not in the save and `opts.items[i].tier` (with the
 *     guard penalty and the ×2) is used to rebuild it, falling back to the capped value.
 *
 * @param {object} debrief            `state.endJob`'s return value (or `state.debriefOf`)
 * @param {{decisions?: ('bag'|'push')[], items?: object[], guardWing?: string|null,
 *          qHatOf?: (call: object, i: number) => number|null, crewOf?: (skill: string) => number}} [opts]
 * @returns {{targets: object[], decisions: ('bag'|'push')[], completion: boolean, commit: boolean}}
 */
export function realisedOrderOf(debrief, opts = {}) {
  const calls = Array.isArray(debrief?.calls) ? debrief.calls : [];
  const beats = Math.max(0, calls.length - 1);
  const decisions = [];
  for (let i = 0; i < beats; i++) decisions.push(opts.decisions?.[i] === 'bag' ? 'bag' : 'push');
  const items = Array.isArray(opts.items) ? opts.items : [];
  const guardWing = typeof opts.guardWing === 'string' ? opts.guardWing : null;

  const targets = [];
  let chain = 0; let loose = 0;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const m = jobEcon.chainMult(chain);
    const rho = jobEcon.rhoFor(c.rung, 0);
    const { W, P } = jobEcon.carryOf(c.call);
    const d = num(c.d, 0);
    let mult = 0;
    if (rho > 0) {
      mult = (rho * m * W) > 0 ? d / (rho * m * W) : 0;
    } else {
      const lost = Math.abs(d);
      mult = (m * P) > 0 ? lost / (m * P) : 0;
      if (lost >= loose - 1e-9 && items[i]) {
        // the cap may have bitten: rebuild the uncapped loss from the item's own grade
        const it = items[i];
        const pen = guardWing && jobGuard.wingOf(it.skill ?? c.skill) === guardWing ? 2 : 1;
        const raw = jobEcon.lootFor({ tier: it.tier, loot: it.loot }) * pen * (it.x2 ? 2 : 1);
        mult = Math.max(mult, raw);
      }
    }
    const t = {
      loot: 1, scope: 1, cold: 1, tell: null, x2: false, tokens: 0, guarded: false,
      crew: 0, idle: false, rung: c.rung, call: c.call, mult,
      skill: c.skill ?? null,
      qHat: typeof opts.qHatOf === 'function' ? opts.qHatOf(c, i) : (Number.isFinite(c.qHat) ? c.qHat : null),
    };
    targets.push(t);
    const s = jobEcon.settle(t, chain, loose);
    loose = s.loose; chain = s.chain;
    if (i < beats && decisions[i] === 'bag') { loose = 0; chain = jobEcon.chainAfterBag(); }
  }
  return {
    targets, decisions,
    completion: debrief?.complete === true && num(debrief?.bonusRate, 0) > 0 && debrief?.outcome !== 'commit',
    commit: debrief?.outcome === 'commit',
  };
}

/**
 * Recover the BAG/PUSH vector a job was actually played with, when nobody recorded it.
 *
 * The reconstruction above is a function of the vector (the chain a target settled at depends on where
 * you banked), so this re-derives the order under every one of the `2^(n−1)` vectors — at most 2 048
 * for a 12-target job — and keeps the ones whose replayed BAGGED matches the job's own. Ties break
 * towards the FEWEST bags, then towards all-push, so the recovered line is never a busier story than
 * the save can support.
 *
 * @returns {{decisions: ('bag'|'push')[], unique: boolean, candidates: number, target: number}}
 */
export function inferDecisions(debrief, opts = {}) {
  const n = Array.isArray(debrief?.calls) ? debrief.calls.length : 0;
  const beats = Math.max(0, n - 1);
  const target = num(debrief?.baseBagged, num(debrief?.bagged, 0));
  const allPush = Array.from({ length: beats }, () => 'push');
  if (beats === 0 || beats > 16) return { decisions: allPush, unique: beats === 0, candidates: 0, target };
  const hits = [];
  for (let mask = 0; mask < 2 ** beats; mask++) {
    const d = [];
    for (let i = 0; i < beats; i++) d.push((mask >> i) & 1 ? 'bag' : 'push');
    const order = realisedOrderOf(debrief, { ...opts, decisions: d });
    // `playOrder` applies the end-of-job bonuses; `baseBagged` is pre-bonus, so compare bare.
    const v = jobEcon.playOrder({ ...order, completion: false, commit: false }, d);
    if (Math.abs(v - target) <= 1) hits.push(d);
  }
  if (!hits.length) return { decisions: allPush, unique: false, candidates: 0, target };
  hits.sort((a, b) => a.filter((x) => x === 'bag').length - b.filter((x) => x === 'bag').length);
  return { decisions: hits[0], unique: hits.length === 1, candidates: hits.length, target };
}

/**
 * Both regret lines for one job, computed from the realised order — G5 #2.
 *
 *   bagpush : `econ.regretLine(order).line`   verbatim, through `COPY.regret`
 *   call    : `COPY.regret2` on the envelope with the largest rating cost, with `EV-max` and that
 *             cost both taken from `call.regretOf` on ONE ladder (see `DEBRIEF_CALL_LADDER`)
 *
 * Either line is `''` when there is nothing to teach — played optimally, the debrief prints none.
 * @returns {{order, bagpush: object, call: {line: string, envelope: number|null, called: number|null,
 *            evMax: number|null, cost: number, q: number|null}}}
 */
export function jobRegret(debrief, opts = {}) {
  const order = isObj(opts.order) ? opts.order : realisedOrderOf(debrief, opts);
  const bagpush = jobEcon.regretLine(order);

  let worst = null;
  order.targets.forEach((t, i) => {
    const q = Number.isFinite(t.qHat) ? t.qHat : null;
    if (q == null) return;
    const called = jobCall.callLevel(t.call)?.id ?? null;
    if (called == null) return;
    /* ONE ladder, named and priced together — `call.regretOf` is the module's own implementation of
       exactly this pair and was dead code while this screen hand-rolled a mismatched one (r3). */
    const { best, cost } = jobCall.regretOf({ call: called, qHat: q, ladder: DEBRIEF_CALL_LADDER.best });
    if (cost <= 0) return;
    if (!worst || cost > worst.cost) worst = { envelope: i + 1, called, evMax: best, cost, q };
  });

  const line = worst && Math.round(worst.cost * 10) / 10 > 0
    ? JOB_COPY.regret2({ envelope: worst.envelope, called: worst.called, evMax: worst.evMax, cost: (Math.round(worst.cost * 10) / 10).toFixed(1) })
    : '';
  return { order, bagpush, call: { line, ...(worst ?? { envelope: null, called: null, evMax: null, cost: 0, q: null }) } };
}

/* ------------------------------------------------------------------ the before-snapshot */

/**
 * The before-snapshot a job's debrief needs, written where a Page's already lives
 * (`inProgress.meta.before`, which `pageBefore()` reads), so a mid-job reload still ends on the
 * debrief of the WHOLE job. Idempotent: an existing snapshot is returned untouched.
 *
 * It is the flat Page's five keys plus two the game adds (`tags`, `index`), which the flat path
 * ignores — `pageBefore()` validates `skills` / `readiness` / `tiles` and nothing else.
 * @param {object} save
 * @param {object[]} [queue]  the job's queue; defaults to `save.inProgress.queue`
 */
export function captureJobBefore(save, queue = null) {
  const ip = save?.inProgress ?? null;
  const stored = pageBefore(ip);
  /* r1 — the job's START STAMP, for the debrief's idle measurement (see `jobWallMs`). `startJob`
     writes `inProgress.startedAt` in the same statement that arms the phase machine's first
     `phaseAt`, so `[startedAt, now]` is EXACTLY the span `tGame + tAnswer` claims to cover — which
     is what lets the debrief measure one clock against a different one. It is patched onto an older
     stored snapshot too, because the snapshot (not `inProgress`) is what survives `finishPage`. */
  if (stored) {
    if (!(num(stored.startedAt, 0) > 0) && num(ip?.startedAt, 0) > 0) stored.startedAt = num(ip.startedAt, 0);
    /* r2 — the PAGE'S OWN SEED, patched onto an older snapshot for the same reason: `commitJobRun`
       writes the page's run record at the debrief, and by then `finishPage` has cleared
       `inProgress`, so `seed` / `seedTag` are unrecoverable unless they were snapshotted here. */
    if (stored.seed == null && ip?.seed != null) stored.seed = ip.seed;
    if (stored.seedTag == null && ip?.seedTag != null) stored.seedTag = ip.seedTag;
    return stored;
  }
  const items = Array.isArray(queue) ? queue : (Array.isArray(ip?.queue) ? ip.queue : []);
  const rd = readiness(save);
  const snap = {
    skills: skillStates(save),
    readiness: { r: rd.r, provisional: !!rd.provisional },
    xp: save.xp,
    coverage: coverageCount(save),
    tiles: tileSnapshot(save, tileIdsOf(items)),
    tags: jobIndex.sealedOf(save),
    index: jobIndex.indexProgress(save),
    /* The rating as it stood BEFORE the first call. `job/state.js` now snapshots the same number
       into `inProgress.game.rating0` and `endJob` reports THAT as `ratingBefore` (notes/J6b.md R2,
       done at integration), so the two agree and `job-debrief.test.mjs` asserts they do. This key
       stays because it is the snapshot for a job the screen mounted without a live record — and
       because the Page's own before-snapshot is this same object. */
    rating: num(save?.player?.rating?.value, 5),
    startedAt: num(ip?.startedAt, 0),
    /* r2 — the page's identity, for the run record. The flat Page puts `run.seed` / `run.seedTag`
       on its record; a job's are `inProgress`'s, and `inProgress` does not survive the job. */
    seed: ip?.seed ?? null,
    seedTag: ip?.seedTag ?? null,
  };
  if (ip && isObj(ip)) ip.meta = { ...(isObj(ip.meta) ? ip.meta : null), before: snap };
  return snap;
}

/**
 * r1 — THE INDEPENDENT CLOCK the debrief's idle number is measured against (G9 #1).
 *
 * `before.startedAt` is `startJob`'s own stamp and `now` is the instant the debrief context is first
 * built, so the value is the whole job timed by a clock that never passes through `setPhase`.
 * `sessionSplit` subtracts what the phase machine banked (`tGame + tAnswer`) and what is left is
 * every millisecond the app spent in no phase at all — G9 #1's *"state where the app is neither
 * accepting input nor showing a result"*. It is a difference of two clocks, so it goes non-zero the
 * moment a transition skips its `tick`; the old expression subtracted `debriefOf`'s `wall` from
 * `tGame + tAnswer`, and `state.debriefOf` DERIVES `wall` as `tGame + tAnswer`, so it was x − x and
 * could never be anything but 0 (r1 blocker).
 *
 * FROZEN AT THE FIRST BUILD, on the snapshot object the job screen holds across renders: once the
 * debrief is on screen the app IS showing a result, so a re-render (a resize, a theme flip, a return
 * through the back button) must not grow the number.
 *
 * @param {object|null} before  the before-snapshot
 * @param {number} [now]
 * @returns {number|null} `null` when there is no stamp to measure against — an old save, or a caller
 *   that built its own before-snapshot. The debrief then prints the absence, not a 0 it never took.
 */
function jobWallMs(before, now = Date.now()) {
  if (!isObj(before)) return null;
  if (Number.isFinite(before.wallMs)) return before.wallMs;
  const at = num(before.startedAt, 0);
  if (!(at > 0)) return null;
  before.wallMs = Math.max(0, num(now, 0) - at);
  return before.wallMs;
}

/**
 * Has this job's page already been recorded? Two guards, because either one can be the only one
 * available: the SAVE is authoritative across a reload (`runs[]` is what the trophy predicates and
 * `#/stats` read), and the in-memory `before` snapshot covers the case where the page carried no
 * start stamp to key on (an old save mid-job when this landed).
 */
function jobRunRecorded(save, startedAt, before) {
  if (isObj(before) && before.runRecorded === true) return true;
  if (!(startedAt > 0)) return false;
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  return runs.some((r) => isObj(r) && r.kind === 'page' && num(r.startedAt, 0) === startedAt);
}

/**
 * **r2 blocker (ledger-invariance) — THE JOB CLOSES A PAGE, SO THE JOB RECORDS A PAGE.**
 *
 * `state.endJob` ends a completed job with `finishPage(s)` and nothing else. The flat page's
 * `finish()` (above, ~l.990) makes THREE writes at that same moment — `pushRun(makeRunRecord(…))`,
 * `checkDailyGoal`, `logForecast` — and `screens/job.js` made none of them. So the identical answers
 * that earn **Flawless Page** on `#/run/page` earned nothing in a job: `data/trophies.js:194` is
 * `someRun(r => kindOf(r) === 'page' && r.status === 'done' && items.every(isClean))`, and with no
 * `runs[]` entry that predicate is unreachable. `runs`, `forecastLog` and `trophies` are all named
 * in `js/job/state.js`'s own `LEDGER_A_KEYS`, and COMPOSED-GAME.md G7 publishes *"Streak, trophies,
 * XP, levels | unchanged"* and *"every study route … behaves identically with the layer on or off"*.
 * Playing the game cost a trophy that playing the study tool awards — and `plan.nextActionFor`
 * steers the student to the board, so the route that could earn it is the one they are steered away
 * from. This is that write, made from the lane that owns the Page Summary.
 *
 * WHY HERE and not in `js/job/*`: those modules run against `guardSave`, which makes a Ledger A
 * write THROW — correctly, that is the whole proof of `job-ledger.test.mjs`. The record is the
 * SCREEN's to write, exactly as it is on the flat page, and `jobSummaryContext` is the one function
 * `screens/job.js` calls at the terminal on every path (finish, the last push, a bag on the last
 * beat, a walk at the getaway) — so the write lands once, wherever the job ended.
 *
 * WHAT IS RECORDED is what the flat page would have recorded for the same queue and nothing more:
 * `kind: 'page'` (a job IS Today's Page — `finishPage` already counts it in `counters.pages` the
 * same way), the page's own seed, the per-item results `markItem` stored, and the same two follow-up
 * calls in the same order. The seven game fields G7 reserves (`bagged`, `posted`, `ratingDelta`,
 * `guard`, `cracked`, `tGame`, `tAnswer`) are deliberately NOT written: they are a save-budget line
 * the save lane owns (`tests/job-save.test.mjs` "THE RESERVED LINE IS STILL RESERVED"), and the
 * trophy invariance this fixes does not need one byte of them.
 *
 * ONLY A COMPLETED JOB. `debrief.complete` is `targetsLeft(s) === 0` — exactly the condition under
 * which `endJob` calls `finishPage`. A bagged or quit job leaves the rest of the page live on
 * `#/run/page`, and the flat screen writes no record for a page it did not finish either; the record
 * is then written by whichever screen closes the page, once, over the whole queue.
 *
 * @param {object} save     the save AFTER `endJob` (the live store state, or any save)
 * @param {object} debrief  `endJob`'s return value
 * @param {{queue?: object[], results?: object[], before?: object, now?: number}} [opts]
 * @returns {object|null} the pushed record, or `null` when nothing was recorded
 */
export function commitJobRun(save, debrief, opts = {}) {
  if (!isObj(save) || !isObj(debrief)) return null;
  if (debrief.complete !== true) return null;                   // the page is still open — see above
  const before = isObj(opts.before) ? opts.before : null;
  const queue = Array.isArray(opts.queue) ? opts.queue : [];
  const results = Array.isArray(opts.results) ? opts.results : pageResults(queue);
  if (!results.length) return null;                             // nothing was answered: nothing to record
  const startedAt = num(before?.startedAt, 0) || num(opts.startedAt, 0);
  if (jobRunRecorded(save, startedAt, before)) return null;     // a re-render is not a second page
  /* THE JOB'S OWN TERMINAL CLOCK, not this render's. `endJob` stamps `game.ledger.debriefAt = now`
     (the instant it closed the page) and `game.log`'s last entry carries the `day` the screen handed
     it — so the record, the daily goal and the forecast point are all filed under the day the job
     was PLAYED, even when the debrief is re-read after midnight or rebuilt from a stored snapshot.
     `debrief.at` takes precedence for when `state.debriefOf` starts carrying it (notes/run-fix.md
     Request 1); `Date.now()` is the last resort, and only for a save with no game ledger at all. */
  const log = Array.isArray(save?.game?.log) ? save.game.log : [];
  const last = log[log.length - 1];
  const submittedAt = num(debrief.at, 0) || num(save?.game?.ledger?.debriefAt, 0)
    || num(opts.now, 0) || Date.now();
  const today = (isObj(last) && typeof last.day === 'string' && last.day)
    ? last.day : todayISO(new Date(submittedAt));

  /* Marked BEFORE the write, not after: `update()` notifies every store subscriber, and a
     subscriber that re-renders the debrief would re-enter this function mid-push. The `runs[]` scan
     catches that re-entry on its own whenever the page carried a start stamp — this flag is what
     catches it when it did not. */
  if (isObj(before)) before.runRecorded = true;
  let out = null;
  const write = (s) => {
    out = pushRun(s, makeRunRecord({
      kind: 'page', id: null,
      seed: before?.seed ?? null, seedTag: before?.seedTag ?? null,
      startedAt: startedAt || submittedAt, submittedAt, results,
    }));
    checkDailyGoal(s, today);
    logForecast(s, { today });
  };
  /* Through `update()` when this IS the live store — so `applyCaps` trims `runs[]` to its 40, the
     store is marked dirty and every subscriber is notified, exactly as the flat `finish()` does.
     Handed any other save (a headless fixture), it is written in place and nothing is flushed. */
  let live = null;
  try { live = getState(); } catch { live = null; }
  if (live && live === save) { update(write); try { flush(); } catch { /* memory store */ } }
  else write(save);
  return out;
}

/**
 * Build the Page Summary context for a finished job. Everything is optional and everything degrades:
 * with no before-snapshot the deltas read ±0 and no tile is claimed as minted, which is the honest
 * reading when nobody took one.
 *
 * `queue` must be the job's queue as it stood BEFORE `endJob` (a completed job's `finishPage` clears
 * `inProgress`), which is why it is a parameter and not a read.
 *
 * @param {object} save     the save AFTER `endJob`
 * @param {object} debrief  `endJob`'s return value
 * @param {{queue?: object[], before?: object, results?: object[], elapsedMs?: number,
 *          decisions?: ('bag'|'push')[], guard?: object|null, seedTag?: string|null}} [opts]
 */
export function jobSummaryContext(save, debrief, opts = {}) {
  const queue = Array.isArray(opts.queue) ? opts.queue : (Array.isArray(save?.inProgress?.queue) ? save.inProgress.queue : []);
  const results = Array.isArray(opts.results) ? opts.results : pageResults(queue);
  const before = isObj(opts.before) ? opts.before : (pageBefore(save?.inProgress) ?? {
    skills: skillStates(save), readiness: { r: readiness(save).r, provisional: !!readiness(save).provisional },
    xp: save.xp, coverage: coverageCount(save), tiles: {},
  });
  /* r2 — THE THREE WRITES A FINISHED PAGE MAKES, made here because a job's finish makes none of
     them (see `commitJobRun`). It runs BEFORE the after-snapshot for the same reason the flat
     `finish()` reads `after` off the save `update()` returned: `checkDailyGoal` can meet the goal
     and stamp the streak, and the Summary must print the save as it now stands, not as it stood one
     statement ago. Idempotent, so a re-render of the debrief adds nothing. */
  commitJobRun(save, debrief, { queue, results, before, now: num(opts.now, 0) });
  const after = { skills: skillStates(save), readiness: readiness(save), xp: save.xp, coverage: coverageCount(save) };
  const tileIds = tileIdsOf(queue);
  return {
    kind: 'job',
    run: { title: kindMeta('job')?.title ?? 'The Job', subtitle: null, back: '/today', items: queue, id: null, seedTag: opts.seedTag ?? null, meta: {}, limitMs: 0 },
    results, sum: summarizeRun(results), before, after,
    tilesBefore: isObj(before.tiles) ? before.tiles : {},
    tilesAfter: tileSnapshot(save, tileIds),
    outcome: { jump: null, dailyXp: 0 },
    save,
    elapsedMs: num(opts.elapsedMs, num(debrief?.wall, 0)),
    /* r1 — the independent wall clock, or null. Kept BESIDE `elapsedMs` rather than folded into it:
       `elapsedMs` feeds the flat Summary's `Time` fact and the BLITZ hero, and neither of those may
       change meaning because the game layer learned a second clock. */
    /* `debrief.at` is the terminal `now` `endJob` was given. `state.debriefOf` does not carry it
       today (notes/run-fix.md Requests → `js/job/state.js`), so this falls back to the instant the
       context is built and the measurement then also contains the endJob → render transition —
       which IS a window where the app is neither accepting input nor showing a result, so it
       belongs in the number; it just makes the number coarser than it needs to be. The day the
       stamp lands, this line gets exact with no other edit. */
    wallMs: Number.isFinite(opts.wallMs) ? opts.wallMs : jobWallMs(before, num(debrief?.at, Date.now())),
    job: debrief,
    jobOpts: { decisions: opts.decisions ?? null, items: queue, guard: opts.guard ?? null },
  };
}

/**
 * Render the debrief. `ctx` is `jobSummaryContext`'s output (or any Page Summary context with `job`
 * set) — the same function the flat Page Summary uses, which is the whole point.
 */
export function renderJobSummary(host, ctx) {
  return renderSummary(host, ctx);
}

/* ------------------------------------------------------------------ the two debrief blocks */

/**
 * **J8 — the split line in the debrief.** `state.debriefOf` measures the two accumulators over every
 * phase the job has *finished*; the one phase it cannot measure about itself is the debrief the
 * student is reading while this line renders, because that duration is still in their future. G1's
 * fixed-phase table counts it (`debrief: 65` of the JOB column's 160 s), the board's projection
 * spends it, and the wall clock on the primary button includes it — so a line that dropped it would
 * print a number 5.4 points under the one the board printed 12 minutes earlier, on the same session.
 *
 * So the debrief phase is credited from the student's OWN rolling mean (`game.ledger.phaseMeans
 * .debrief`, the shipped 65 s until they have jobs behind them) — the same device, from the same
 * save key, that the board's projection uses — and BOTH numbers print: the credited session split as
 * the value, the measured-so-far split beside it. Nothing here is stored; the line is a pure read.
 *
 * `idle` is G9 #1's "0 ms of any state where the app is neither accepting input nor showing a
 * result": every phase of `PHASE_ORDER` is classified as GAME or ANSWER seconds by `setPhase`, so
 * the sum of the two accumulators should be the WHOLE job, and anything the job's own wall clock
 * has that the accumulators do not is time the app spent in no state at all.
 *
 * **r1 — that subtraction now uses a clock that is not the accumulators.** `opts.wall` is
 * `jobWallMs(before)`: `inProgress.startedAt` (armed in the same statement as the first `phaseAt`)
 * to the instant the debrief context was built. The previous expression subtracted `measuredWall`
 * from `job.wall` — and `state.debriefOf` *derives* `wall` as `tGame + tAnswer`, so it was `x − x`
 * and printed `0 ms idle` for every session the app can produce, measurement-shaped and measuring
 * nothing. Without `opts.wall` there is no second clock, so `idleMeasured` is false and the debrief
 * prints the absence rather than a 0 it never took.
 *
 * @param {object} job   a `state.debriefOf` object
 * @param {object} [save]  for `game.ledger.phaseMeans.debrief`
 * @param {{wall?: number|null}} [opts]  the independent wall clock (`ctx.wallMs`)
 * @returns {{split:number, measured:number, credit:number, game:number, wall:number, idle:number,
 *            idleMeasured:boolean}}
 */
export function sessionSplit(job, save = null, opts = {}) {
  const tGame = Math.max(0, num(job?.tGame, 0));
  const tAnswer = Math.max(0, num(job?.tAnswer, 0));
  const means = save?.game?.ledger?.phaseMeans;
  const credit = Math.max(0, num(means?.debrief, JOB_PHASE_MEANS.debrief)) * 1000;
  const game = tGame + credit;
  const wall = game + tAnswer;
  const measuredWall = tGame + tAnswer;
  /* `Number.isFinite`, NOT `Number(x)`: `Number(null)` is 0, and a null clock coerced to 0 would put
     the tautology straight back — an unmeasured job would print `0 ms idle` again. */
  const spanned = opts?.wall;
  const idleMeasured = Number.isFinite(spanned) && spanned >= 0;
  return {
    split: wall > 0 ? game / wall : 0,
    measured: measuredWall > 0 ? tGame / measuredWall : 0,
    credit, game, wall,
    idle: idleMeasured ? Math.max(0, Math.round(spanned - measuredWall)) : 0,
    idleMeasured,
  };
}

/** The take: the bag drop, the fee line, `COPY.walk`, the rating delta, the split, the decision count. */
function jobTakeBlock(job, ctx) {
  const wrap = h('div.sum-job-take', { role: 'group', 'aria-label': 'The take' });
  const bagged = jobEcon.round(num(job.finalBagged ?? job.bagged, 0));
  const base = jobEcon.round(num(job.baseBagged, bagged));
  const bonus = num(job.bonusRate, 0);
  const ratingAfter = num(job.ratingAfter, num(ctx.save?.player?.rating?.value, 5));
  // the pre-first-call snapshot, not `endJob`'s own read — see `captureJobBefore`
  const ratingBefore = num(ctx.before?.rating, num(job.ratingBefore, ratingAfter));
  const rDelta = ratingAfter - ratingBefore;
  const rank = jobCall.rankNameFor(ratingAfter);
  const shape = job.shape ?? 'JOB';
  const published = jobEcon.decisionCount(JOB_SHAPES[shape] ? shape : 'JOB');
  const perItem = num(job.perItem, 0);
  const split = sessionSplit(job, ctx.save, { wall: ctx.wallMs });   // J8 — the split line (see below)

  /* The numerals the drop cascades into. Each glyph is its own span so the fall staggers by column —
     G6: "the LOOSE numerals fall column by column into BAGGED", 40 ms apart. */
  const digits = h('span.sum-bag-digits.mono.fs-5', { 'aria-hidden': 'true', style: BAG_DIGITS_CSS },
    ...String(bagged).split('').map((ch, k) => h('span.sum-bag-digit', { dataset: { k: String(k) }, style: { display: 'inline-block' } }, ch)));

  /* "the fee line struck through if it did not apply" (G6). The getaway bag is free (G2), so on every
     outcome that reaches the getaway the fee is 0 and the line is struck. */
  const feeFree = job.outcome === 'completed' || job.outcome === 'cracked' || job.outcome === 'walked'
    || job.outcome === 'commit' || job.outcome === 'quiet22';
  const feeNode = feeFree
    ? h('s.sum-bag-fee.mono.muted.fs-1', { dataset: { applied: 'false' } }, 'fee 0')
    : h('span.sum-bag-fee.mono.muted.fs-1', { dataset: { applied: 'true' } }, `auto-banked at ${Math.round(JOB_AUTO_BAG.walk * 100)} %`);

  wrap.append(
    h('h2.fs-3', 'The take'),
    h('p.sum-bag-line', { style: BAG_LINE_CSS },
      h('span.sum-bag-k.muted.fs-1', 'BAGGED'),
      digits,
      h('span.sum-bag-n.mono.sr-only', String(bagged)),
      feeNode,
      bonus > 0 ? h('span.sum-bag-bonus.mono.fs-1', `${base} +${Math.round(bonus * 100)} %`) : null,
    ),
    h('p.sum-job-walk.mono', JOB_COPY.walk({
      bagged, rating: ratingAfter.toFixed(2), rank,
      thinking: mmss(job.tAnswer), deciding: mmss(job.tGame), decisions: job.decisions,
    })),
    h('dl.sum-facts.sum-job-facts',
      fact('Rating', ratingAfter.toFixed(2), `${rank} · ${rDelta >= 0 ? '+' : '−'}${Math.abs(rDelta).toFixed(2)}`),
      fact('Split', pct1(split.measured),
        `${mmss(job.tGame)} deciding / ${mmss(job.tAnswer)} thinking · ${pct1(split.split)} with this screen · ${
          split.idleMeasured ? `${split.idle} ms idle` : 'idle not measured'}`),
      fact('Decisions', String(job.decisions), `${perItem.toFixed(1)} per item · ${published.mandatory} mandatory / ${published.full} full use`),
      fact('Posted', String(jobEcon.round(num(job.posted, 0))), `${num(job.targets, 0)} of ${num(job.of, 0)} targets`),
    ),
  );
  return wrap;
}

/**
 * r1 — the one line that tells the reader which board the bars above belong to.
 *
 * `guardDist` is computed from the heat window `endJob` has ALREADY folded this job's press into, so
 * the bars are the redraw, not the draw. `thisJobDist` is the distribution the guard was actually
 * drawn from, if the caller kept it (`inProgress.game.guard.dist`); with it, the drawn wing prints
 * the probability it really came up at, which is the whole of the r1 finding.
 *
 * @param {string|null} wing  the wing the guard drew this job
 * @param {Record<string, number>|null} [thisJobDist]  the distribution it was drawn FROM
 */
export function guardNote(wing, thisJobDist = null) {
  const head = 'next board’s odds, after tonight’s press';
  if (!wing) return `${head} · no guard drew this job`;
  const p = isObj(thisJobDist) ? Number(thisJobDist[wing]) : NaN;
  const at = Number.isFinite(p) ? ` at ${Math.round(p * 100)} %` : '';
  return `${head} · drawn this job: ${wing}${at}`;
}

/** The ledger half: both regret lines, the guard redraw, the Fault Index deltas, the rating window. */
function jobLedgerBlock(job, ctx) {
  const wrap = h('div.sum-job-ledger', { role: 'group', 'aria-label': 'The ledger' });
  const save = ctx.save;
  const o = isObj(ctx.jobOpts) ? ctx.jobOpts : {};
  const guardWing = o.guard?.wing ?? job.entry?.guard ?? null;
  const decisions = Array.isArray(o.decisions) ? o.decisions : inferDecisions(job, { items: o.items ?? [], guardWing }).decisions;
  const regret = jobRegret(job, {
    decisions, items: o.items ?? [], guardWing,
    qHatOf: (c) => (c?.skill ? jobCall.qHatFor(save, c.skill, { cards: cardById }) : null),
  });

  const lines = h('ul.sum-regret', { style: { listStyle: 'none', margin: '0', padding: '0', display: 'grid', gap: '4px' } });
  if (regret.bagpush.line) lines.append(h('li.sum-regret-line.mono.fs-1', { dataset: { kind: 'bagpush' } }, regret.bagpush.line));
  if (regret.call.line) lines.append(h('li.sum-regret-line.mono.fs-1', { dataset: { kind: 'call' } }, regret.call.line));
  if (lines.childNodes.length) wrap.append(h('h2.fs-3', 'The line you did not take'), lines);

  /* The guard redraw (G6 #3): the distribution as it stands AFTER this job's press was folded into the
     heat window — real new information, not a replay of the bars you already pressed against. Every bar
     is laid out at its final size and only its fill is transformed, so the redraw shifts nothing.

     r1 — THE BARS ARE NEXT BOARD'S ODDS, AND NOW THE PAGE SAYS SO. `guardDist` reads the heat window
     `endJob` has already folded this job's press into, so a heading of "The guard" over a note reading
     "drawn this job: ALGEBRA" read as *these are the odds, this is the one that came up* — and the
     drawn wing's bar is painted `--warn`, which is exactly the reading a highlight invites. A player
     guarded at a uniform 25 % saw "ALGEBRA 31 % · drawn this job: ALGEBRA". The intent was true and
     lived only in this comment; it is now in the heading and in the note. This job's own distribution
     is printed beside the wing whenever the caller passes it (`opts.guard.dist`) — `endJob` does not
     carry it out of the machine, so a caller that has it must hand it over (see notes/run-fix.md
     Requests → `screens/job.js`). */
  const dist = jobGuard.guardDist(save, jobGuard.epsFor(save), JOB_GUARD.cap);
  const bars = jobGuard.guardBars(dist);
  if (bars.length) {
    wrap.append(h('h2.fs-3', 'The guard · next board'), h('ul.sum-guard-bars', { style: GUARD_BARS_CSS },
      ...bars.map((bar) => h('li.sum-guard-bar', { dataset: { wing: bar.wing, drawn: String(bar.wing === guardWing) }, style: GUARD_BAR_CSS },
        h('span.sum-guard-wing.fs-1', bar.wing),
        h('span.sum-guard-track', { style: GUARD_TRACK_CSS },
          h('span.sum-guard-fill', {
            style: { ...GUARD_FILL_CSS, background: bar.wing === guardWing ? 'var(--warn)' : 'var(--muted)', transform: `scaleX(${clamp(num(bar.p, 0), 0, 1)})` },
          })),
        h('span.sum-guard-pct.mono.fs-1', `${bar.pct} %`)))));
    wrap.append(h('p.sum-guard-note.muted.fs-1', guardNote(guardWing, o.guard?.dist ?? null)));
  }

  /* The Fault Index deltas — static text at its final width, so there is nothing to shift. */
  const idxAfter = jobIndex.indexProgress(save);
  const idxBefore = isObj(ctx.before?.index) ? ctx.before.index : null;
  const dOf = (k) => (idxBefore ? num(idxAfter[k], 0) - num(idxBefore[k], 0) : 0);
  wrap.append(h('h2.fs-3', 'Fault Index'), h('dl.sum-facts.sum-index-facts',
    fact('Sealed', `${idxAfter.sealed} / ${idxAfter.total}`, deltaText(dOf('sealed'))),
    fact('Live', String(idxAfter.live), deltaText(dOf('live'))),
    fact('Resolutions', String(idxAfter.resolutions), deltaText(dOf('resolutions'))),
  ));
  const wasSealed = new Set(Array.isArray(ctx.before?.tags) ? ctx.before.tags : []);
  const newlySealed = jobIndex.sealedOf(save).filter((t) => !wasSealed.has(t));
  for (const tag of newlySealed.slice(0, 3)) wrap.append(h('p.sum-index-sealed.mono.fs-1', JOB_COPY.sealed({ tag })));

  const n = num(save?.player?.rating?.n, 0);
  wrap.append(h('p.sum-job-rating.mono.muted.fs-1', JOB_COPY.ratingLine({ rating: num(job.ratingAfter, 5).toFixed(2), n, N: jobCall.WINDOW_N })));
  if (num(job.left, 0) > 0) wrap.append(h('p.sum-job-left', JOB_COPY.leftOnPage({ left: num(job.left, 0) })));
  wrap.append(h('p.sum-job-deflation.muted.fs-1', JOB_COPY.deflation()));
  return wrap;
}

/* ------------------------------------------------------------- G5 #1 — TOMORROW'S BOARD */

/** The same wall-clock moment, one day on. `setDate` is what keeps it honest across a DST boundary. */
function oneDayOn(now) {
  const d = new Date(num(now, Date.now()));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * **G5 #1 — "Tomorrow's board is computable tonight, so it is printed tonight."**
 *
 * The design ranks its retention hooks in descending strength and this is #1; it is also the ground
 * G5 stands on when it allows the layer's single use of variable reinforcement (*"the hook is
 * knowing, which is the opposite of a loot box"*). r1 found it unbuilt — no `dueList` call existed
 * anywhere under `js/screens/`, and G8's J6b acceptance never listed the line, so no ticket owned it.
 *
 * Everything here is READ from the three modules tomorrow's board will itself read, so the line is a
 * schedule rather than a teaser and a reviewer can recompute every numeral from the save (G9 #4):
 *
 *   - **locks** — `schedule.dueList(save, {now: tomorrow})`, split into the genuinely overdue (cold)
 *     and the ones the test sweep pulls forward, because those are different claims.
 *   - **posted** — `econ.postedFor` at the *floor*: no tokens on any wing, nothing guarded, no ×2,
 *     priced as the due reviews they are (`scope 1.25`). Tomorrow's press and tomorrow's draw have
 *     not happened, so every decision the student makes tomorrow can only move this number up.
 *     It sums EVERY lock `dueList` returns — no draft, no shape cap — so it is not the same measure
 *     as the take block's `Posted` fact (one drafted job) and `tomorrowLine` does not print it under
 *     that word. The field keeps the name; the sentence says `worth N if you took them all` (r3).
 *   - **the safe wing** — the run of most-recent jobs in `game.log` that a wing did NOT draw. Jobs
 *     that posted nothing carry `guard: null` and are dropped: they are not evidence either way.
 *   - **the tags** — `index.tellFor`'s own most-triggered unsealed tag for each named make, which is
 *     exactly what tomorrow's envelope will print as its tell.
 *
 * THE CLOCK is this moment tomorrow, not midnight: a student who finishes a job at 20:00 is told
 * what is on the board when they next sit down, and `dueList` derives its own `today` and `D` from
 * the same stamp, so the sweep window is tomorrow's too.
 *
 * Every clause degrades on its own and the function never throws: no dues prints no lock clause, an
 * empty log prints no safe-wing clause, a make with no live tag brings no tag.
 *
 * @param {object} save
 * @param {{now?: number, at?: number}} [opts]  `at` overrides the computed tomorrow (tests)
 */
export function tomorrowBoard(save, opts = {}) {
  const now = num(opts.now, Date.now());
  const at = num(opts.at, oneDayOn(now));
  let dues = [];
  try { dues = dueList(save, { now: at }); } catch { dues = []; }

  /* `tellDetail` walks `save.errors` once per make; memoised so a 60-lock board walks it ≤ 19 times. */
  const tells = new Map();
  const tellOf = (skill) => {
    if (!skill) return null;
    if (!tells.has(skill)) {
      let d = null;
      try { d = jobIndex.tellDetail(save, skill, { cards: cardById }); } catch { d = null; }
      tells.set(skill, d);
    }
    return tells.get(skill);
  };

  const byMake = new Map();
  let posted = 0, cold = 0, swept = 0;
  for (const it of dues) {
    const card = cardById[it.id] ?? (it.forCard ? cardById[it.forCard] : null);
    const skill = (card?.skills || [])[0] ?? null;
    posted += jobEcon.postedFor({
      tier: num(card?.tier, 1),
      bucket: num(it.bucket, 0),
      overdueDays: num(it.overdue, 0),
      scopeFlags: { isReview: true },
      tell: tellOf(skill)?.record ?? null,
    });
    if (it.sweep) swept++; else cold++;
    if (skill) byMake.set(skill, num(byMake.get(skill), 0) + 1);
  }

  const makes = [...byMake.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 2)
    .map(([skill, locks]) => ({ skill, locks, name: jobIndex.makeName(skill) }));

  const drawn = (Array.isArray(save?.game?.log) ? save.game.log : [])
    .map((e) => (typeof e?.guard === 'string' ? e.guard : null)).filter(Boolean);
  let safe = null;
  for (const w of JOB_WING_IDS) {
    let n = 0;
    for (let i = drawn.length - 1; i >= 0 && drawn[i] !== w; i--) n++;
    if (n > 0 && (!safe || n > safe.jobs)) safe = { wing: w, jobs: n };
  }

  const tags = [];
  for (const m of makes) {
    const t = tellOf(m.skill)?.tag ?? null;
    if (t && !tags.includes(t)) tags.push(t);
  }

  /* "one tap to `#/run/drill` on the NAMED weak skill" — the weakest of the two makes tomorrow
     brings, by `readiness.weakSpots()`'s own order; the heaviest make when neither is flagged weak. */
  const weak = new Set(weakSpots(save).map((s) => s.id));
  const pick = makes.find((m) => weak.has(m.skill)) ?? makes[0] ?? null;

  return {
    at, locks: dues.length, cold, swept, posted: jobEcon.round(posted), makes, safe, tags,
    drill: pick ? { skill: pick.skill, name: pick.name, weak: weak.has(pick.skill), href: `#/run/drill/${pick.skill}` } : null,
  };
}

/**
 * `tomorrowBoard`'s one printed line — G5's own shape, with every clause droppable.
 *
 * **The worth clause is not called `posted` (r3).** G5 #1's illustrative line reads `posted 186` on a
 * 7-lock board, where the whole backlog IS a job. On a real backlog it is not: `tomorrowBoard` sums
 * `econ.postedFor` over EVERY lock `dueList` returns (43 locks, no draft, no shape cap), while the
 * take block four lines up prints `Posted 516 · 3 of 5 contracts, 10 targets` — one drafted job. Two
 * different quantities under one word, with `COPY.deflation` (*"posted falls as you master the
 * material"*) printed between them, read as a flat contradiction: 516 tonight, 956 tomorrow. So the
 * backlog figure says what it is — **`worth N if you took them all`** — and the only number on the
 * debrief labelled `posted` is the job's own, which is the one the deflation line is about.
 */
export function tomorrowLine(t) {
  const on = t.makes.length ? ` on ${t.makes.map((m) => m.skill).join(' + ')}` : '';
  const s = (n) => (n === 1 ? '' : 's');
  const clauses = [];
  if (t.cold > 0) clauses.push(`${t.cold} cold lock${s(t.cold)}${on}${t.swept > 0 ? ` + ${t.swept} swept` : ''}`);
  else if (t.swept > 0) clauses.push(`${t.swept} swept lock${s(t.swept)}${on}`);
  else clauses.push('nothing due — new locks only');
  if (t.locks > 0) clauses.push(t.locks === 1 ? `worth ${t.posted} if you take it` : `worth ${t.posted} if you took them all`);
  if (t.safe) clauses.push(`${t.safe.wing} has been safe ${t.safe.jobs} job${s(t.safe.jobs)} running`);
  if (t.tags.length) clauses.push(`bringing ${t.tags.join(', ')}`);
  return `Tomorrow’s board: ${clauses.join(' · ')}`;
}

/** The debrief's LAST line (G5 #1), plus its one tap. */
function jobTomorrowBlock(ctx) {
  /* Laid out here rather than in `screens.css`, the way the other debrief blocks are (`sum-regret`,
     the guard bars): this screen does not own the stylesheet. notes/run-fix.md Requests → T16. */
  const wrap = h('div.sum-job-tomorrow', { role: 'group', 'aria-label': 'Tomorrow’s board', style: { display: 'grid', gap: '8px', justifyItems: 'start' } });
  let t = null;
  try { t = tomorrowBoard(ctx.save); } catch (e) { console.warn('run: tomorrow’s board', e); return wrap; }
  wrap.append(h('p.sum-tomorrow-line.mono.fs-1', { style: { margin: '0' } }, tomorrowLine(t)));
  if (t.drill) {
    wrap.append(h('a.btn.sum-tomorrow-drill', { href: t.drill.href }, `Drill 5 · ${t.drill.skill}`));
  }
  return wrap;
}

/* ------------------------------------------------------------------ the bag drop */

/**
 * THE BAG DROP (G6's one signature moment for the layer, G10 #13, G12 #32).
 *
 * 600 ms, `transform` + `opacity` only, in place, never full-screen, once per job — and **the only
 * thing animating while it runs**: every other animation in the document is paused for the duration
 * and resumed after, except the header's own `#hdr-bag` drop (`[data-drop]`), which is this same cue
 * in the other column. The screen underneath stays live the whole time.
 *
 * @returns {{cancel: () => void, animations: Animation[], held: number}}
 */
export function startBagDrop(root, job, ms = bagDropMs()) {
  const box = root?.querySelector?.('.sum-bag-digits') ?? null;
  if (!box || box.dataset.dropped === 'true') return { cancel: () => {}, animations: [], held: 0 };
  /* ANIMATION.bagDrop.oncePerJob. The guard lives on the HOST, not on the section, so re-rendering the
     same debrief (a resize, a theme flip, a re-entry from the back button) does not replay it — a
     second element would otherwise be a second first time. */
  const host = root.parentElement ?? root;
  const sig = jobSignature(job);
  if (host.dataset.bagDrop === sig) return { cancel: () => {}, animations: [], held: 0 };
  host.dataset.bagDrop = sig;
  box.dataset.dropped = 'true';
  const glyphs = [...box.querySelectorAll('.sum-bag-digit')];
  if (!(num(ms, 0) > 0) || !glyphs.length || typeof glyphs[0].animate !== 'function') return { cancel: () => {}, animations: [], held: 0 };

  const stagger = JOB_ANIMATION.bagDrop.staggerMs;
  const dur = Math.max(120, ms - stagger * Math.max(0, glyphs.length - 1));
  const from = JOB_ANIMATION.bagDrop.translate;                   // '-1.2em'
  const animations = glyphs.map((el, k) => el.animate(
    [{ transform: `translateY(${from})`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
    { duration: dur, delay: k * stagger, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
  ));
  const cancelHold = holdEverythingElse(root, animations, ms);
  return { cancel: () => { cancelHold(); for (const a of animations) { try { a.finish(); } catch { /* done */ } } }, animations, held: cancelHold.held ?? 0 };
}

/**
 * Pause every animation in the document except the bag drop's own and the header's `[data-drop]` cue,
 * for `ms`, then resume them. This is what makes "the only element animating" enforceable rather than
 * a convention: it does not matter what a later ticket adds to this screen.
 */
function holdEverythingElse(root, exempt, ms) {
  const scope = root?.ownerDocument?.body ?? root;
  const noop = () => {};
  if (!scope || typeof scope.getAnimations !== 'function' || !(num(ms, 0) > 0)) { noop.held = 0; return noop; }
  const keep = new Set(exempt);
  const held = [];
  for (const a of scope.getAnimations({ subtree: true })) {
    if (keep.has(a)) continue;
    const el = a.effect?.target ?? null;
    if (el?.closest?.('[data-drop]')) continue;              // the header column's half of the same cue
    try { a.pause(); held.push(a); } catch { /* not pausable */ }
  }
  const resume = () => { for (const a of held) { try { a.play(); } catch { /* gone */ } } };
  const t = setTimeout(resume, ms);
  const cancel = () => { clearTimeout(t); resume(); };
  cancel.held = held.length;
  return cancel;
}

export default mountRun;
