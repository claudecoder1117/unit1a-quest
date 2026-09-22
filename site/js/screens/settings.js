// screens/settings.js — #/settings (T15). Everything the student can change, plus the two things this
// app owes him: the Readiness formula in full (COMPOSED S4 — "published in Settings") and a way to get
// his own data out of the browser (S6 — an export textarea AND a real <a download>; this is a normal site).
//
// Sections, in the order they matter on a phone:
//   Look · Sound · Daily goal · Test date · While you answer · How Readiness is computed · Your data · About
//
// Nothing here is destructive without a second tap, and every write goes through store.update() so the
// save, the header and the theme stay in step.
import { h, applyTheme, getHeader, setHeader, bus, APP_VERSION } from '../app.js';
import { getState, update, exportJSON, importJSON, reset, readBackup, flags, archivedUnits, UNIT_ID } from '../store.js';
import { daysUntilTest, todayISO, parseISO, nextSchoolDay } from '../days.js';
import { play, unlock, setSound, isQuiet, isSupported as soundSupported } from '../sound.js';
import { swState, subscribe as swSubscribe, checkForUpdate, clearCaches } from '../sw-register.js';
// The formulas and the bands are printed from T10's own constants, so Settings can never publish a
// formula the app does not use (notes/T10.md: "T15 reads FORMULA_FULL / FORMULA_PROVISIONAL").
import { readiness, BANDS, FORMULA_FULL, FORMULA_PROVISIONAL } from '../readiness.js';
// THE JOB (COMPOSED-GAME G7 · J7): the game toggle and the five printed-formula panels. Every formula
// below is RENDERED FROM THE LAYER'S OWN CONSTANTS AND FUNCTIONS, exactly as the Readiness panel is
// rendered from readiness.js's — so Settings can never publish an arithmetic the game does not use.
// This screen is also the one place the EV-max table is allowed to appear before a call (Global law 6):
// it is attached to no target, so printing it teaches instead of instructing.
import {
  CALL_LEVELS, carryIndifference, ratingIndifference, disagreementBands, evMaxBands, evTable,
  argmaxCall, weightFor, informativeBand, ratingDetail, rankNameFor, rankOf, RATING, CREDIT, RANKS,
} from '../job/call.js';
import { LADDER, LOOT, CHAIN, COLD, TELL, FEE, COMPLETION, COMMIT_BONUS, SCOPE_MIRROR, X2, RUNG_ROWS, GUARD, ELO, VAULT_GRADE, CREW, CREW_RANKS, BACKCHECK, FAULT_INDEX, RANK_THRESHOLDS } from '../../data/job.js';
import { rhoFor, chainMult, coldFor, shallowQStar, guardMultFor, stakeBand, stakePeak } from '../job/econ.js';
// The guard's two published paragraphs are EXPORTED FROM THE IMPLEMENTATION (`js/job/guard.js`
// :243-247 "the published shape and the running shape are one object and cannot drift apart
// again") — and until round 3 this panel published neither: it printed a two-term x̂ law the code
// has not run since the ballast landed, and it printed the GUARD's own mixing to the student as
// "the unexploitable" press. Both are now rendered from the exports, and
// `tests/job-meta-constants.test.mjs` §R3-4/§R3-5 asserts the rendered lines against them.
import { X_HAT_FORMULA, PRESS_PANEL_COPY, CAP_PANEL_COPY } from '../job/guard.js';

/* ---------------- small builders ---------------- */

const card = (title, ...kids) => h('section.set-card', title ? h('h2.set-h', title) : null, ...kids);
const hint = (text) => h('p.set-hint', text);
const formula = (text) => h('code.set-formula', text);

/** The app's minus is U+2212, everywhere a number is printed (COMPOSED S5 · the copy tables).
 *  MODULE LEVEL since round 3 verify-1: `ratingAuditParts` is exported so a test can run the shipped
 *  line-builder against a real save, and an exported builder cannot reach a formatter that lives
 *  inside `mountSettings`. Nothing else about them changed. */
const neg = (t) => t.replace('-', '−');
const f1 = (x) => (Number.isFinite(x) ? neg(x.toFixed(1)) : '—');
const f2 = (x) => (Number.isFinite(x) ? neg(x.toFixed(2)) : '—');
const f3 = (x) => (Number.isFinite(x) ? neg(x.toFixed(3)) : '—');

/** A label + control line. The control sits on the right from 480 px up, under the label on a phone. */
function row(main, control, { id = null, note = null } = {}) {
  return h('div.set-row',
    h('div.set-row-main',
      id ? h('label.set-label', { for: id }, main) : h('span.set-label', main),
      note ? h('span.set-note', note) : null),
    h('div.set-row-control', control));
}

/** A checkbox drawn as a switch — the input stays a real checkbox for keyboard and screen readers. */
function toggle({ id, checked, disabled = false, label, onchange }) {
  const input = h('input.switch-input', {
    type: 'checkbox', id, role: 'switch', checked: !!checked, disabled: !!disabled,
    'aria-label': label,
    onchange: (e) => onchange(e.currentTarget.checked),
  });
  return h('span.switch', input, h('span.switch-track', h('span.switch-thumb')));
}

/** Plain-text inputs: kill the phone keyboard's helpfulness on JSON. */
function rawText(el) {
  el.spellcheck = false;
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocomplete', 'off');
  return el;
}

/** S4's four bands, rendered from readiness.js's own table: '< 50' 'Not ready' · '50–69' … · '≥ 85' … */
function bandRanges() {
  const b = [...BANDS].sort((x, y) => y.min - x.min);
  return b.map((band, i) => {
    if (i === 0) return [`≥ ${band.min}`, band.label];
    if (i === b.length - 1) return [`< ${b[i - 1].min}`, band.label];
    return [`${band.min}–${b[i - 1].min - 1}`, band.label];
  }).reverse();
}

/* ---------------- THE JOB's printed laws, as pure functions of the layer's own constants ----------
   These three are module-scope and EXPORTED on purpose. A panel is a DOM tree, so a test can only
   ever grep its source — and a grep proved worthless twice (round 3 found this screen publishing a
   guard law the code had not run since the ballast landed, while `tests/job-guard.test.mjs`'s test
   named "THE PUBLISHED FORMULA IS THE RUNNING ONE" asserted the exported STRING against the code
   and never looked at the surface that publishes it). Pulling the strings out into pure functions
   lets `tests/job-meta-constants.test.mjs` import and execute THE LINES THE PANEL RENDERS. */

/** `ωⱼ = min(postedⱼ, 0.25 · Σₖ postedₖ)` — the stake weighting, with `GUARD.jobWeightCap`
 *  interpolated. This is `X_HAT_FORMULA.omega` with its `cap` resolved, and the test asserts that
 *  identity, so the two cannot drift. */
const OMEGA_LAW = `ωⱼ = min(postedⱼ, ${GUARD.jobWeightCap} · Σₖ postedₖ)`;

/** guard.js's markdown backticks out, and its literal `cap` resolved to the shipped constant. */
const capResolved = (s) => String(s).replace(/`/g, '').replace(/\bcap\b/g, String(GUARD.jobWeightCap));

/**
 * The FOUR lines of the x̂ law, rendered from `guard.js X_HAT_FORMULA` — law, ω, ballast, bound.
 *
 * The ballast `β` is the half this panel used to omit, and it is not a footnote: on every window a
 * new student has, `β/denom` is 0.50 (two jobs) to 0.75 (one job), and the two-term law the panel
 * printed was out by up to 0.5625 per wing against `xHatFrom`. The same omission made the panel's
 * own next sentence ("no single job may be more than a quarter of the window") false, because
 * `ωⱼ ≤ cap·Σposted` does not bound a job's share of the window — `β` is what does.
 */
export function xHatLines() {
  return Object.freeze({
    law: capResolved(X_HAT_FORMULA.law),
    omega: OMEGA_LAW,
    ballast: capResolved(X_HAT_FORMULA.ballast),
    bound: capResolved(X_HAT_FORMULA.bound),
  });
}

/**
 * The rank bands, as a PARTITION of the rating range — printed from `RANK_THRESHOLDS`, which is the
 * array `call.rankFor` actually compares against, and never from `RANKS[i].bandTop`.
 *
 * `bandTop` is a display rounding sitting 0.1 below the next threshold (4.9 against 5.0, 6.4
 * against 6.5, 7.6 against 7.7, 8.8 against 8.9), so the printed table had four 0.1-wide holes and
 * four reachable ratings — 4.95, 6.45, 7.65, 8.85 — sat in no band at all. A window of eight clean
 * 85-calls at q̂ = 0.85 lands on 6.485, printed "6.49 · Called 2" beside a band list containing no
 * band that holds 6.49. `rankFor` was never wrong; only the printed table was unsatisfiable, and
 * after the rank ratchet the rank is the number the student reads, so it stops being cosmetic.
 *
 * @returns {ReadonlyArray<{rank:number, name:string, from:number, to:number, range:string}>}
 */
export function rankBandCells() {
  return Object.freeze(RANKS.map((r, i) => {
    const next = RANK_THRESHOLDS[i + 1];
    const last = !Number.isFinite(next);
    return Object.freeze({
      rank: r.rank,
      name: r.name,
      from: RANK_THRESHOLDS[i],
      to: last ? RATING.max : next,
      range: i === 0 ? `< ${next.toFixed(1)}`
        : last ? `≥ ${r.min.toFixed(1)}`
          : `${r.min.toFixed(1)} to < ${next.toFixed(1)}`,
    });
  }));
}

/**
 * The stake band, derived rather than retyped: `w·E[c]` is `f(u) = 40u − 160u²` in `u = q̂(1 − q̂)`,
 * which peaks at `u = 0.125` (q̂ = 0.854) and holds ≥ 80 % of that peak on `econ.stakeBand()`.
 * The panel used to print "q̂ ≈ 0.76 to 0.93" as a literal, so G3.1's claim that the band is
 * "printed with its derivation in Settings" was false twice over — nothing under `site/` imported
 * `stakeBand`/`stakePeak` at all.
 */
export function stakeBandLine() {
  const [lo, hi] = stakeBand();
  const peak = stakePeak();
  const u = peak.qHat * (1 - peak.qHat);
  return {
    lo, hi, peak,
    derivation: `u = q̂(1 − q̂),  w·E[c] = ${RATING.weightK * CREDIT.base}u − ${RATING.weightK * CREDIT.k}u²,  peak at u = ${u.toFixed(3)}`,
    band: `q̂ ${lo.toFixed(3)} to ${hi.toFixed(3)}`,
    at: `q̂ ${peak.qHat.toFixed(3)}, where w·E[c] = ${peak.value.toFixed(3)}`,
  };
}

/**
 * THE RATCHET'S AUDIT RECORD, AND WHAT "NO RECORD" LOOKS LIKE ON DISK (G9 #4, round-3 verify 1).
 *
 * `player.records.bestRating` is DECLARED in both copies of the save schema with a default of 0
 * (`data/job.js` SAVE_DEFAULTS, `store.js freshPlayer`) and `store.normalizePlayer` coerces every
 * value — absent, string, NaN, ±Infinity, object — to that same 0. So `Number.isFinite(bestRating)`
 * is TRUE on every fresh save and on every migrated save, and the guard that used to stand here
 * printed `best rating 0.00` beside a live 5.00 rating on a save that has never recorded anything.
 * Under a declared field, 0 is not a reading: it is the absence of one.
 *
 * `> 0` is the whole rule, and it is safe in both directions:
 *   · both writers (`job/state.js applyTarget` and `endJob`, and `screens/mock.js applyMockCall`)
 *     raise the high-water off `ratingDetail().value`, so any save that has ever ended a staked
 *     target holds ≥ that call's rating, and an unmeasured window alone reads `RATING.base` = 5.00;
 *   · the one value this hides is a genuine high-water of exactly 0.00 — a student whose only
 *     staked call so far was catastrophic enough to clamp the rating to the floor. That prints
 *     nothing until their next call lifts it, which UNDER-reports by one line. It never invents one,
 *     and the two states are indistinguishable on disk anyway.
 */
export const hasBestRating = (v) => Number.isFinite(v) && v > 0;

/**
 * The four parts of the rating panel's headline — the audit line G9 #4 owes the student, built here
 * rather than inline so `tests/job-meta-constants.test.mjs` can run THE SHIPPED BUILDER over a real
 * save instead of grepping the printer's source for a guard it never evaluates (which is exactly how
 * `best rating 0.00` shipped green).
 *
 * THE RANK IS READ, NOT RE-DERIVED (round 3): the game gates the 95 call and the guard multiplier on
 * `player.rank`, so this prints THAT — the rank the student actually holds — and never
 * `rankFor(value)`, which is a different number the moment the window carries no measurement.
 * `ratingDetail`'s own header says why: `value === 5.00` means either fifty measured 50-calls
 * (cowardice) or NO MEASUREMENT AT ALL, and the second is where a student who mastered their makes
 * lives. Printing that as `Called 2` demotes someone for improving. `opts.rank` holds it; `held`
 * says the hold fired.
 *
 * AND `worth` IS NOT OPTIONAL (verify round 2, the exploit-hunt and test-integrity blockers). The
 * rank is `rankFor(ceiling, { floor })` — the band of what the student's own REPORTS were worth on
 * this material, not the band of the rating they scored — so on a window whose luck ran ahead of
 * its calls this line used to print `10.00 · Called 2 · 50 of 50 informative calls` directly above
 * the panel's own legend saying 10.00 is Called 5, and nothing on the screen could reconcile them.
 * `ratingDetail().offBand` is true exactly when the printed rank is not the printed rating's band,
 * in EITHER direction, and this prints `ceiling` whenever it is, so the rank on the page is always
 * derivable from the numbers on the page (G7, G9 #4). `tests/job-call.test.mjs` §7 drives this
 * builder over a corpus of shipped windows and asserts it.
 *
 * @param {object} save
 * @returns {{live: object, value: string, rank: string, worth: string|null, best: string|null, calls: string}}
 */
export function ratingAuditParts(save) {
  const s = save ?? {};
  const live = ratingDetail(s.player?.rating?.calls ?? [], RATING.N, { rank: s.player?.rank });
  const bestRating = s.player?.records?.bestRating;
  return {
    live,
    value: f2(live.value),
    rank: rankOf(live.rank).name,
    worth: live.offBand ? ` · your calls were worth ${f2(live.ceiling)}` : null,
    best: hasBestRating(bestRating) ? ` · best rating ${f2(bestRating)}` : null,
    calls: ` · ${live.n} of ${live.N} informative calls`,
  };
}

/** The same headline as the one string the student reads — what the tests assert on. */
export function ratingAuditLine(save) {
  const p = ratingAuditParts(save);
  return `${p.value} · ${p.rank}${p.worth ?? ''}${p.best ?? ''}${p.calls}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** '2026-09-22' → 'Tuesday 22 September' (local y/m/d, same arithmetic as days.js). */
function prettyDate(iso) {
  const p = parseISO(iso);
  if (!p) return '';
  return `${DAYS[new Date(p.y, p.m - 1, p.d).getDay()]} ${p.d} ${MONTHS[p.m - 1]}`;
}
const kb = (chars) => `${(chars / 1024).toFixed(1)} KB`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------------- the screen ---------------- */

/**
 * mountSettings(params, query, ctx) → render(el) → cleanup
 * Router contract per notes/T01.md: the route handler returns a render function; the render returns a
 * cleanup function, which the shell calls on the next navigation.
 */
export function mountSettings() {
  return (el) => {
    let dlUrl = null;            // blob URL behind the <a download> currently in the DOM
    let currentJson = '';        // the save as JSON, as the export box currently shows it
    let refreshExport = () => {};   // set by dataCard(); re-reads the save into the box, size and blob
    let exportTimer = 0;
    let msgEl = null;            // the status toast
    let msgTimer = 0;
    let aboutEl = null;          // the About card, re-rendered on its own when the worker changes state
    let confirmingReset = false;

    const revoke = () => { if (dlUrl) { try { URL.revokeObjectURL(dlUrl); } catch { /* ignore */ } dlUrl = null; } };

    /** One status line for every action on the screen — a toast, so nothing on the page moves. */
    function say(text, tone = '') {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.dataset.tone = tone;
      msgEl.hidden = !text;
      clearTimeout(msgTimer);
      if (text) msgTimer = setTimeout(() => { if (msgEl) msgEl.hidden = true; }, 5000);
    }

    /* ----- Look ----- */
    function lookCard(s) {
      const opts = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
      const seg = h('div.seg', { role: 'radiogroup', 'aria-label': 'Theme' },
        ...opts.map(([value, label]) => h('label.seg-opt',
          h('input.sr-only', {
            type: 'radio', name: 'set-theme', value, checked: s.settings.theme === value,
            onchange: () => { update((st) => { st.settings.theme = value; }); applyTheme(value); },
          }),
          h('span.seg-face', label))));
      return card('Look', row('Theme', seg, { note: 'Auto follows the phone’s own light / dark setting.' }));
    }

    /* ----- Sound ----- */
    function soundCard(s) {
      const quiet = isQuiet();
      const unsupported = !soundSupported();
      const disabled = quiet || unsupported;
      const test = h('button.btn.btn-ghost', {
        type: 'button', disabled: disabled || !s.settings.sound,
        onclick: () => { unlock(); if (!play('mint')) say('Nothing to hear — sound is off or muted.', 'warn'); },
      }, 'Play a cue');
      const sw = toggle({
        id: 'set-sound', checked: s.settings.sound, disabled, label: 'Sound',
        onchange: (on) => {
          setSound(on);
          test.disabled = disabled || !on;
          if (on) { unlock(); play('correct'); }
          say(on ? 'Sound on.' : 'Sound off.', 'ok');
        },
      });
      const note = unsupported
        ? 'This browser has no Web Audio, so the app stays silent.'
        : quiet
          ? 'Quiet hours — sound is muted after 22:00. It comes back tomorrow.'
          : 'Four short synth cues: correct, wrong, a tile mint and a level-up. Nothing else makes noise.';
      return card('Sound', row('Play sounds', sw, { id: 'set-sound', note }), h('div.set-actions', test));
    }

    /* ----- Daily goal ----- */
    function goalCard(s) {
      const out = h('output.set-value.mono', { for: 'set-goal' }, `${s.settings.dailyGoal} XP`);
      const range = h('input.set-range', {
        type: 'range', id: 'set-goal', min: '100', max: '800', step: '50', value: String(s.settings.dailyGoal),
        oninput: (e) => { out.textContent = `${e.currentTarget.value} XP`; },
        onchange: (e) => {
          const v = Math.round(+e.currentTarget.value);
          update((st) => { st.settings.dailyGoal = v; });
          say(`Daily goal ${v} XP.`, 'ok');
        },
      });
      return card('Daily goal',
        h('div.set-goal', out, range, h('div.set-scale.mono', h('span', '100'), h('span', '800'))),
        hint('This is a floor, not a ceiling. It is only the bar your streak has to clear — the XP ladder is '
          + 'scaled to real play, not to this number, so going well past it is the normal day. One 12-card '
          + 'Page is about 500–600 XP, which is why the default is 400.'));
    }

    /* ----- Test date ----- */
    function dateCard(s) {
      const d = daysUntilTest(s.settings.testDate);
      const time = s.settings.testTime || '08:00';
      const dateInput = h('input.set-input', {
        type: 'date', id: 'set-date', value: s.settings.testDate || '',
        onchange: (e) => {
          const v = e.currentTarget.value || null;
          update((st) => { st.settings.testDate = v; });
          say(v ? `Test set for ${prettyDate(v)}.` : 'Test date cleared.', 'ok');
          repaintDate();
        },
      });
      const timeInput = h('input.set-input.set-input-time', {
        type: 'time', id: 'set-time', value: time,
        onchange: (e) => {
          const v = e.currentTarget.value || '08:00';
          update((st) => { st.settings.testTime = v; });
          say(`Period starts at ${v}.`, 'ok');
          repaintDate();
        },
      });
      const line = d == null
        ? 'No date yet — the header shows “set test date” and the plan runs flat at 12 items a day.'
        : d > 0 ? `T−${d} · ${prettyDate(s.settings.testDate)} at ${time}`
          : d === 0 ? `Test day · ${prettyDate(s.settings.testDate)} at ${time}`
            : `That date has passed (${prettyDate(s.settings.testDate)}). Set the next unit’s date when you have it.`;
      const setNext = () => {
        const v = nextSchoolDay(todayISO(), 2);
        update((st) => { st.settings.testDate = v; });
        say(`Test set for ${prettyDate(v)}.`, 'ok');
        repaintDate();
      };
      return card('Test date',
        row('Date', dateInput, { id: 'set-date' }),
        row('Period starts', timeInput, { id: 'set-time' }),
        h('p.set-tminus', { dataset: { tone: d != null && d >= 0 && d <= 2 ? 'warn' : '' } }, line),
        h('div.set-actions',
          h('button.btn', { type: 'button', onclick: setNext }, d != null && d < 0 ? 'Set next test date' : 'Next school day'),
          s.settings.testDate ? h('button.btn.btn-ghost', {
            type: 'button',
            onclick: () => { update((st) => { st.settings.testDate = null; }); say('Test date cleared.', 'ok'); repaintDate(); },
          }, 'Clear') : null),
        hint('The date drives the countdown, the plan and the review clamp — every card gets one more look '
          + 'before the test. Changing it recomputes the plan and never resets progress.'));
    }

    /* ----- While you answer ----- */
    function answerCard(s) {
      return card('While you answer',
        row('Call your shot',
          toggle({
            id: 'set-shot', checked: s.settings.callYourShot, label: 'Call your shot',
            onchange: (on) => { update((st) => { st.settings.callYourShot = on; }); say(on ? 'Confidence row on.' : 'Confidence row off.', 'ok'); },
          }),
          {
            id: 'set-shot',
            note: 'Adds Sure / Probably / Guess above Submit. A “Sure” that misses resets the combo and halves '
              + 'the next card’s XP, so calling Sure on everything is never the cheap play. Calibration in Stats '
              + 'only shows while this is on.',
          }),
        row('Ask for the reason on a miss',
          toggle({
            id: 'set-reason', checked: s.settings.askReasonOnMiss, label: 'Ask for the reason on a miss',
            onchange: (on) => { update((st) => { st.settings.askReasonOnMiss = on; }); say(on ? 'Reason chips on a miss.' : 'Reason chips off.', 'ok'); },
          }),
          {
            id: 'set-reason',
            note: 'On an Always / Sometimes / Never card the one-line reason is always shown. With this on, a '
              + 'wrong verdict also asks which reason it was — a correct verdict stays one tap.',
          }));
    }

    /* ----- How Readiness is computed ----- */
    function readinessCard() {
      // The live number: computed here (not read off the header) so landing straight on #/settings still
      // shows the truth. Falls back to whatever the header holds if readiness.js ever throws on a save.
      let live = null;
      try { live = readiness(getState()); } catch (e) { console.warn('readiness', e); }
      // W3 integration: push it to the header ring too, the way Home/Binder/Stats do (T01: screens push
      // what only they know). Without this a deep link straight to #/settings leaves the ring showing '—'.
      if (live) { try { setHeader({ readiness: live.r, provisional: live.provisional }); } catch { /* no shell */ } }
      if (!live) {
        const hdr = getHeader();
        live = hdr.readiness == null ? null : { r: Math.round(hdr.readiness), provisional: !!hdr.provisional, band: { label: '' } };
      }
      const now = live == null
        ? h('p.set-now.muted', 'Not scored yet — run a Page or take the Baseline and the ring fills in.')
        : h('p.set-now',
          h('strong.set-now-n.mono', String(live.r)),
          h('span', live.band && live.band.label ? `· ${live.band.label}` : ''),
          live.provisional ? h('span.muted', `· provisional${Number.isFinite(live.tested) ? ` · over ${live.tested} of ${live.skillsTotal ?? 19} skills tested` : ''}`) : null);
      const [provExpr, provTail] = String(FORMULA_PROVISIONAL).split('—');
      return card('How Readiness is computed',
        now,
        h('p', 'Readiness is one number out of 100, and it is not a vibe. This is the whole formula:'),
        formula(FORMULA_FULL),
        h('p', 'Until you have taken a Mock or the Baseline there is no accuracy to use, so the ',
          h('code', 'A'), ' term is dropped instead of being counted as zero. The ring is drawn dashed and '
          + 'labelled ', h('em', 'provisional'), ':'),
        formula(provExpr.trim()),
        provTail ? hint(provTail.trim().replace(/^./, (c) => c.toUpperCase()) + '.') : null,
        h('dl.set-legend',
          h('dt.mono', 'M'), h('dd', 'Mastery — Σ w · m_shown / 100 over the 19 skills, weighted the way the test is. A skill shows m_shown = m × min(1, n / 5), so two lucky clears never read as green. While provisional, M runs over the skills tested so far only (n ≥ 1) — an untested skill is an unknown, not a zero — skills you have got wrong or needed a hint on always count, and any other skill you have answered counts only where it raises M: its low m_shown is the starting point, not a verdict, so answering right first try without a hint never lowers the number (a hint, a wrong answer, idle-day decay and the first Mock’s switch to the full formula can). M also divides by at least 30 of the 100 weight points, so a handful of skills you are good at cannot read as the whole unit: M = Σ w · m_shown / 100 ÷ max(Σ w, 30) over the skills that count.'),
          h('dt.mono', 'A'), h('dd', 'Accuracy of your most recent Mock, × 0.8 for a mini-mock (the day-1 Baseline and the Night-Before mock).'),
          h('dt.mono', 'C'), h('dd', 'Coverage — the share of non-bonus cards cleared at least once. It is exactly your Binder fill.')),
        h('p.set-bands', ...bandRanges().flatMap(([range, label], i) => [
          i ? ' · ' : null, h('span.mono', range), ` ${label}`,
        ])),
        hint('Your first Mock switches from the provisional formula to the full one. The number can drop when '
          + 'that happens — that is what the word provisional was warning about.'));
    }

    /* ===================================================================== THE JOB (G7 · J7) ===== */

    /**
     * A multi-line formula block. `.set-formula` is authored `white-space: normal` so a one-line
     * formula wraps on a 375 px phone with a hanging indent; a pseudo-code block has to keep its own
     * line breaks, and the two inline declarations here are the whole difference. (No CSS file is
     * touched by this ticket — `css/screens.css` belongs to J12; see notes/J7.md Requests.)
     */
    const pseudo = (text) => h('pre.set-formula.mono', {
      style: { whiteSpace: 'pre-wrap', textIndent: '0', paddingLeft: '12px', overflowX: 'auto', margin: '8px 0' },
    }, text);

    /* `neg` / `f1` / `f2` / `f3` are module level — see their note at the top of this file. */
    const pc = (x) => `${Math.round(x * 100)}%`;

    /** A small table, built from the layer's own constants. Reuses the shipped `.st-table` styling. */
    function table(head, rows) {
      return h('div.table-wrap', h('table.st-table',
        h('thead', h('tr', ...head.map(c => h('th', c)))),
        h('tbody', ...rows.map(r => h('tr', ...r.map(c => (c && c.nodeType ? h('td', c) : h('td.mono', String(c)))))))));
    }

    /* ----- the one switch that kills the layer ----- */
    function gameCard(s) {
      const on = s.settings.game !== false;
      const sw = toggle({
        id: 'set-game', checked: on, label: 'The Job',
        onchange: (v) => {
          update((st) => { st.settings.game = v; });
          say(v ? 'The Job is on.' : 'The Job is off. The app is the study tool it was.', 'ok');
          paint();
        },
      });
      return card('The Job',
        row('Play the game layer', sw, {
          id: 'set-game',
          note: 'The board, the Call, the Guard, the crew, the chain and the Fault Index. Off, this is the '
            + 'study tool with nothing added: Today’s Page, Leitner, the seven Bosses, the Mock and the Night '
            + 'Before all behave exactly as they do now, and Readiness is the same number either way.',
        }),
        hint('The game never touches what the study layer records. XP, mastery, Leitner buckets, rarity tiles, '
          + 'the error log, trophies and Readiness are written at the moment you clear a card and are never '
          + 'staked, never rolled back and never forfeited. A bust costs the loose pile and nothing else.'));
    }

    /* ----- 1. How the Call is scored ----- */
    function callCard() {
      const carry = carryIndifference();
      const brier = ratingIndifference();
      const bands = disagreementBands();
      const qs = [0.50, 0.60, 0.70, 0.80, 0.90, 0.95];
      return card('How the Call is scored',
        h('p', 'Before every target you call how likely you are to clear it. One button sets two prices at '
          + 'once — what the target pays and what it is worth to your rating — and the two ladders do not always '
          + 'agree. This is both of them, in full.'),
        h('h3.set-sub', 'The two ladders'),
        table(['Call', 'W (clear)', 'P (miss)', 'Credit clear', 'Credit miss', 'Needs'],
          CALL_LEVELS.map(c => [c.id, `×${c.W.toFixed(1)}`, `×${c.P.toFixed(1)}`,
            c.creditClear > 0 ? `+${f1(c.creditClear)}` : f1(c.creditClear),
            f1(c.creditMiss), c.minRank > 1 ? `${rankNameFor(RANKS[c.minRank - 1].min)}` : '—'])),
        h('h3.set-sub', 'What it pays'),
        formula('EV = q·W − (1 − q)·P          (in units of L · ρ · m_chain · scope · wing)'),
        hint(`Indifference between the rungs falls exactly at q = ${f3(carry[0])}, ${f3(carry[1])} and ${f3(carry[2])}.`),
        h('h3.set-sub', 'What it is worth to the rating'),
        formula(`c(p, o) = ${CREDIT.base} − ${CREDIT.k}(p − o)²        o = 1 on a clear, 0 on a miss`),
        formula(`E[c] = ${CREDIT.base} − ${CREDIT.k}·[ q(1 − p)² + (1 − q)p² ]     dE/dp = 0  ⟺  p = q`),
        /* VERIFY r3 (call-propriety, MAJOR). SCOPED TO THE RATING, which is the ladder this panel is
           about. It is not true of the RANK: `call.ratingDetail` prices the rank at E[c](p, q̂) with
           q̂ the slot's stored trailing-10 clear rate, so the rank is maximised by the rung your
           RECORD supports, not by the rung you believe. The rank formula block below carries that
           clause; `tests/job-call.test.mjs` §8 measures the gap (two bands on m60 material). */
        hint(`The second derivative is −${2 * CREDIT.k}, so p = q is the unique maximum: the only way to score well on the RATING is to say `
          + `what you actually believe. On the four buttons that lands at q = ${f3(brier[0])}, ${f3(brier[1])} and ${f3(brier[2])}.`),
        h('h3.set-sub', 'Where the two disagree'),
        h('ul.set-bandlist', bands.map(b => h('li.fs-1',
          h('span.mono', `q ∈ [${f3(b.from)}, ${f3(b.to)})`),
          ` — the money says call ${b.money}, the rating says call ${b.rank}. `,
          h('span.muted', `${b.widthPoints.toFixed(1)} points wide.`)))),
        hint('Two bands, both narrow, both on purpose. They are the only place in the game where you have to pick '
          + 'what you are playing for.'),
        h('h3.set-sub', 'The EV-max rung, by true clear rate'),
        table(['q', ...CALL_LEVELS.map(c => String(c.id)), 'EV-max'],
          qs.map((q) => {
            const t = evTable(q);
            return [f2(q), ...CALL_LEVELS.map(c => f2(t[c.id])), argmaxCall(q, { rank: 5 })];
          })),
        h('p.set-bands', ...evMaxBands().flatMap((b, i) => [
          i ? ' · ' : null, h('span.mono', `≤ ${f3(b.to)}`), ` call ${b.call}`,
        ])),
        hint('This table is here and nowhere else. It never appears on an envelope, because a target that tells you '
          + 'which button to press is measuring whether you can follow instructions, not whether you know what you '
          + 'know. After the job, the debrief prints what the EV-max call would have been on each envelope you '
          + 'already answered.'));
    }

    /* ----- 2. How the Guard draws ----- */
    function guardCard() {
      const xh = xHatLines();
      return card('How the Guard draws',
        h('p', 'The House guards exactly one wing each job, and the wing is drawn from a published distribution '
          + 'built out of your own pressing habits. The bars and the percentages are on screen before you press.'),
        formula(`y = project( (1 − ε)·x̂ + ε·uniform_n ,  cap = ${GUARD.cap} )`),
        h('dl.set-legend',
          h('dt.mono', 'x̂'), h('dd', 'your own token shares over the last '
            + `${GUARD.xHatWindowJobs} jobs, weighted by what each job was worth — the whole law, ballast `
            + 'included, rendered from the one the code runs:',
          pseudo([xh.law, xh.omega, xh.ballast, xh.bound].join('\n')),
          'A short RUN counts about a fifth of a VAULT. The ballast β is the term that makes the next '
            + `sentence true: ωⱼ ≤ ${GUARD.jobWeightCap}·Σposted on its own does NOT hold one job to a quarter of `
            + 'the window (three RUNs and one VAULT leave the VAULT owning 52 % of Σω; on job 2 one job owns '
            + `50 %), so β adds uniform weight until the largest job’s share IS ${GUARD.jobWeightCap} exactly — and none `
            + 'at all once the window is broad enough to satisfy the bound by itself. That, and not the cap '
            + 'alone, is why the guard cannot be walked onto a wing with throwaway jobs.'),
          h('dt.mono', 'ε'), h('dd', 'the mix floor, set by your rank: '
            + RANKS.map(r => `${r.name} ${r.eps}`).join(' · ')
            + '. It falls as you climb, so the guard aims better at you the better you get.'),
          h('dt.mono', 'n'), h('dd', 'the support — the wings the drafted contracts actually touch. The board prints it '
            + `before you press, and the five posted contracts always span at least ${GUARD.postedSpanWings} wings.`),
          /* `cap` and `Mercy` are `guard.js CAP_PANEL_COPY`, verbatim and in its order — the panel
             does not author this legend (notes/repair-guard.md R16, landed at integration). What
             stood here stated the 0.75 bound flatly with ONE exception (the walked board). There
             are TWO: on a board with only two wings on it, Mercy's block empties the support and
             the other wing is drawn with CERTAINTY. `tests/job-guard.test.mjs` §6b drives all three
             regimes through `guardDist` and asserts every clause of `CAP_PANEL_COPY` against the
             measurement, so quoting it is both cheaper and safer than re-deriving it here. */
          h('dt.mono', 'cap'), h('dd', CAP_PANEL_COPY[0]),
          h('dt.mono', 'Mercy'), h('dd', CAP_PANEL_COPY[1] + ' ' + CAP_PANEL_COPY[2]),
          h('dt.mono', 'honestly'), h('dd', CAP_PANEL_COPY[3])),
        h('h3.set-sub', 'project — the water-filling step, in full'),
        pseudo([
          'project(y, cap):',
          '  loop:',
          '    over = { i : y_i > cap }        // an index that has been capped stays capped',
          '    if over is empty: return y',
          '    excess = Σ_{i∈over} (y_i − cap)',
          '    for i in over: y_i = cap',
          '    free = { i : i not capped }',
          '    if Σ_{i∈free} y_i > 0: share excess over `free` in proportion to y_i',
          '    else:                  share excess over `free` uniformly',
        ].join('\n')),
        hint('Worked, and pinned by the tests: with three wings, ε = 0.10 and every token on one wing, '
          + '(1, 0, 0) → (0.9333, 0.0333, 0.0333) → (0.750, 0.125, 0.125), which sums to 1.000. '
          + 'With two wings it is (0.75, 0.25). On job one there is no x̂ at all, so the distribution is uniform '
          + 'and the board says “no data”, rather than inventing a number.'),
        h('h3.set-sub', 'What a token is worth'),
        formula(`unguarded wing: ×(1 + ${GUARD.tokenBonus}·tokens)     guarded wing: ×guardMult(rank), and a miss there costs ×${GUARD.wingPenGuarded}`),
        h('p.set-bands', ...RANKS.flatMap((r, i) => [i ? ' · ' : null, h('span.mono', `${r.name}`), ` ×${guardMultFor(r.rank).toFixed(2)}`])),
        /* The four sentences are `guard.js PRESS_PANEL_COPY`, verbatim and in its order — the panel
           does not write this paragraph. What stood here was one sentence naming the GUARD's own
           mixing `yᵢ = 1 − k/vᵢ` as "the unexploitable answer … in proportion to their study value",
           and all three halves of it were false of the shipped file: `y` is the House's vector, the
           unexploitable press is its reciprocal `x ∝ 1/v` (most weight on the LOWEST-value wing),
           and the board pre-presses neither — it pre-presses `p` from `stationaryPress`. On
           v = (30, 20, 10) the advice put 0 of 3 tokens on WORDS and the board puts 1. */
        ...PRESS_PANEL_COPY.map(line => hint(line)),
        /* ROUND 5 (guard-equilibrium BLOCKER, notes/repair-guard.md). A hand-written closing line
           stood here restating the cap as an unconditional ceiling on every board and crediting the
           projection step with enforcing it — thirty lines under the corrected `CAP_PANEL_COPY`
           legend that contradicts it. It was false three ways, all of them
           measured in `tests/job-guard.test.mjs` §6b: on a held board `guardDist` overwrites y with
           a one-hot AFTER the projection, on a two-wing Mercy board the block empties the support,
           and on a ONE-wing board `n·cap < 1` so no projection pass runs at all — max y = 1 in all
           three, and the causal clause is wrong in all three too. `CAP_PANEL_COPY[3]` is already
           printed above as the `honestly` row and says everything true this was reaching for, with
           its conditions; a second, weaker statement of the same bound is not added back here. */
        h('h3.set-sub', 'And how the House’s own number moves'),
        formula(`E = 1 / (1 + 10^((R_house − R_player)/${ELO.divisor}))      K = ${ELO.k}`),
        hint(`Both ratings start at ${ELO.seedBase} — and if you skipped the placement, both start at exactly `
          + `${ELO.skippedPlacementSeed} with nothing inferred about you. A job counts as a win when BAGGED ≥ posted. `
          + `Your number, never the House’s, sets the vault grade: under ${VAULT_GRADE[1].from} it is tier ≤ ${VAULT_GRADE[0].tierMax}, `
          + `to ${VAULT_GRADE[2].from - 1} it is tier ${VAULT_GRADE[1].tier}, above that tier ${VAULT_GRADE[2].tier}. `
          + `After ${ELO.flowJobs} jobs bagging under ${pc(ELO.flowThreshold)} of posted, your number drops ${Math.abs(ELO.flowPenalty)} `
          + 'and the next board opens with a FOOTHOLD — stated on the board, never silent.'));
    }

    /* ----- 3. How the payout ladder works ----- */
    function ladderCard() {
      return card('How the payout ladder works',
        h('p', 'How you cleared a target sets ρ, the fraction of its posted value it pays. Nothing random touches it.'),
        table(['Result', 'Rung', 'ρ', 'Chain', 'What the study layer records'],
          RUNG_ROWS.map(r => [r.label, r.rung, r.rung === RUNG_ROWS.length - 1 ? 'miss' : r.rho.toFixed(2), r.chain, r.ledgerA])),
        formula(`LADDER = [${LADDER.map(x => x.toFixed(2)).join(', ')}]        ρ_eff = LADDER[ max(0, rung − crew rank) ]`),
        hint('This is the whole hint economy. Hints stay free and infinite everywhere — a gate may gate loot, never '
          + `learning — and what a hint costs is ${pc(1 - LADDER[1])} of the payout on that target, nothing else.`),
        h('h3.set-sub', 'What a crew does'),
        /* The crew grid's SORT KEY, printed here — the one card that already prints every other
           formula — instead of in the brief window, where it was algebra as UI copy beside a live
           allocation (notes/repair-crew.md C8 + R-5, landed at integration). The job screen's grid
           now says `weakest first` and prices a HELD point "on this list's own scale"; this is the
           scale. It is `readiness.weakSpots()`'s own key times a positive constant of the shape, so
           the crew ordering and the study plan's ordering are the SAME ordering by construction
           (`tests/job-align.test.mjs` §1) — which is why the grid can be read as advice at all. */
        formula('crew order = w × (1 − m/100)        w = test weight · m = mastery %'),
        hint('That is `readiness.weakSpots()`\'s own sort key: the crew grid lists your weakest, '
          + 'heaviest makes first, in the same order the study plan already ranks them. It orders '
          + 'makes; below the lowest mastery band it stops being a price and is an ordering only.'),
        table(['Rank', 'Cost', 'Forgives', 'Also', 'Requires'],
          CREW_RANKS.filter(r => r.rank > 0).map(r => [r.name, r.cost, `${r.forgives} rung${r.forgives === 1 ? '' : 's'}`,
            r.chainHold ? `holds the chain at ${CREW.chainHoldMinChain}+` : '—', r.requires ?? '—'])),
        hint(`Capacity = ${CREW.base} + floor(level / ${CREW.levelsPerPoint}) + boss stamps, from ${CREW.capacityMin} to `
          + `${CREW.capacityMax}, and at most ${CREW.mannedMax} of the ${CREW.makes} makes may be manned at once — so `
          + `${CREW.maxBuildAtCeiling.bare} are always bare. Playing more jobs grants no capacity at all: only levelling `
          + 'and beating bosses do. A crew stands down on one target only — the review that made its make cold — and '
          + 'forgives normally on every other target of that make in the same job.'),
        h('h3.set-sub', 'The chain, and when to bank it'),
        formula(`m_chain = 1 + ${CHAIN.step}·min(chain, ${CHAIN.cap}) ,  capped at ×${chainMult(CHAIN.cap).toFixed(1)}`),
        formula(`PUSH − BAG = ${FEE}·S + q·L·ρ̄·W·(m − 1) − (1 − q)·min(S, L·m·P)`),
        pseudo('deep pile    q* = θ*/(1 + θ*),  θ* = m·P / (ρ̄·W·(m − 1))\n'
          + `shallow pile q* = ${(1 - FEE).toFixed(1)}·S / ( L·ρ̄·W·(m − 1) + S )`),
        hint('S is the loose pile, m the chain multiplier. With no chain the shallow form is exactly '
          + `${f2(shallowQStar({ loose: 40, chain: 0, call: 70, tier: 1 }))} whatever the target is worth `
          + `(and ${f2(shallowQStar({ loose: 300, chain: 0, call: 95, tier: 4 }))} on a tier-4 at call 95) — pushing buys nothing but the fee. `
          + 'As the chain deepens the threshold falls and the amount at risk grows: the escalation is in the stake, '
          + 'not in the odds, and it comes entirely from your own miss rate. The app prints your q* before every '
          + 'bag-or-push, computed from your own rung distribution on that make.'),
        hint(`Bagging costs ${pc(FEE)} mid-job and resets the chain to 0; bagging at the getaway is free; finishing every `
          + `drafted target pays +${pc(COMPLETION)} on the bag; an honoured walk-away declaration pays +${pc(COMMIT_BONUS)} and `
          + 'forfeits the completion bonus. Quitting auto-banks half, so leaving is never catastrophic and never '
          + 'better than banking.'));
    }

    /* ----- 4. How posted is computed ----- */
    function postedCard() {
      return card('How posted is computed',
        h('p', 'Every envelope prints what the target is worth before you call it. This is the product it is.'),
        formula('posted = round( L · scope · wing · cold · tell · ×2 )'),
        pseudo('clear:  Δloose = round( L · ρ_eff · m_chain · W · scope · wing · cold · tell )\n'
          + 'miss:   Δloose = −min( LOOSE, round( L · m_chain · P · wing_pen ) ),  chain → 0'),
        h('dl.set-legend',
          h('dt.mono', 'L'), h('dd', `the tier’s loot: ${Object.entries(LOOT).map(([t, v]) => `tier ${t} ${v}`).join(' · ')}. `
            + 'Per answer-minute that is 12.0, 12.0, 12.7 and 14.0, and per minute as you actually live it — answering '
            + 'plus deciding — 8.2, 9.5, 10.9 and 12.5. Both rows rise with the tier, so easy work is never the better deal.'),
          h('dt.mono', 'scope'), h('dd', `the study layer’s own multiplier, used verbatim: ${Object.entries(SCOPE_MIRROR).map(([k, v]) => `${k} ${v}`).join(' · ')}. `
            + 'A due review is the best-paying thing on the board and a mastered make pays half.'),
          h('dt.mono', 'cold'), h('dd', `1 + ${COLD.slope}·min(1, overdue ÷ that card’s own interval), capped at ${COLD.cap.toFixed(2)}. `
            + 'A bucket-1 card one day late and a bucket-5 card fourteen days late are equally cold, and letting a card '
            + 'rot past its own interval buys nothing at all.'),
          h('dt.mono', 'tell'), h('dd', `×${TELL} while the make has a triggered, unresolved, unsealed tag in your error log — `
            + 'and ×1.00 the instant you resolve it. Sealing a tag retires it for good. Deliberately collecting mistakes '
            + 'is a depreciating asset, on purpose.'),
          h('dt.mono', 'wing'), h('dd', `×(1 + ${GUARD.tokenBonus}·tokens) on an unguarded wing; on the guarded wing the tokens pay `
            + 'nothing and the loot is multiplied by your rank’s guard multiplier instead.'),
          h('dt.mono', '×2'), h('dd', `an independent 1-in-${Math.round(1 / X2.p)} per target — that is the real, whole use of `
            + 'variable reward in this game. It is drawn from the day’s seed and the job’s index, it is marked on the '
            + 'envelope BEFORE you call, and it multiplies the clear and the miss identically. On a ten-target job the '
            + `expected count is ${(10 * X2.p).toFixed(2)}, and the board prints the realised count before you draft.`)),
        hint(`The one worked example: a tier-1 review one day overdue in bucket 1 is L ${LOOT[1]} × scope `
          + `${SCOPE_MIRROR.review} × cold ${coldFor(1, 1).toFixed(2)} = ${Math.round(LOOT[1] * SCOPE_MIRROR.review * coldFor(1, 1))} posted, `
          + `and at crew STEADY a one-hint clear pays ρ ${rhoFor(1, 1).toFixed(2)} of it instead of ${rhoFor(1, 0).toFixed(2)}.`),
        hint('posted falls as you master the material. That is the point: cold drops as buckets rise, scope halves on a '
          + 'mastered make, tells retire as they seal, and the rating’s own weight collapses as you get good. The game '
          + 'has a terminus and says so.'),
        h('h3.set-sub', 'Backchecks'),
        hint(`Max ${BACKCHECK.max} held. One is minted per day on which you had at least ${BACKCHECK.requiresDuesAtLeast} review due and `
          + 'cleared every one of them — a day with no dues mints nothing — and one per vault cracked without spending '
          + 'one. Spending a Backcheck on a miss holds the chain and saves the loose pile, and changes nothing else at '
          + 'all: the bucket still drops, the mastery hit still lands, the error is still logged, the Rematch is still '
          + 'queued, and the call still scores exactly what it would have scored unshielded. It is not available on the '
          + 'vault.'));
    }

    /* ----- 5. How the rating is computed ----- */
    function ratingCard(s) {
      /* THE HEADLINE IS BUILT BY `ratingAuditParts` (module level, and exported): the rank is READ
         off `player.rank` and never re-derived, and the audit line the ratchet owes (G9 #4) is
         printed only when the save really holds a high-water. Both rules, and why 0 is not one, are
         documented on that function — and a test now runs it over a played save rather than
         grepping this line for a guard. It is not on the board line: the board already carries the
         rating and the informative count. */
      const parts = ratingAuditParts(s);
      const live = parts.live;
      const band = informativeBand(RATING.informativeMin);
      return card('How the rating is computed',
        h('p.set-now',
          h('strong.set-now-n.mono', parts.value),
          h('span', ` · ${parts.rank}`),
          parts.worth ? h('span.muted', parts.worth) : null,
          parts.best ? h('span.muted', parts.best) : null,
          h('span.muted', parts.calls)),
        /* THE RANK IS NOT THE RATING'S BAND, AND THE PANEL SAYS SO WHERE IT MATTERS (verify round 2).
           `offBand` is true exactly when the rank printed above is not the band the rating above
           falls in — which the legend at the foot of this card prints — so this is the sentence that
           keeps the card self-consistent instead of leaving the student two numbers and no rule. */
        live.offBand
          ? hint(`The rank beside the rating is not the rating’s own band. The rating is what your calls SCORED — `
            + 'the dice are in it. The rank is what they were WORTH: the same fifty slots priced at w·E[c] on the '
            + `material you made them on, which no run of luck can move. That number is ${f2(live.ceiling)}, and it `
            + `is the one the ${parts.rank} beside your rating comes from`
            + (live.held ? ', floored by the rank your ledger already holds — this layer never takes back a tool you own.' : '.'))
          : null,
        live.held && !live.measured
          ? hint(`No informative call in the window, so the rating reads exactly ${RATING.base.toFixed(2)} and measures `
            + 'nothing at all. The rank beside it is the one your ledger holds, not one this window measured: '
            + 'mastering your makes empties the window, and getting better may not take the 95 call or the guard '
            + 'multiplier away from you.')
          : null,
        formula(`rating = clamp(0, 10, ${RATING.base} + ${RATING.scale}·Σ(wᵢ · cᵢ) / N )        N = ${RATING.N}, fixed`),
        formula(`rank   = band of clamp(0, 10, ${RATING.base} + ${RATING.scale}·Σ(wᵢ · E[cᵢ]) / N ), floored by the rank you hold`),
        /* VERIFY r3 (call-propriety, MAJOR). `E[cᵢ]` above is `E[c](pᵢ, q̂ᵢ)` — the expectation is
           taken against the SLOT'S OWN q̂, the trailing-10 clear rate, and not against whatever the
           student believes about that one target. The two come apart whenever the student knows
           more than the window does (m60 material clears 0.92 while a 7/10 record reads 0.70), and
           then the report that is TRUE about this target earns the higher RATING and the lower
           RANK — 5.897 vs 4.301 per slot, Called 1 against Called 3. That is a property of pricing
           the rank off reports rather than off outcomes, which is what the ratchet needs; it is
           published here rather than left for the student to discover at the 95 button's gate.
           `tests/job-call.test.mjs` §8 drives it. */
        hint(`E[cᵢ] is taken against q̂ — your RECORD on the make — so the rank is bought by the rung your last ${RATING.qHatWindow} `
          + 'sittings support. A call that is right about this one target but far from that record is worth more RATING than it is '
          + 'worth RANK. The two agree exactly when the window is all you know.'),
        formula(`w = ${RATING.weightK}·q̂(1 − q̂)        a call counts only when w ≥ ${RATING.informativeMin}`),
        h('dl.set-legend',
          h('dt.mono', 'q̂'), h('dd', `your CLEAR rate on that make over the trailing ${RATING.qHatWindow} sittings — a sitting you `
            + 'cleared counts whatever attempt it landed on and however many hints it took, because none of those change o '
            + 'in c(p, o); the ρ ladder is where they cost you. '
            + `w ≥ ${RATING.informativeMin} means q̂ between ${f3(band[0])} and ${f3(band[1])}: a call on material you already `
            + 'know cold, or cannot do at all, is not informative about your calibration and never enters the window.'),
        /* THE EVIDENCE ROW (verify round 2). `call.qHatFor` reads `save.cards[*].history`, and
           `screens/card.js` pushes an entry there on EVERY graded original — a job target and a
           plain Today's Page sitting alike. The game layer prices only the job target, so the
           weight `w` can be moved at zero game cost, and for a student who already knows the unit
           that is the cheapest route to a rank the ratchet then keeps. Measured: two arms with the
           same start save and every job target cleared in both, differing only in the `ok` flag on
           free sittings, end at Called 4 vs Called 2 on 7 of 8 seeds with +11.1 % post-climb loot
           (`node notes/repair-meta-evidence.mjs` §1; COMPOSED-GAME.md G3.7 proof 8). The panel
           publishes the mechanic and what it really costs instead of claiming it cannot happen —
           G9 #4, "a reviewer can recompute any number on any screen from the save". */
          h('dt.mono', 'the evidence'), h('dd', 'every graded original is a sitting — inside a job and on Today’s Page alike. '
            + 'The game stakes only job targets, so the evidence that sets w is made somewhere the game charges nothing: a '
            + 'review you miss on the Page moves the weight and costs no carry, no chain and no rating. That is the one route '
            + 'to a rank this window never measured, and the ratchet then keeps it. It is not free — it is paid in the ledger '
            + 'this whole app is about: the bucket drops, the mastery hit lands, the error is logged and Readiness falls. The '
            + 'game does not price it, so this panel names it rather than claiming it cannot happen.'),
          h('dt.mono', 'N'), h('dd', `the window is ${RATING.N} slots, not ${RATING.N} calls you happened to make. An unfilled slot `
            + 'contributes 0, which pulls the rating toward exactly 5.00. Read that as NO MEASUREMENT, never as a '
            + 'ceiling on farming: an honest student who has mastered their makes reads exactly the same 5.00, '
            + 'because there is nothing left in the window to measure. That is why the rank is a ratchet and does '
            + 'not fall with the rating — the rating is a measurement of your calibration, not a ladder.'),
          /* VERIFY r3 (call-propriety, BLOCKER). This line printed `w = 1.0` and "the weight is
             defined rather than guessed", and BOTH halves were false of the shipped code:
             `screens/mock.js mockCallWeight(ŝ) = min(4ŝ(1−ŝ), MOCK_CALL_W)` MEASURES the weight off
             the trailing-ten mean score, caps it at 0.25, and pays 0 below the gate — so the panel
             overstated the app's only calibration surface outside a job by 4×, and told a student
             with no prior paper that their forecast was the most valuable call in the window when
             it was worth exactly 0.00. `RATING.mockWeight` is now that CEILING, and this sentence
             is the shipped law. `tests/job-call.test.mjs` drives `applyMockCall` and pins it. */
          h('dt.mono', 'the Mock'), h('dd', `its prediction slider is scored by the same c(p, o) and enters the window as one `
            + `call — but it has no make, so it has no q̂, and its weight is measured from your last ${RATING.qHatWindow} papers `
            + `instead: w = min(${RATING.weightK}ŝ(1 − ŝ), ${RATING.mockWeight}) on ŝ, your mean score over those. It is 0 on your `
            + `first-ever paper and 0 whenever ŝ sits outside that same informative band, so one Mock can never add more than `
            + `${(RATING.mockWeight * CREDIT.base).toFixed(2)} to Σ(wᵢ · cᵢ) — about one job call, not four.`)),
        /* The bands are a PARTITION, from `rankBandCells()` — printed off `RANK_THRESHOLDS`, the
           array `rankFor` compares against, not off `RANKS[i].bandTop`, whose 0.1 display rounding
           left 4.95, 6.45, 7.65 and 8.85 in no printed band at all.
           LABELLED since verify round 2: unlabelled, this row read as "your rating's band is your
           rank", which is the sentence the headline above contradicts whenever `offBand` fires. */
        h('p.fs-1.muted', 'The bands below are what a rating buys. The rank reads them off what your calls were '
          + 'WORTH — the same fifty slots at w·E[c] — not off what they scored, so it can sit either side of your '
          + 'live rating’s own band.'),
        h('p.set-bands', ...rankBandCells().flatMap((b, i) => [i ? ' · ' : null,
          h('span.mono', b.range), ` ${b.name}`])),
        h('p.set-bands', ...[0.5, 0.7, 0.8, 0.85, 0.9, 0.95].flatMap((q, i) => [i ? ' · ' : null,
          h('span.mono', `q̂ ${q.toFixed(2)}`), ` w ${f2(weightFor(q))}`])),
        /* The stake band is DERIVED here (`econ.stakeBand` / `econ.stakePeak`) and printed with the
           substitution it comes out of, because G3.1 claims it is "printed with its derivation in
           Settings" — and before round 3 nothing under site/ imported either function and this was
           the literal string "q̂ ≈ 0.76 to 0.93". */
        (() => { const sb = stakeBandLine(); return h('div',
          formula(sb.derivation),
          hint('Calling 50 on everything scores exactly 5.00 for ever — cowardice keeps its money and buys no rank. '
            + `Deliberately over-calling scores worse than that. The rating is earned where w·E[c] is within 80 % of `
            + `its peak — ${sb.band}, peaking at ${sb.at} — on material you have just learned and are still `
            + 'fumbling one time in six. It can go down, and it recovers inside fifty informative calls. The two '
            + 'tools it looks like it gates — the 95 call and the guard multiplier — are gated on the RANK in your '
            + 'ledger, which is the number printed beside it, and an empty window is not a demotion.'));
        })(),
        h('h3.set-sub', 'The Fault Index'),
        hint(`${FAULT_INDEX.tags} tags, grouped by the same ${FAULT_INDEX.areas} areas the Patterns panel uses. A tag seals after `
          + `${FAULT_INDEX.sealResolutions} clean resolutions on ${FAULT_INDEX.sealDistinctDays} different days with no re-trigger in between. `
          + 'Stats shows all of them, sealed or not.'));
    }

    /* ----- Your data ----- */
    function dataCard() {
      const outBox = rawText(h('textarea.set-json.mono', { id: 'set-export', readonly: true, rows: 4, 'aria-label': 'Your save, as JSON' }));
      const sizeLine = h('p.set-size.muted.mono');
      const dl = h('a.btn.btn-primary', { download: `packet-save-${todayISO()}.json` }, 'Download');

      // The export has to be the save as it is RIGHT NOW: change the daily goal and tap Download and you
      // must get the new goal. So the box, the size line and the blob behind the link are refreshed on
      // every save change — in place, so a half-typed paste in the import box below is never wiped.
      refreshExport = () => {
        currentJson = exportJSON();
        const state = getState();
        outBox.value = currentJson;
        sizeLine.textContent = `${kb(currentJson.length)} · ${plural(Object.keys(state.cards).length, 'card')} · ${plural(state.runs.length, 'run')} · build ${APP_VERSION}`;
        revoke();
        try { dlUrl = URL.createObjectURL(new Blob([currentJson], { type: 'application/json' })); dl.href = dlUrl; } catch { dl.href = 'data:application/json,' + encodeURIComponent(currentJson); }
      };
      refreshExport();

      const copy = h('button.btn', {
        type: 'button',
        onclick: async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(currentJson);
            else { outBox.removeAttribute('readonly'); outBox.select(); document.execCommand('copy'); outBox.setAttribute('readonly', ''); }
            say('Copied your save to the clipboard.', 'ok');
          } catch { outBox.select(); say('Could not reach the clipboard — the text is selected, copy it yourself.', 'warn'); }
        },
      }, 'Copy');

      const inBox = rawText(h('textarea.set-json.mono', {
        id: 'set-import', rows: 3, 'aria-label': 'Paste a saved copy',
        placeholder: 'Paste the contents of a packet-save-….json file here',
      }));
      const doImport = (text, whence) => {
        if (!text || !text.trim()) { say('Nothing to import — paste a save first.', 'warn'); return; }
        try {
          importJSON(text);
          applyTheme(getState().settings.theme);
          say(`Imported ${whence}. What was on this device was replaced — the old save is in the backup.`, 'ok');
        } catch (e) { say(`Could not import: ${e.message}`, 'bad'); }
      };
      const importBtn = h('button.btn', { type: 'button', onclick: () => doImport(inBox.value, 'the pasted save') }, 'Import');
      const file = h('input.sr-only', {
        type: 'file', id: 'set-file', accept: 'application/json,.json',
        onchange: async (e) => {
          const input = e.currentTarget;
          const f = input.files && input.files[0];
          if (!f) return;
          try { doImport(await f.text(), f.name); } catch { say('Could not read that file.', 'bad'); }
          input.value = '';
        },
      });
      const fileBtn = h('label.btn', { for: 'set-file' }, 'Choose a file…');

      const bak = readBackup();
      const restore = bak
        ? h('div.set-actions', h('button.btn.btn-ghost', {
          type: 'button', onclick: () => doImport(bak, `the backup (${kb(bak.length)})`),
        }, `Restore the backup · ${kb(bak.length)}`))
        : null;

      const resetRow = h('div.set-actions.set-danger');
      const paintReset = () => {
        resetRow.replaceChildren(...(confirmingReset
          ? [
            h('span.set-confirm', 'Erase every card, run and trophy on this device?'),
            h('button.btn.btn-danger', {
              type: 'button',
              onclick: () => {
                reset();
                applyTheme(getState().settings.theme);
                confirmingReset = false;
                say('Everything was erased. The old save is still in the backup on this device.', 'ok');
              },
            }, 'Yes, erase it'),
            h('button.btn', { type: 'button', onclick: () => { confirmingReset = false; paintReset(); } }, 'Cancel'),
          ]
          : [h('button.btn.btn-danger', { type: 'button', onclick: () => { confirmingReset = true; paintReset(); } }, 'Erase everything')]));
      };
      paintReset();

      return card('Your data',
        hint('Your progress lives in this browser and is never sent anywhere. Download it before you clear the '
          + 'browser, switch phone, or hand the tab to someone else.'),
        h('h3.set-sub', 'Export'),
        outBox,
        sizeLine,
        h('div.set-actions', dl, copy),
        h('h3.set-sub', 'Import'),
        inBox,
        h('div.set-actions', importBtn, fileBtn, file),
        hint('Importing replaces what is on this device. The current save is copied to the backup first.'),
        restore,
        h('h3.set-sub', 'Start over'),
        resetRow);
    }

    /* ----- Past units (W5 · notes/T17.md Requests → T15) -----
       S8 #19: when the build's data is swapped to the next unit, `store.js` files this unit's cards, runs,
       errors and skills away on the next load instead of deleting them. Nothing to show while this build
       is still Unit 1A, so the card renders only when there is an archive (or a hand-off just happened). */
    function unitsCard(s) {
      const past = archivedUnits(s);
      const justNow = flags.archivedUnit;
      if (!past.length && !justNow) return null;
      const when = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : 'an earlier build');
      const label = (id) => (typeof id === 'string' && /^u(\d+)([a-z])$/i.test(id)
        ? `Unit ${id.slice(1, -1)}${id.slice(-1).toUpperCase()}`
        : String(id || 'an earlier unit'));
      return card('Past units',
        justNow
          ? h('p.set-note.ok', `${label(justNow)} is filed away — this build now teaches ${label(UNIT_ID)}. `
            + 'Nothing was deleted: your cards, runs and mistakes from it are still in the save below.')
          : null,
        hint('Finished units are kept in full. They are part of your Export, so downloading your save keeps them too.'),
        h('ul.set-units', past.map(u => h('li.set-unit',
          h('span.set-unit-name', label(u.unitId)),
          h('span.muted.fs-1.mono', `${when(u.archivedAt)} · ${plural(u.stats?.cards ?? 0, 'card')}`
            + ` · ${plural(u.stats?.runs ?? 0, 'run')} · ${u.stats?.xpAtArchive ?? 0} XP`)))));
    }

    /* ----- About ----- */
    function offlineLine(sw) {
      if (!sw.supported) return sw.error === 'needs http' ? 'not available on file:// — serve it over http' : 'not available in this browser';
      if (sw.error) return `error · ${sw.error}`;
      if (sw.updateReady) return 'new version ready — reload';
      if (!sw.registered) return 'starting…';
      if (!sw.controlled) return 'caching now — offline from the next reload';
      return `ready${sw.version ? ` · cached build ${sw.version}` : ''}`;
    }

    function aboutCard() {
      const sw = swState();
      const storage = flags.memoryOnly
        ? h('p.set-kv', h('span.set-k', 'Saving'), h('span.set-v.warn', 'off in this browser — progress lasts until you close the tab. Download your data.'))
        : flags.corruptRecovered
          ? h('p.set-kv', h('span.set-k', 'Saving'), h('span.set-v.warn', 'the previous save was unreadable and was moved to the backup.'))
          : h('p.set-kv', h('span.set-k', 'Saving'), h('span.set-v', 'on — this browser, this device.'));
      const check = h('button.btn', {
        type: 'button',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          const r = await checkForUpdate();
          btn.disabled = false;
          const copy = {
            update: 'A new version is downloading — the reload pill appears when it is ready.',
            current: 'You are on the newest version.',
            unsupported: 'Offline mode is not running in this browser.',
            throttled: 'Just checked — try again in a few minutes.',
            error: 'Could not reach the server.',
          };
          say(copy[r] || '', r === 'error' ? 'warn' : 'ok');
        },
      }, 'Check for updates');
      const clear = sw.registered
        ? h('button.btn.btn-ghost', {
          type: 'button',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            const n = await clearCaches();
            say(`Cleared the offline copy (${n} cache${n === 1 ? '' : 's'}). Reload while online to get it back.`, 'ok');
          },
        }, 'Clear the offline copy')
        : null;
      return card('About',
        h('p.set-kv', h('span.set-k', 'Build'), h('span.set-v.mono', APP_VERSION)),
        h('p.set-kv', h('span.set-k', 'Offline'), h('span.set-v.mono', offlineLine(sw))),
        storage,
        h('div.set-actions', check, clear),
        hint('The Packet is one student’s study app for Unit 1A. No account, no network, nothing to buy.'));
    }

    /* ----- painting ----- */
    let dateSlot = null;
    function repaintDate() {
      const next = dateCard(getState());
      if (dateSlot) { dateSlot.replaceWith(next); dateSlot = next; }
    }
    function repaintAbout() {
      const next = aboutCard();
      if (aboutEl) { aboutEl.replaceWith(next); aboutEl = next; }
    }

    function paint() {
      const s = getState();
      msgEl = h('p.set-msg', { role: 'status', 'aria-live': 'polite', hidden: true });
      dateSlot = dateCard(s);
      aboutEl = aboutCard();
      const game = s.settings.game !== false;
      el.replaceChildren(h('section.screen.settings',
        h('h1', 'Settings'),
        h('p.set-lede.muted', 'Everything here is stored in this browser only.'),
        lookCard(s), soundCard(s), goalCard(s), dateSlot, answerCard(s), gameCard(s),
        readinessCard(),
        // G9 #4: every probability the game puts on a screen has its formula printed here. With the
        // layer off there are no such screens, so the five panels go with it.
        ...(game ? [callCard(), guardCard(), ladderCard(), postedCard(), ratingCard(s)] : []),
        unitsCard(s), dataCard(), aboutEl,
        msgEl));
    }

    paint();

    const offs = [
      bus.on('state', (s, reason) => {
        // A wholesale save change (an import, a reset) means every control on the screen is stale.
        if (reason === 'import' || reason === 'reset') { paint(); return; }
        // Anything else: the export is the only thing that can silently go out of date. Coalesced, so a
        // slider drag does not re-serialise the save on every step.
        clearTimeout(exportTimer);
        exportTimer = setTimeout(() => { try { refreshExport(); } catch (e) { console.warn('export refresh', e); } }, 250);
      }),
      // The worker reports in on its own schedule; only the About card cares.
      swSubscribe(() => repaintAbout()),
    ];

    return () => {
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      clearTimeout(msgTimer);
      clearTimeout(exportTimer);
      msgEl = null;
      revoke();
    };
  };
}

export default mountSettings;
