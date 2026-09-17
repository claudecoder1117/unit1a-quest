// plan.js — the study plan (COMPOSED S7 "Plan", S1 "Week"). Pure maths + one DOM painter for the strip.
//
//   R  = TIER-WEIGHTED uncleared work: each uncleared original counts {1: ⅙, 2: ½, 3: 1, 4: 1}[tier]
//        (a 10-second ASN card is not a 5-minute diagram), each uncleared family tile counts 3, Bonus never.
//        A "Full 36" or BLITZ clear counts as a clear (readiness.js `isCleared` reads the history).
//   q  = ceil(R / max(D − 1, 1)), capped 40; 12 when there is no test date.
//        When q > 12 the strip WARNS and visibly LOWERS the target (M1 micro-cards drop to "flash only",
//        tier-4 cards spread to one per day) instead of silently scheduling 40.
//   The per-day floor of 2 M11/M12 Variants (ALGEBRA_FLOOR) keeps the doc's named algebra topic on the plan;
//   page.js enforces it (LIMITS.algebraFloor) — this module owns the number and the copy.
//
// Edge cases (all unit-tested in tests/plan.test.mjs):
//   no date → strip hidden, q = 12 · D ≤ 1 → Night Before / Test Morning replace the page ·
//   D = 0 after testTime + 90 min → Post-test · past date → Post-test · changing the date recomputes and
//   never resets progress · Mock available from day 1 on demand, offered by the plan from D − 4.
//
// Node-importable: nothing here touches `document` at module scope, and this file deliberately does NOT
// import js/app.js (that module boots the shell). `fillPlanStrip` is the only DOM function and it builds
// its nodes with document.createElement, guarded.
//
// R and q are also computed by page.js (`qFor`) because the composer needs them at compose time. The two
// are pinned equal by tests/plan.test.mjs — if they ever drift, that test goes red.

import { todayISO, daysUntilTest, addDays, weekday, testMoment, diffDays } from './days.js';
import { cards as ALL_CARDS } from '../data/cards.js';
import { moduleById, families, bossById } from '../data/modules.js';
import { isBonus } from '../data/source-manifest.js';
import { familyRarity } from './rarity.js';
import { isCleared } from './readiness.js';
import { bossReady, LIMITS } from './page.js';
import { latestMock } from './readiness.js';

/* ---------------- constants (S7) ---------------- */
/** Tier-weighted uncleared work (S7): a 10-second ASN or vocab card is not a 5-minute diagram. */
export const TIER_WEIGHT = Object.freeze({ 1: 1 / 6, 2: 1 / 2, 3: 1, 4: 1 });
export const FAMILY_WEIGHT = 3;
export const Q_DEFAULT = 12;          // no test date → the plan runs at 12 new a day
export const Q_WARN = 12;             // q > 12 warns AND lowers the target to this
export const Q_MAX = 40;              // hard cap on the raw number
export const ALGEBRA_FLOOR = 2;       // M11/M12 Variants a day (page.js LIMITS.algebraFloor)
export const MOCK_FROM_D = 4;         // the plan OFFERS the Mock from D − 4 (it is available from day 1)
export const SWEEP_D = 2;             // D ≤ 2 → Final Sweep: everything with bucket ≤ 2 is due
export const NIGHT_D = 1;             // D = 1 → Night Before replaces the page
export const MORNING_D = 0;           // D = 0 → Test Morning
export const POST_TEST_MS = 90 * 60 * 1000;   // … until testTime + 90 min, then Post-test
export const PLACEMENT_FULL = 8;      // placement items
export const PLACEMENT_SHORT = 4;     // … trimmed at D ≤ 2
export const PLACEMENT_SHORT_D = 2;
export const PILL_NEAR = 4;           // page-day pills before the "…" gap pill
export const TIER4_PER_DAY = 2;       // page.js LIMITS.tier4
export const TIER4_PER_DAY_LOWERED = 1;   // … one a day once the plan is lowered
export const MICRO_TIER = 1;          // tier-1 recall cards ("flash only" when lowered)

export const MODES = Object.freeze(['nodate', 'post', 'morning', 'night', 'page']);
const DOW = Object.freeze(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const round2 = x => Math.round(x * 100) / 100;
const tierOf = x => (Number.isInteger(x?.tier) && x.tier >= 1 && x.tier <= 4 ? x.tier : 2);

/** A card the plan may schedule: non-bonus, in a plannable module, with at least one skill. */
function plannable(c) {
  return !!c && !isBonus(c.id) && moduleById[c.module]?.plan !== false && Array.isArray(c.skills) && c.skills.length > 0;
}
/** Placed by placement or JUMP (S7): the plan stops scheduling it as new; it still returns as a review. */
function placedAlready(save, c) {
  return !!(save?.cards?.[c.id]?.placed || save?.jumps?.[c.module]);
}

/* ---------------- R: the tier-weighted work left ---------------- */
/**
 * workR(save) → { R, cards, counts, weights, families, familyWeight }
 * `counts` / `weights` are per tier, so the strip and the note can say WHERE the work is.
 * On a fresh save R ≈ 62.5 (S7's "≈ 61"): 109 tier-1 recall cards ≈ 18.2 · 18 factorings ≈ 9 ·
 * 16 word problems ≈ 8 · 3 named quadratics ≈ 1.5 · 5 warm-ups ≈ 2.5 · the angle/doc cards ≈ 11.3 ·
 * 4 family tiles = 12.
 */
export function workR(save) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const weights = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let R = 0, cardsLeft = 0;
  for (const c of ALL_CARDS) {
    if (!plannable(c) || isCleared(save?.cards?.[c.id]) || placedAlready(save, c)) continue;
    const t = tierOf(c);
    counts[t]++;
    weights[t] += TIER_WEIGHT[t];
    R += TIER_WEIGHT[t];
    cardsLeft++;
  }
  let fam = 0;
  for (const f of families) if (familyRarity(save?.variants?.[f.id]) == null) fam++;
  R += fam * FAMILY_WEIGHT;
  for (const t of [1, 2, 3, 4]) weights[t] = round2(weights[t]);
  // `Rexact` is the raw sum — ⅙ is not representable, so 105 of them land a few ulps off a round number.
  // q divides `Rexact` (bit-identical to page.js's own sum, so the strip and the composer can never
  // disagree); `R` is the rounded number the UI prints.
  return { R: round2(R), Rexact: R, cards: cardsLeft, counts, weights, families: fam, familyWeight: fam * FAMILY_WEIGHT };
}

/* ---------------- q: the day's new-card target ---------------- */
/**
 * qFor(save, { D }) → { R, q, qRaw, warn, target, D }
 *   qRaw = ceil(R / max(D − 1, 1))   (the honest number)
 *   q    = min(qRaw, 40)             (the cap)
 *   warn = q > 12                    (the strip says so)
 *   target = warn ? 12 : q           (what the composer actually schedules)
 * With no test date the plan runs in its no-date state: q = target = 12, never a warning.
 */
export function qFor(save, { D = daysUntilTest(save?.settings?.testDate) } = {}) {
  const { R, Rexact } = workR(save);
  if (D == null) return { R, Rexact, q: Q_DEFAULT, qRaw: Q_DEFAULT, warn: false, target: Q_DEFAULT, D: null };
  const qRaw = Math.ceil(Rexact / Math.max(D - 1, 1));
  const q = Math.min(Q_MAX, qRaw);
  const warn = q > Q_WARN;
  return { R, Rexact, q, qRaw, warn, target: warn ? Q_WARN : q, D };
}

/**
 * The visible lowering (S7: "if q > 12 the strip warns and visibly lowers the target — M1 micro-cards drop
 * to 'flash only', tier-4 cards spread to one per day — instead of silently scheduling 40").
 * → { active, q, target, microFlashOnly, tier4PerDay, headline, lines[] }
 *
 * W5 (notes/OPEN-ISSUES.md §A3): the app has no read-only flash mode, and a strip that promised one was
 * printing something the composer did not do. S7's *intent* — a heavy week is carried by the ten-second
 * recall cards — is now honoured as a share of the day: `microFlashOnly` makes `composePage` fill every
 * second new slot from the tier-1 pool (`LIMITS.microEveryLowered`) instead of every fourth, and the strip
 * line says exactly that. All three lines of the lowering are therefore true of the page that gets built.
 */
export function lowering(save, opts = {}) {
  const info = opts.q !== undefined && opts.target !== undefined ? opts : qFor(save, opts);
  if (!info.warn) {
    return {
      active: false, q: info.q, target: info.target, microFlashOnly: false, tier4PerDay: TIER4_PER_DAY,
      headline: '', lines: [],
    };
  }
  return {
    active: true, q: info.q, target: info.target, microFlashOnly: true, tier4PerDay: TIER4_PER_DAY_LOWERED,
    headline: `${info.q} new a day is more than a day holds — the target is ${info.target}.`,
    lines: [
      `The ten-second cards — vocabulary, notation, definitions — take every other new card. The long write-outs wait.`,
      `Hard diagram problems spread to ${TIER4_PER_DAY_LOWERED} a day instead of ${TIER4_PER_DAY}.`,
      `Nothing is dropped from the Binder — reviews still come back on time.`,
    ],
  };
}

/**
 * What Home / run.js should pass to `composePage(save, opts)` / `startPage(save, opts)`:
 * the lowered target, and the tier-4 budget the lowering asks for.
 */
export function composeOpts(save, opts = {}) {
  const info = qFor(save, opts);
  const low = lowering(save, info);
  return { q: info.target, tier4: low.tier4PerDay, microFlashOnly: low.microFlashOnly };
}

/* ---------------- placement size (S7 onboarding) ---------------- */
/** 8 items, trimmed to 4 when D ≤ 2. */
export function placementSize(D) {
  return D != null && D <= PLACEMENT_SHORT_D && D >= 0 ? PLACEMENT_SHORT : PLACEMENT_FULL;
}
/** The S7 copy for a tight week; '' otherwise. */
export function placementCopy(D) {
  if (D == null || D < 0 || D > PLACEMENT_SHORT_D) return '';
  return `${D} day${D === 1 ? '' : 's'}: spacing is tight — expect Readiness to top out lower.`;
}

/* ---------------- mode ---------------- */
/** Local ms of the test moment, or null. */
export function testAt(save) {
  const st = save?.settings ?? {};
  return st.testDate ? testMoment(st.testDate, st.testTime || '08:00') : null;
}

/**
 * The plan's mode for right now (S7 edge cases):
 *   'nodate'  no test date          → strip hidden, q = 12
 *   'post'    past date, or D = 0 after testTime + 90 min
 *   'morning' D = 0 before that
 *   'night'   D = 1
 *   'page'    everything else
 */
export function modeFor(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const D = daysUntilTest(save?.settings?.testDate, today);
  if (D == null) return 'nodate';
  if (D < 0) return 'post';
  const at = testAt(save);
  if (D === MORNING_D) return at != null && now > at + POST_TEST_MS ? 'post' : 'morning';
  if (D === NIGHT_D) return 'night';
  return 'page';
}

/* ---------------- pills ---------------- */
const pillHref = kind => (kind === 'morning' ? '#/morning' : kind === 'night' ? '#/night' : '#/today');

function dayState(save, iso, today) {
  if (save?.daily?.[iso]?.goalMet) return 'done';
  if (iso === today) return 'today';
  return iso < today ? 'past' : 'planned';
}

/**
 * The strip's pills, today → test day (S7: "D−n … D as pills (planned/done, Boss days ♛ …, Night Before
 * and Test Morning fixed)"). Long weeks collapse the middle into one "…" pill so seven pills always fit
 * a 343 px column; the Night and Test pills are never collapsed.
 * → [{ k, iso, offset, kind:'page'|'night'|'morning'|'gap', state, label, sub, href, planned, boss, title }]
 */
export function pillsFor(save, { today = todayISO(), D = daysUntilTest(save?.settings?.testDate, today), target = null, boss = null } = {}) {
  if (D == null || D < 0) return [];
  const plan = target ?? qFor(save, { D }).target;
  const out = [];
  const pageDays = Math.max(0, D - 1);                 // offsets 0 … D−2 are ordinary page days
  const showAll = pageDays <= PILL_NEAR + 1;
  const near = showAll ? pageDays : PILL_NEAR;
  const push = (offset, kind) => {
    const iso = addDays(today, offset);
    const k = D - offset;
    out.push({
      k, iso, offset, kind,
      state: dayState(save, iso, today),
      label: kind === 'morning' ? 'Test' : kind === 'night' ? 'Night' : `D−${k}`,
      sub: `${DOW[weekday(iso)]} ${iso.slice(8)}`,
      href: pillHref(kind),
      planned: kind === 'page' ? plan : 0,
      boss: kind === 'page' && offset === 0 && boss ? boss : null,
      title: kind === 'page'
        ? `${iso} · ${plan} new card${plan === 1 ? '' : 's'} planned${boss && offset === 0 ? ` · Boss: ${boss.name}` : ''}`
        : kind === 'night' ? `${iso} · Night Before — notation flash, final sweep, mini-mock, the sheet`
          : `${iso} · Test Morning — 5 minutes of things you already know`,
    });
  };
  for (let o = 0; o < near; o++) push(o, 'page');
  if (!showAll) {
    const skipped = pageDays - near;
    const from = addDays(today, near), to = addDays(today, pageDays - 1);
    out.push({
      k: null, iso: from, offset: near, kind: 'gap', state: 'planned',
      label: `+${skipped}`, sub: 'days', href: '#/today', planned: plan, boss: null,
      title: `${skipped} more page day${skipped === 1 ? '' : 's'} (${from} … ${to}) at ${plan} new a day`,
    });
  }
  if (D >= 1) push(D - 1, 'night');
  push(D, 'morning');
  return out;
}

/* ---------------- the plan ---------------- */
/**
 * planFor(save, { now, today }) → everything a screen needs.
 * {
 *   mode, D, today, testDate, testTime, testAt, post,
 *   R, q, qRaw, warn, target, lowering, algebraFloor, sweep,
 *   mock: { offered, available, reason }, boss,
 *   pills, strip: { visible, warn, note }, notes: string[]
 * }
 * Recompute on every Home visit and at local midnight (Home re-renders on the bus `state` event; the
 * date arithmetic is calendar-based so a midnight crossing changes D without any timer).
 */
export function planFor(save, { now = Date.now(), today = todayISO(new Date(now)) } = {}) {
  const st = save?.settings ?? {};
  const D = daysUntilTest(st.testDate, today);
  const mode = modeFor(save, { now, today });
  const info = qFor(save, { D });
  const low = lowering(save, info);
  const boss = bossReady(save)[0] ?? null;
  const bossDef = boss ? bossById[boss.id] ?? null : null;
  const scored = latestMock(save);
  const mockOffered = D != null && D >= 0 && D <= MOCK_FROM_D && !scored;
  const pills = mode === 'nodate' || mode === 'post' ? [] : pillsFor(save, { today, D, target: info.target, boss });

  const notes = [];
  if (mode === 'nodate') notes.push('No test date yet — pages run at 12 new a day. Set the date in Settings and the plan sizes itself.');
  else if (mode === 'post') notes.push('The test is done. The Binder, the Bosses and the Mock stay open.');
  else if (low.active) notes.push(low.headline);
  else if (mode === 'page') notes.push(`${info.target} new card${info.target === 1 ? '' : 's'} a day gets the packet cleared with a day to spare.`);
  if (mode === 'night') notes.push('Tonight: notation flash · final sweep · mini-mock · the sheet. 30 minutes.');
  if (mode === 'morning') notes.push('This morning: 6 notation, 2 statements, 1 factoring — all things you already know.');
  if (mockOffered) notes.push(`Mock #1 is worth one sitting now — ${D} day${D === 1 ? '' : 's'} out is when it still tells you something.`);
  if (D != null && D >= 0 && D <= SWEEP_D && mode !== 'post') notes.push('Final Sweep: everything you have not locked in is due.');

  return {
    mode, D, today, testDate: st.testDate ?? null, testTime: st.testTime ?? '08:00', testAt: testAt(save),
    post: mode === 'post',
    R: info.R, q: info.q, qRaw: info.qRaw, warn: info.warn, target: info.target, lowering: low,
    algebraFloor: ALGEBRA_FLOOR, sweep: D != null && D >= 0 && D <= SWEEP_D,
    mock: { offered: mockOffered, available: true, scored: !!scored, from: MOCK_FROM_D },
    boss, bossName: bossDef?.name ?? boss?.name ?? null,
    pills,
    strip: { visible: mode !== 'nodate' && mode !== 'post' && pills.length > 0, warn: low.active, note: notes[0] ?? '' },
    notes,
  };
}

/** One line for the console / notes / tests. */
export function describePlan(plan) {
  const pills = plan.pills.map(p => `${p.label}${p.state === 'done' ? '✓' : ''}${p.boss ? '♛' : ''}`).join(' ');
  return `${plan.mode} D=${plan.D} R=${plan.R} q=${plan.q}${plan.warn ? `→${plan.target}` : ''} | ${pills}`;
}

/* ---------------- the strip (the only DOM in this file) ---------------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * fillPlanStrip(wrap, save, { today, now, plan }) — replace the contents of Home's `#plan-strip` slot
 * with the real plan (T10 leaves the wrapper and a fallback; this is the one-line hook in home.js).
 * Returns the wrapper so the call site stays one expression. Never throws: a broken plan leaves the
 * fallback content in place.
 */
export function fillPlanStrip(wrap, save, opts = {}) {
  if (!wrap || typeof document === 'undefined') return wrap;
  let plan;
  try { plan = opts.plan ?? planFor(save, opts); } catch (e) { console.error('plan', e); return wrap; }
  wrap.dataset.mode = plan.mode;
  wrap.dataset.warn = String(plan.warn);
  wrap.hidden = !plan.strip.visible && plan.mode === 'nodate';   // S7: no date → the strip is hidden
  wrap.replaceChildren();
  if (wrap.hidden) return wrap;

  if (!plan.strip.visible) {
    const p = el('p', 'muted fs-1 plan-note', plan.notes[0] ?? '');
    wrap.append(p);
    if (plan.mode === 'post') {
      const a = el('a', 'plan-post-link', 'How did it go?');
      a.href = '#/morning';
      wrap.append(a);
    }
    return wrap;
  }

  const list = el('ol', 'plan-pills');
  for (const p of plan.pills) {
    const li = el('li', 'plan-pill');
    li.dataset.state = p.state;
    li.dataset.kind = p.kind === 'page' ? 'page' : p.kind === 'gap' ? 'gap' : 'fixed';
    if (p.state === 'today') li.setAttribute('aria-current', 'date');
    const a = document.createElement(p.kind === 'gap' ? 'span' : 'a');
    if (p.kind !== 'gap') a.href = p.href;
    a.title = p.title;
    const day = el('span', 'pill-day', p.label);
    if (p.boss) { const b = el('span', 'pill-boss', '♛'); b.title = `Boss: ${p.boss.name}`; day.append(' ', b); }
    const sub = el('span', 'pill-sub mono', p.sub);
    a.append(day, sub);
    a.setAttribute('aria-label', p.title);
    li.append(a);
    list.append(li);
  }
  wrap.append(list);

  const note = el('p', `plan-note fs-1 ${plan.warn ? 'plan-warn' : 'muted'}`);
  note.textContent = plan.strip.note;
  wrap.append(note);

  if (plan.lowering.active) {
    const ul = el('ul', 'plan-lower');
    for (const line of plan.lowering.lines) ul.append(el('li', null, line));
    wrap.append(ul);
  }
  if (plan.mock.offered) {
    const a = el('a', 'plan-mock', `Mock #1 · 20 items · 40 min`);
    a.href = '#/mock';
    wrap.append(a);
  }
  return wrap;
}

export default planFor;

/* Re-exported so a screen needs one import for "the plan and its numbers". */
export { daysUntilTest, todayISO, addDays, diffDays, LIMITS };
