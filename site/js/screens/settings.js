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
import { COPY } from '../../data/job.js';
import { BANDS as CALL_BANDS } from '../job/pay.js';
// The switch has to be able to CLOSE a live session, not just stop offering one (see `gameCard`), and
// none of that arithmetic may be re-implemented here: `priceOf` is the engine's own quote for the bid
// the student already locked, and `bank` is the one place the pile becomes `game.today`.
import { stateOf, writeGame, priceOf, bank } from '../job/state.js';

/* ---------------- small builders ---------------- */

const card = (title, ...kids) => h('section.set-card', title ? h('h2.set-h', title) : null, ...kids);
const hint = (text) => h('p.set-hint', text);
const formula = (text) => h('code.set-formula', text);

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

    /* ----- the one switch that kills the game, and the three bands -----
       THE SWITCH IS A DOOR, AND A DOOR CANNOT BE SHUT ON SOMEONE STANDING IN IT.
       Turning the game off used to write `settings.game = false` and nothing else, which handed a
       LIVE session to the flat runner: `plan.nextActionFor` stops rewriting the resume href, Home's
       button goes to `#/run/page`, and `screens/run.js` reopens the very same page with
       `inProgress.game` still sitting on it. Two things fell out of that. A question could be
       answered on the flat page for nothing while a locked call survived it — toggle off, miss it,
       toggle back on, and the bid and the ×5 streak were still there, so any question could be
       dodged at zero cost. And a student who simply finished the page there had `finishPage` throw
       the whole unbanked pile away without a word.

       So the switch CLOSES the session before it flips:

         · A LOCKED BID IS SETTLED, NOT DODGED. `job/state.js bank` refuses over a live call for one
           reason — "lock, read the question, and bank out of a bid you no longer like" — and the
           switch is the only door left that reached past that refusal. The question is on screen by
           then, so leaving cannot be free: the bid loses, which costs exactly what missing it costs
           and resets the streak. The number is not computed here; `priceOf` returns the very cost the
           strip quoted when the bid was locked, and `max(0, pile − cost)` is `answer`'s own line, so
           the pile still floors at zero and a loss still comes only from the unbanked pile.
         · Then the pile is BANKED through the engine's own `bank()`, so nothing is silently
           destroyed and `game.today` / `player.best` move through the one implementation that owns
           them.
         · Then the record is dropped, while `inProgress` — the PAGE, its queue and its index — is
           left exactly as it was, so `#/run/page` resumes the same questions and files the run
           itself. No page is counted twice and no due question is taken off the schedule.

       All of it in ONE `update()`, so no save is ever observed half-switched, and the record is
       dropped even if the settle throws on a malformed one: it must never outlive the switch.

       Which is why the switch is not a cheap way out. Answering costs `cost` only when you are
       wrong; leaving costs it always. And dropping the record makes `state.pageInProgress` true, so
       flipping the switch back on mid-page sends the student to `#/run/page` (`screens/job.js`) and
       `startJob` refuses — the rest of that page is flat. Leaving is strictly dominated by playing,
       in every reachable state, which is what CUT-BRIEF's math #5 asks of every other exit. */
    function leaveSession(st) {
      const g = stateOf(st);
      if (!g) return;
      try {
        const called = !!g.call;                                    // a bid is on the table
        const lost = called ? priceOf(st, g.call.id).cost : 0;      // …and it loses
        writeGame(st, { ...g, call: null, pile: Math.max(0, g.pile - lost), streak: called ? 1 : g.streak });
        bank(st);
      } catch (e) { console.warn('settings: closing the live session', e); }
      if (st.inProgress) delete st.inProgress.game;
    }

    /* CUT-SPEC §6 gives this card its WHOLE vocabulary — `The game`, `on`, `off`, the three band
       lines and the greyed-call note — so every string here is read from data and each one is
       printed exactly once. The card carries no `<h2>`: the switch's own label is the title, and a
       heading repeating it would be the seventh string on a list of six. Closing a live session
       adds no string to that list: nothing is lost any more, so there is nothing to apologise for,
       and the points are printed where they are earned — at the end of a session. */
    function gameCard(s) {
      const on = s.settings.game !== false;
      const sw = toggle({
        id: 'set-game', checked: on, label: COPY.settings.title,
        onchange: (v) => {
          update((st) => { if (!v) leaveSession(st); st.settings.game = v; });
          say(v ? COPY.settings.on : COPY.settings.off, 'ok');
          paint();
        },
      });
      return card(null,
        row(COPY.settings.title, sw, { id: 'set-game' }),
        /* The three bands, printed from the SHIPPED table (`job/pay.js BANDS`) so this panel can
           never publish an arithmetic the game does not use: the band edges the words name (2 in 3,
           4 in 5) are the crossings of that table's own expected-points lines, and
           `tests/cut-meta.test.mjs` re-derives them from `PAYS` / `COSTS` by grid search. */
        ...(on ? CALL_BANDS.map((b) => hint(b.copy)) : []),
        ...(on ? [hint(COPY.settings.greyed)] : []));
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
      el.replaceChildren(h('section.screen.settings',
        h('h1', 'Settings'),
        h('p.set-lede.muted', 'Everything here is stored in this browser only.'),
        lookCard(s), soundCard(s), goalCard(s), dateSlot, answerCard(s), gameCard(s),
        readinessCard(),
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
