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

import { todayISO, daysUntilTest, addDays, weekday, testMoment, diffDays, timeHM, isQuietHours } from './days.js';
import { cards as ALL_CARDS } from '../data/cards.js';
import { moduleById, families, bossById } from '../data/modules.js';
import { isBonus } from '../data/source-manifest.js';
import { familyRarity } from './rarity.js';
import { isCleared } from './readiness.js';
import { bossReady, LIMITS, pageIndexFor } from './page.js';
import { latestMock, readiness } from './readiness.js';
import { dueList } from './schedule.js';
// The week and quiet hours. `data/job.js` is a constants file with ZERO imports, so it adds no card
// or generator data to this module's graph (which onboard.js and night.js carry statically).
import { WEEK } from '../data/job.js';

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

/**
 * THE OPTS EVERY ROUTE THAT STARTS TODAY'S PAGE MUST PASS — `composeOpts` without `q`.
 *
 * Three routes start the same page (`screens/home.js`, `screens/run.js` and the game's `#/run/job`),
 * and CUT-BRIEF's session shape is "same queue as Today's Page, same length, same items". Two of
 * them had their own copy of the `const { q, ...rest } = composeOpts(save)` line; a third that
 * forgot it composes a DIFFERENT page, and then the game is not Today's Page at all. One function,
 * so the three cannot drift.
 *
 * `q` is dropped deliberately and is not an oversight: `page.js` derives the identical target from
 * its own `qFor` (pinned in tests/integration-w4.test.mjs), while an EXPLICIT `q` switches off
 * page.js's session budget — which turned a 25-item page into a 33-item, 44-minute one.
 *
 * @returns {{tier4:number, microFlashOnly:boolean}}
 */
export function pageOpts(save, opts = {}) {
  const { q, ...rest } = composeOpts(save, opts);
  return rest;
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

/**
 * THE ROUTE THE BROWSER IS ON, spelled the way a pill spells its destination (`#/today`), or null
 * outside a browser. The query string is dropped: `#/run/page?seed=x` is the `#/run/page` screen.
 *
 * Why this exists: a page-day pill's destination IS `#/today`, and the strip lives on `#/today`, so
 * every one of those pills is a link to the page you are already reading. That used to be a no-op
 * click; `app.js` now installs a global `sameRouteClick` handler that re-routes any anchor whose
 * href is the whole current URL, so the same tap re-mounts the screen and throws the scroll back to
 * the top — a student who has scrolled to the weak-spot list and taps a calendar chip loses their
 * place. A link to here is not a link, so `self` pills are rendered with no `href` at all
 * (`fillPlanStrip` below, and Home's fallback strip): nothing to activate, nothing to re-mount, and
 * a screen reader stops announcing "link" for a chip that goes nowhere.
 */
export function hereNow(loc = (typeof location === 'undefined' ? null : location)) {
  const raw = typeof loc?.hash === 'string' ? loc.hash : '';
  if (!raw || raw === '#') return null;
  return raw.split('?')[0].replace(/\/+$/, '') || null;
}

function dayState(save, iso, today) {
  if (save?.daily?.[iso]?.goalMet) return 'done';
  if (iso === today) return 'today';
  return iso < today ? 'past' : 'planned';
}

/**
 * The strip's pills, today → test day (S7: "D−n … D as pills (planned/done, Boss days ♛ …, Night Before
 * and Test Morning fixed)"). Long weeks collapse the middle into one "…" pill so seven pills always fit
 * a 343 px column; the Night and Test pills are never collapsed.
 * `self` is true when the pill's destination is the route the strip is being drawn on (`here`), which
 * makes it a link to this very screen — rendered without an `href`, see `hereNow`.
 * → [{ k, iso, offset, kind:'page'|'night'|'morning'|'gap', state, label, sub, href, self, planned, boss, title }]
 */
export function pillsFor(save, { today = todayISO(), D = daysUntilTest(save?.settings?.testDate, today), target = null, boss = null, here = null } = {}) {
  if (D == null || D < 0) return [];
  /* GATED ON THE FLAG (round-3 integration; CUT-BRIEF "settings.game = false returns the app to
     byte-identical COMPOSED behaviour"). `self` exists only to keep `app.js`'s same-route click
     handler off a pill, and that handler is itself gated now — so with the game OFF there is no
     handler to hide from and every pill is a link again, exactly as COMPOSED shipped it. The
     DESTINATIONS never move either way; `self` only decides whether an href is rendered. */
  const marksSelf = here != null && gameOn(save);
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
      self: marksSelf && pillHref(kind) === here,
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
      label: `+${skipped}`, sub: 'days', href: '#/today', self: marksSelf && here === '#/today', planned: plan, boss: null,
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
export function planFor(save, { now = Date.now(), today = todayISO(new Date(now)), here = null } = {}) {
  const st = save?.settings ?? {};
  const D = daysUntilTest(st.testDate, today);
  const mode = modeFor(save, { now, today });
  const info = qFor(save, { D });
  const low = lowering(save, info);
  const boss = bossReady(save)[0] ?? null;
  const bossDef = boss ? bossById[boss.id] ?? null : null;
  const scored = latestMock(save);
  const mockOffered = D != null && D >= 0 && D <= MOCK_FROM_D && !scored;
  const pills = mode === 'nodate' || mode === 'post' ? [] : pillsFor(save, { today, D, target: info.target, boss, here });

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

/* ==========================================================================================
   THE GAME GATE (designs/CUT-BRIEF.md, designs/CUT-SPEC.md)
   ==========================================================================================

   Pure policy: no DOM, no writes, and the only clock is the 22:00 close COMPOSED already had.

   TWO STRUCTURAL PROPERTIES, both asserted in tests/cut-home.test.mjs:

   1. THIS BLOCK CANNOT PRICE ANYTHING. `plan.js` imports no line of `js/job/*` — not the payoff
      table, not the session state — so it cannot read the pile, the streak, a call or a point. A
      module that cannot see a number cannot leak one onto Home.

   2. THIS BLOCK PRINTS NOTHING. The game IS Today's Page with a different top strip, so Home keeps
      the PAGE's own label and the PAGE's own sub-line; the game contributes no word and no number
      to the screen (CUT-SPEC §6 is the whole vocabulary and none of it lives on Home). `why` below
      is a DIAGNOSTIC for tests and the console, never copy — the test greps `screens/home.js` for it
      and asserts that none of the gate's seven diagnostics reaches the rendered button.

   DEMOLITION (notes/DEMOLISH.md): the shape table, the projected end time, the 22:00 refusal with
   its one-tap alternative, the REVIEW BOARD, G2's crew terminus, the bound COMMIT declaration, the
   Clean Getaway stamp and the Backcheck mint are gone with the mechanics they gated. THE CUT:
   `quietLimit`, `nightBeforeDone`, `NIGHT_BEFORE_MINUTES`, `MORNING_MINUTES` and the `.board`
   decoration `nextActionFor` hung on every action went too — nothing read one of them, and dead
   code that "might come back" is how the old layer got here.

   What is left is the one question the route has to answer: is the game on, and is there a session
   to resume?                                                                                     */

/** After this local hour no new session starts; studying is untouched. */
export const QUIET_HOUR = WEEK.quietHour;
/* `SCHOOL_WINDOW` and `inSchoolWindow` WERE HERE, and are deleted with `boardPolicy().school`
   (notes/cut-home.md R5). The school window arrived with the deleted game layer's week, COMPOSED
   names no such rule, and the whole chain — `data/job.js WEEK.schoolWindow` → `SCHOOL_WINDOW` →
   `inSchoolWindow` → `policy.school` — had exactly zero readers under `site/`, `tests/` or `qa/`.
   The 22:00 close below is the ONE clock rule that is actually read. */

/** The game is on unless the student switched it off in Settings. */
export const gameOn = (save) => save?.settings?.game !== false;

const toDate = (t) => (t instanceof Date ? t : new Date(Number.isFinite(t) ? t : Date.now()));

/** Local minute-of-day, 0 … 1439. */
export function minuteOfDay(now = Date.now()) {
  const d = toDate(now);
  return d.getHours() * 60 + d.getMinutes();
}

/** After 22:00 local — `days.isQuietHours`, so there is exactly one implementation of the question. */
export function isQuietNow(now = Date.now()) { return isQuietHours(toDate(now)); }

/** Is there a session LIVE on this save — an `inProgress.game` record? */
export const hasLiveJob = (save) => !!save?.inProgress?.game;

/**
 * IS TODAY'S PAGE ALREADY CLOSED? (round-4 exploit-hunt, MAJOR.)
 *
 * The game is Today's Page, and `page.pageIndexFor` is the study layer's own count of the pages this
 * save has closed today — the same number `page.pageSeed` deals from, so "Today's Page" is literally
 * `pageIndex === 0` and everything after it is an extra page. It costs nothing to get: `page.js` is
 * already this module's import, and this is a study fact — a count of run records — not a game one.
 * Deliberately NOT `save.game.today > 0`: a module that can read a point can leak one onto Home
 * (tests/cut-home.test.mjs block D), and this question does not need one.
 *
 * WHAT IT IS FOR. Home re-offered `#/run/job` the moment a session ended, over a page whose items
 * were 11 of 13 the ones just answered with every worked solution read — so `save.game.today` and
 * `save.player.best` counted laps, 546 a lap on the midweek save and unbounded, against 264–397 for
 * honest play of the same page. `best` is the game's only reward (CUT-SPEC §8), and a record you
 * beat by tapping the same button again is not a record. The day's first page is the one that counts.
 *
 * STUDYING A SECOND PAGE STAYS FREE. This withholds an OFFER, never a page: `page.nextAction` still
 * returns its own page action, untouched, and Home's button still runs it on `#/run/page` with the
 * study layer's own label and sub-line — which is exactly the shape the switch-off door already has.
 * The ROUTE is not gated: `#/run/job` opens on a bookmark as it always did (`jobEntryGate` is deleted
 * and stays deleted), and a LIVE session resumes into it from any hour — `nextActionFor` answers the
 * resume before it asks the week anything.
 */
export const pageSpentToday = (save, today = todayISO()) => pageIndexFor(save, today) > 0;

/**
 * Does the GAME own Today's Page right now? A record is not an owner on its own: `screens/job.js`
 * refuses to mount with the switch off, so a page handed to `#/run/job` in that state came straight
 * back to `#/today` and Today's Page was unreachable for good (round 3, `notes/cut-run.md` R3-2).
 *
 * It lives HERE because this is the door — `tests/job-ledger.test.mjs` ("only the door itself reads
 * the flag — no study module does") names `js/screens/run.js` among the files that may not read the
 * switch, and it is right to: what may cross into a study screen is this ANSWER, never the flag, so
 * nothing out there can branch a QUEUE on it. Study state is untouched either way — with the switch
 * off the record simply lies dormant, and comes back with the switch.
 */
export const jobOwnsPage = (save) => hasLiveJob(save) && gameOn(save);

/**
 * What the week allows right now. Nothing here decides WHAT is studied (COMPOSED global rule 5 — the
 * composer owns that) and nothing here locks a study door: every `post: false` names the study route
 * that is one tap away.
 *
 * `why` IS NOT COPY. It is a diagnostic for tests and the console; it names a setting, a clock or a
 * design decision, and CUT-BRIEF forbids every one of those on a student's screen. No surface
 * renders it, and `tests/cut-home.test.mjs` greps `screens/home.js` to keep it that way.
 *
 * @returns {{on, D, mode, today, now, quiet, post, kind, href, why}}
 */
export function boardPolicy(save, opts = {}) {
  const now = opts.now ?? Date.now();
  const today = opts.today ?? todayISO(new Date(now));
  const D = opts.D !== undefined ? opts.D : daysUntilTest(save?.settings?.testDate, today);
  const mode = opts.mode ?? modeFor(save, { now, today });
  const base = {
    on: gameOn(save), D, mode, today, now,
    quiet: isQuietNow(now),
    post: false, kind: 'off', href: '#/today', why: '',
  };
  if (!base.on) return { ...base, why: 'settings.game = false' };
  /* the 22:00 close wins over every other rule: no new session starts, studying is untouched */
  if (base.quiet) return { ...base, kind: 'closed', href: '#/today', why: 'after 22:00' };
  if (mode === 'nodate') return { ...base, kind: 'nodate', why: 'no test date — the plan runs at 12 new a day' };
  if (mode === 'post') return { ...base, kind: 'post', why: 'the test is done' };
  if (mode === 'morning') return { ...base, kind: 'morning', href: '#/run/morning', why: 'D = 0 — the final ledger and Go.' };
  if (mode === 'night') return { ...base, kind: 'night', href: '#/run/night', why: 'D = 1 — the Night Before replaces the page' };
  /* ONE SCORING PAGE A DAY (`pageSpentToday` above). The week posts the game over TODAY'S page; once
     that page is closed the day's extra pages are study, and Home offers them as study. */
  if (pageSpentToday(save, today)) return { ...base, kind: 'spent', href: '#/run/page', why: "today's page is closed — an extra page is study, not a score" };
  return { ...base, kind: 'game', post: true, href: '#/run/job', why: "the game is Today's Page with a different top strip" };
}

/**
 * The game's primary button, or `null` when the week posts none. The queue is Today's Page's, so the
 * label is the PAGE's own label — the game never chooses, adds, removes or reorders a question, and
 * it does not rename the button either.
 *
 * There is no `sub`. The old action carried `policy.why` as a sub-line and Home printed it, which
 * put "the game is Today's Page with a different top strip" — this document, quoted at the student —
 * under the button. The game adds no copy: Home prints the PAGE's sub-line or nothing.
 *
 * @returns {null|{kind:'job', label, href, policy}}
 */
export function jobAction(save, opts = {}) {
  const policy = opts.policy ?? boardPolicy(save, opts);
  if (!policy.post) return null;
  return {
    kind: 'job', policy, href: policy.href,
    label: typeof opts.label === 'string' && opts.label ? opts.label : "Today's Page",
  };
}

/* `jobEntryGate` WAS HERE, and it is deleted rather than left uncalled (notes/cut-home.md R2 asked
   the job screen to adopt it; its own open issue 1 named this as the alternative). It answered "may
   `#/run/job` be opened?" with the whole week — the Night Before, the Morning Of, after the test, a
   save with no test date, and every hour past 22:00 — so the route would have refused a bookmark on
   most days of the plan, and `qa/fixtures/midweek.json` (whose test date has since arrived) is a
   live demonstration: the gate refuses it, and the five job states of the layout audit could not
   reach the screen at all. The game is Today's Page with a different top strip; if the page can be
   run, the strip can be on it. What still governs the week is what Home OFFERS — `nextActionFor`
   and `jobAction` below — which is how a student actually reaches the screen, and `screens/job.js`
   still refuses on the one door CUT-BRIEF names: `settings.game`. */

/**
 * The one branch: when the week posts the game and the primary action is the PAGE, the page's button
 * becomes the game's. Every other action `page.nextAction` ranks above the page — `resume`, `warmup`,
 * `boss`, `mock`, `missed` — is a different study action and is returned UNCHANGED, so nothing the
 * game does locks a study door.
 *
 * THE SWITCH IS A DOOR. With `settings.game = false` this function returns the VERY OBJECT it was
 * given — same identity, same keys, same values — so Home cannot tell the game layer is installed
 * and COMPOSED behaviour is byte-identical (CUT-BRIEF "The Law of Two Ledgers"). The old version
 * decorated every action with `.board` even when the game was off; no surface has read `.board`
 * since the board panel was demolished, so it is gone rather than carried.
 *
 * @param {object} save
 * @param {object} act  whatever `page.nextAction(save, …)` returned
 * @returns {object} `act` itself, or the game's action over the SAME page
 */
export function nextActionFor(save, act, opts = {}) {
  /* the switch, read from the save and not from an injected policy */
  if (!gameOn(save)) return act;
  const policy = opts.policy ?? boardPolicy(save, opts);
  if (!policy.on) return act;
  /* A LIVE session is a resume to `#/run/job`, not to `#/run/page`: `state.startJob` writes
     `inProgress.kind = 'page'` (the session IS a page, with a record beside it), so `page.nextAction`
     honestly returns the flat page's href and a mid-session reload would land on the flat runner.
     The label, the kind and every other field are the study layer's and stay as they are. */
  if (act && act.kind === 'resume' && hasLiveJob(save)) return { ...act, href: '#/run/job' };
  if (!policy.post) return act;
  if (act && act.kind !== 'page') return act;
  const job = jobAction(save, { ...opts, policy, label: act?.label });
  /* `page` is the SAME object `page.nextAction` composed — not a copy, not a re-compose: the game
     never chooses, adds, removes or reorders a question. */
  return job ? { ...job, page: act?.page ?? null, from: act ?? null } : act;
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
  // The route this strip is being drawn on, so a pill that points at it is drawn as text, not a link
  // (`hereNow`). Derived here rather than passed in: Home's one call site is pinned by three suites,
  // and the strip has exactly one thing to ask the browser.
  const here = opts.here !== undefined ? opts.here : hereNow();
  try { plan = opts.plan ?? planFor(save, { ...opts, here }); } catch (e) { console.error('plan', e); return wrap; }
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
    // A pill whose destination is THIS screen gets no href: an <a> without one is not a link, is not
    // focusable and is not clickable, so `app.js`'s global same-route handler never sees it and the
    // screen is never re-mounted under a student who has scrolled. The element stays an <a> so the
    // strip's CSS (`.plan-pill a`) is untouched; the description moves to the <li>, which is a
    // listitem and announces an aria-label (an href-less <a> is generic and may not).
    if (p.kind !== 'gap' && !p.self) a.href = p.href;
    a.title = p.title;
    const day = el('span', 'pill-day', p.label);
    if (p.boss) { const b = el('span', 'pill-boss', '♛'); b.title = `Boss: ${p.boss.name}`; day.append(' ', b); }
    const sub = el('span', 'pill-sub mono', p.sub);
    a.append(day, sub);
    if (p.self && p.kind !== 'gap') { li.dataset.self = 'true'; li.setAttribute('aria-label', p.title); }
    else a.setAttribute('aria-label', p.title);
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
  // fix5:home r1 (S9 scorecard #5): Home passes hideMock when its primary button already is the Mock.
  if (plan.mock.offered && !opts.hideMock) {
    const a = el('a', 'plan-mock', `Mock #1 · 20 items · 40 min`);
    a.href = '#/mock';
    wrap.append(a);
  }
  return wrap;
}

export default planFor;

/* Re-exported so a screen needs one import for "the plan and its numbers". */
export { daysUntilTest, todayISO, addDays, diffDays, LIMITS };
