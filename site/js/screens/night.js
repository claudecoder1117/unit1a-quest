// screens/night.js — the last two days (COMPOSED S7 "Night Before", "Test Morning", "Post-test").
//
// NIGHT BEFORE (D − 1, replaces Today's Page; also reachable any night from the plan strip). Sized to
// 30 minutes, four blocks:
//   1. Notation flash — 12 M1 cards, ~3 min.
//   2. Final Sweep — up to 8 cards with bucket ≤ 2, hints on, ~8 min.
//   3. Mini-mock — 8 items, 15-minute wall-clock cap, hints off. The elites `ang-10` and `doc-05` appear
//      ONLY if each is already cleared ≥ Bronze (no new content the night before; a never-seen tier-4
//      inside a 15-minute cap is a trap) — otherwise their LINEAR variants stand in
//      (`T-fig-xlines-L` for ang-10, `T-fig-bisect-L` for doc-05) — plus one Kuta a > 1.
//      Report: your scratch beside the worked solution, scored on FIRST TRY only (so the per-item
//      feedback the Card screen gives cannot inflate the Readiness the run writes).
//   4. Cheat sheet you can't bring (`#/sheet`) and the closing card: "Done. Sleep beats another hour."
//   After 22:00 the closing card shows FIRST with a soft "keep going anyway" link; sound is greyed
//   (js/sound.js mutes itself after 22:00). Completion satisfies the daily goal (`daily[today].nightDone`)
//   and `night-owl-no` is earned when the run is submitted before 22:00.
//
// TEST MORNING (D): a 5-minute page — 6 notation + 2 ASN + 1 factoring, all tier 1–2, drawn from cards
// with rarity ≥ Silver (confidence, not challenge), hints off — then one screen: Readiness, the sheet, "Go."
//
// POST-TEST (after testTime + 90 min, or a past date): the one-tap "How did it go?" real-score entry,
// stored beside the last prediction. Everything else hides behind "after the test".
//
// Routing: `#/night` and `#/morning` are aliases of `#/run/night` / `#/run/morning` (app.js ALIASES), so
// this module also carries the `/run/:kind/:id?` dispatcher until T16's run.js lands — see notes/T14.md.

import { h, bus, setHeader } from '../app.js';
import { getState, update } from '../store.js';
import { mathfmt } from '../mathfmt.js';
import { nightCounted, NIGHT_FLOOR } from '../trophies.js';
import { todayISO, daysUntilTest, isQuietHours, timeHM } from '../days.js';
import { readiness, weakSpots, latestMock } from '../readiness.js';
import { dueList, checkDailyGoal, dailyRecord } from '../schedule.js';
import { modeFor } from '../plan.js';
import { tileRarity } from '../rarity.js';
import { createSequence, mountJump } from './onboard.js';
import { createCardView } from './card.js';
import { personalLines } from '../../data/sheet.js';

/* ------------------------------------------------------------------ lazy data */
let T = null, C = null;
/** Load the two heavy data modules this screen needs (also the hook tests await before reading a pool). */
export const loadAll = () => (T && C ? Promise.resolve() : Promise.all([
  T ? null : import('../../data/templates.js').then(m => (T = m)),
  C ? null : import('../../data/cards.js').then(m => (C = m)),
]).then(() => undefined));

export const NIGHT_MINUTES = 30;
export const FLASH_COUNT = 12;          // block 1 — 12 M1 cards (S7)
export const SWEEP_COUNT = 8;           // block 2 — up to 8 cards with bucket ≤ 2
export const SWEEP_BUCKET = 2;
export const MINI_COUNT = 8;            // block 3 — 8 items …
export const MINI_LIMIT_MS = 15 * 60 * 1000;   // … under a 15-minute wall clock
export const QUIET_HOUR = 22;           // the soft close
export const MORNING_NOTATION = 6, MORNING_ASN = 2, MORNING_FAC = 1;
export const ELITES = Object.freeze([
  { id: 'ang-10', stand: 'T-fig-xlines-L' },
  { id: 'doc-05', stand: 'T-fig-bisect-L' },
]);

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const profile6 = save => String(save?.profileId ?? 'anon').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'anon';
const clock = ms => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) % 60000 / 1000)).padStart(2, '0')}`;

/** Rarity ≥ Bronze means the card has actually been cleared at least once (S7's elite rule). */
function atLeastBronze(save, id) {
  return tileRarity(id, save?.cards?.[id]) != null;
}
/** Rarity ≥ Silver (Test Morning draws only from these — confidence, not challenge). */
function atLeastSilver(save, id) {
  const r = tileRarity(id, save?.cards?.[id]);
  return r === 'silver' || r === 'gold' || r === 'platinum';
}

/* ------------------------------------------------------------------ block item pools */

/** Block 1 — 12 M1 notation cards: the nine originals first, then fresh `T-notation` Variants. */
export function flashItems(save, { count = FLASH_COUNT } = {}) {
  const p6 = profile6(save);
  const out = [];
  for (let n = 1; n <= 9 && out.length < count; n++) {
    const id = `not-${String(n).padStart(2, '0')}`;
    if (C?.byId?.[id]) out.push({ key: id, source: { id } });
  }
  const kinds = ['ray', 'len', 'ang', 'line', 'seg', 'm'];
  for (let n = 0; out.length < count; n++) {
    out.push({ key: `T-notation#f${n}`, source: { template: 'T-notation', seed: `${p6}-night-not-${n}` }, params: { kind: kinds[n % kinds.length] } });
    if (n > 20) break;
  }
  return out.slice(0, count);
}

/**
 * Block 2 — the Final Sweep: up to 8 attempted cards with bucket ≤ 2, most overdue first. When almost
 * nothing has been attempted yet (a student who installs this the night before), it falls back to the
 * uncleared originals of the heaviest skills, so the block is never empty.
 */
export function sweepItems(save, { now = Date.now(), today = todayISO(new Date(now)), count = SWEEP_COUNT } = {}) {
  const D = daysUntilTest(save?.settings?.testDate, today);
  const due = dueList(save, { now, today, D });
  const out = [];
  const seen = new Set();
  for (const d of due) {
    if (out.length >= count) break;
    if ((d.bucket ?? 0) > SWEEP_BUCKET) continue;
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d.kind === 'card'
      ? { key: d.id, source: { id: d.id }, opts: { review: true } }
      : { key: d.key, source: { template: d.template, seed: d.seed }, opts: { review: true, forCard: d.forCard ?? null } });
  }
  if (out.length >= count) return out;
  // fallback: the weakest skills' uncleared originals
  const weak = weakSpots(save, { max: 5 }).map(w => w.id);
  const order = new Set(weak);
  const cards = (C?.cards ?? []).filter(c => !seen.has(c.id) && c.tier <= 3 && !save?.cards?.[c.id]?.cleared);
  cards.sort((a, b) => (order.has(b.skills?.[0]) - order.has(a.skills?.[0])) || (a.tier - b.tier));
  for (const c of cards) {
    if (out.length >= count) break;
    seen.add(c.id);
    out.push({ key: c.id, source: { id: c.id } });
  }
  return out;
}

/**
 * Block 3 — the mini-mock: 8 items. The two elites only when they are already ≥ Bronze, else their
 * LINEAR stand-ins; one Kuta a > 1; the rest from the weakest skills that have a generator.
 */
export function miniMockItems(save, { count = MINI_COUNT } = {}) {
  const p6 = profile6(save);
  const out = [];
  const push = (key, source, params = null) => { if (!out.some(x => x.key === key)) out.push({ key, source, params }); };
  for (const e of ELITES) {
    if (atLeastBronze(save, e.id)) push(e.id, { id: e.id });
    else push(e.stand, { template: e.stand, seed: `${p6}-night-${e.stand}` });
  }
  push('T-factor-a2', { template: 'T-factor-a2', seed: `${p6}-night-fac2` });   // "plus one Kuta a > 1"
  const weak = weakSpots(save, { max: 5 });
  const pool = [];
  for (const w of weak) for (const id of (T?.templatesForSkill?.(w.id) ?? [])) if (!pool.includes(id)) pool.push(id);
  for (const id of ['T-cs-lin', 'T-cs-ratio', 'T-sys', 'T-quad-solve', 'T-notation', 'T-fig-pairs']) if (!pool.includes(id)) pool.push(id);
  let n = 0;
  while (out.length < count && n < pool.length * 3) {
    const id = pool[n % pool.length];
    const entry = T?.getTemplate?.(id);
    n++;
    if (!entry || entry.tier > 3) continue;                    // the cap is 15 minutes: no tier-4 filler
    push(`${id}#m${n}`, { template: id, seed: `${p6}-night-mini-${n}` });
  }
  return out.slice(0, count);
}

/**
 * Test Morning — 6 notation + 2 ASN + 1 factoring, all tier 1–2, drawn from cards with rarity ≥ Silver.
 * If the student has not earned enough Silvers, the slot falls back to any cleared card of that kind,
 * and then to the card itself: the point is nine things you can already do, not a shortfall message.
 */
export function morningItems(save) {
  const pick = (ids, want) => {
    const silver = ids.filter(id => atLeastSilver(save, id));
    const cleared = ids.filter(id => atLeastBronze(save, id));
    const out = [];
    for (const id of [...silver, ...cleared, ...ids]) { if (!out.includes(id)) out.push(id); if (out.length >= want) break; }
    return out;
  };
  const all = C?.cards ?? [];
  const tierOk = c => (c.tier ?? 2) <= 2;
  const note = all.filter(c => c.id.startsWith('not-') && tierOk(c)).map(c => c.id);
  const asn = all.filter(c => c.id.startsWith('asn-') && tierOk(c)).map(c => c.id);
  const fac = all.filter(c => c.id.startsWith('fac-') && tierOk(c)).map(c => c.id);
  const ids = [...pick(note, MORNING_NOTATION), ...pick(asn, MORNING_ASN), ...pick(fac, MORNING_FAC)];
  return ids.filter(Boolean).map(id => ({ key: id, source: { id } }));
}

/* ------------------------------------------------------------------ the run record */

/** Push a `night` / `morning` run record (S6 `runs`). `accuracy` is written only when it was earned. */
function writeRun(save, { kind, startedAt, submittedAt, items, accuracy = null, limitMs = null, answered = null }) {
  if (!Array.isArray(save.runs)) save.runs = [];
  const n = save.runs.filter(r => String(r?.kind).split(':')[0] === kind).length + 1;
  const rec = {
    kind, n, seed: `${kind}#${n}`, startedAt, submittedAt, status: 'done', limitMs, tabAway: 0,
    items: items.map(it => ({
      id: it.id, skill: it.skill ?? null, tier: it.tier ?? null, raw: String(it.raw ?? '').slice(0, 200),
      credit: it.credit ?? 0, ms: it.ms ?? 0, flagged: false, work: String(it.work ?? '').slice(0, 1024),
    })),
    flagged: false, splits: [],
  };
  if (Number.isFinite(answered)) rec.answered = answered;      // every block's answered count (trophies.nightCounted)
  if (accuracy != null && Number.isFinite(accuracy)) { rec.accuracy = accuracy; rec.score = Math.round(accuracy * 100); rec.scoreMax = 100; }
  save.runs.push(rec);
  return rec;
}

/* ------------------------------------------------------------------ small pieces */

/** The one-line eyebrow above a block: "Block 3 of 4 · ~15 min". The block's NAME is the run title. */
function blockHead(n, total, title, mins) {
  return h('p.nb-block-head.ob-eyebrow.muted.fs-1', `Block ${n} of ${total} · ${title} · ~${mins} min`);
}

function closingCard(el, { quiet, onKeepGoing, onDone, save }) {
  const rd = readiness(save);
  el.append(h('section.screen.nb-close', { 'aria-labelledby': 'nb-close-h' },
    h('div.card.nb-close-card',
      h('h1#nb-close-h', 'Done. Sleep beats another hour.'),
      h('p.fs-2', quiet
        ? `It is ${timeHM()}. Everything after this point costs you more in the morning than it gains you tonight.`
        : 'Your Readiness is locked in for the night. Put the phone down, set an alarm, and read the sheet once in the morning.'),
      h('p.nb-close-rd.mono', `Readiness ${rd.r}${rd.provisional ? ' · provisional' : ''} · ${rd.band.label}`),
      h('div.ob-nav',
        h('a.btn.btn-primary', { href: '#/sheet' }, 'The cheat sheet you can’t bring'),
        onKeepGoing ? h('button.btn.btn-ghost', { type: 'button', onclick: onKeepGoing }, 'Keep going anyway') : null,
        onDone ? h('a.btn.btn-ghost', { href: '#/today', onclick: onDone }, 'Today') : null,
      ),
    )));
}

/**
 * The four personal lines as HTML: mini-markup ({ray AB}, {seg AB}, x^2) rendered the way #/sheet
 * renders it (S9 #3 "notation is real notation … everywhere"), never printed raw. Pure — tests read it.
 */
export function sheetPreviewLines(save, { max = 4 } = {}) {
  return personalLines(save, { max }).map(l => ({ id: l.id, title: mathfmt(l.title), text: mathfmt(l.text) }));
}

function sheetPreview(save) {
  const lines = sheetPreviewLines(save);
  if (!lines.length) return null;
  return h('div.card.nb-sheet-preview',
    h('h2.fs-3', 'On your sheet tonight'),
    h('ul.nb-sheet-list', lines.map(l => h('li', h('b', { html: l.title }), ' ', h('span.muted', { html: l.text })))),
    h('p', h('a.btn', { href: '#/sheet' }, 'Open the sheet')));
}

/* ------------------------------------------------------------------ the mini-mock runner (block 3) */

/**
 * One item's verdict from what the mock saw: the first graded submit is the answer. A finished card
 * scores its own `firstTry`; a card handed in (or moved past) after a submit is answered and wrong;
 * a card that never received a submit is skipped — listed, not scored.
 */
export function miniVerdict({ graded = 0, result = null } = {}) {
  if (result) return { answered: true, firstTry: result.firstTry === true && result.cleared === true };
  return graded > 0 ? { answered: true, firstTry: false } : { answered: false, firstTry: false };
}

/**
 * Block 3 runs the Card view under the Mock's rules (S7: no hints, no solutions, no per-item feedback):
 * the FIRST graded submit of a box is the verdict. A wrong first answer locks the item and offers
 * "Next question" — there is no retry loop to green and nothing is coached mid-mock — and the record
 * is written the moment the answer lands, so "Hand it in" keeps every item that received a submit.
 * The feedback strips the Card view draws are hidden by css/polish.css (`.nb-mini`). T14 §7 asked T13
 * for the real Mock runner; until it is exposed this is the same contract in one screen-sized function.
 */
function createMiniMock(host, cfg = {}) {
  const items = (cfg.items ?? []).filter(Boolean);
  const total = items.length;
  const results = [];
  let i = 0, view = null, destroyed = false, offBus = null, cur = null;   // cur = { index, sub } of the open item

  const root = h('section.screen.ob-run.nb-mini', { 'aria-label': 'Mini-mock' });
  const counter = h('span.ob-run-count.mono', '');
  const ticks = h('ol.ob-ticks', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0', 'aria-label': 'Mini-mock progress' });
  const actions = h('div.ob-run-actions');
  root.append(
    h('header.ob-run-head',
      h('div.ob-run-headline', h('h1.fs-3.ob-run-title', 'Mini-mock'), cfg.badge ?? null, counter),
      ticks,
      h('div.ob-run-meta', h('p.ob-run-sub.muted.fs-1', cfg.sub || ''), actions)));
  const stage = h('div.ob-run-stage');
  const nextRow = h('div.nb-mini-next', { hidden: true });
  root.append(stage, nextRow);
  host.append(root);

  const tickState = (n) => {
    const r = results[n];
    if (r) return r.answered ? (r.firstTry ? 'clean' : 'wrong') : 'skip';
    return n === i ? 'now' : 'todo';
  };
  function draw() {
    ticks.setAttribute('aria-valuenow', String(results.filter(Boolean).length));
    counter.textContent = total ? `${Math.min(i + 1, total)} / ${total}` : '';
    ticks.replaceChildren(...items.map((_, n) => h('li.ob-tick', { dataset: { state: tickState(n) } })));
    actions.replaceChildren(h('button.btn.btn-ghost.ob-quit', { type: 'button', onclick: () => cfg.onQuit?.() }, cfg.quitLabel || 'Hand it in'));
  }
  function teardownView() {
    if (offBus) { offBus(); offBus = null; }
    if (view) { try { view.destroy(); } catch { /* gone */ } view = null; }
    stage.replaceChildren();
    delete stage.dataset.locked;
    nextRow.hidden = true; nextRow.replaceChildren();
  }
  /** Write (or refine) the record for item `index`; `cfg.onItem` hears each item exactly once. */
  function record(index, sub, result) {
    const item = items[index];
    const v = miniVerdict({ graded: sub.graded, result });
    const fields = {
      key: item.key, index, item, result, ...v, outcome: v.answered ? (v.firstTry ? 'clean' : 'wrong') : 'skip',
      scratch: stage.querySelector('.card-scratch')?.value ?? results[index]?.scratch ?? '',
      stem: view?.item?.stem ?? results[index]?.stem ?? '',
      solution: (view?.item?.solution ?? results[index]?.solution ?? []).slice(),
      itemId: result?.id ?? view?.item?.id ?? item.source?.id ?? null,
    };
    if (results[index]) { Object.assign(results[index], fields); return results[index]; }
    const rec = results[index] = fields;
    try { cfg.onItem?.(rec, item, index); } catch (e) { console.error('mini.onItem', e); }
    return rec;
  }
  /** After the first wrong: every box locks, the dock's Submit greys, and the only way is forward. */
  function lock() {
    for (const e of view?.state?.entries ?? []) { try { e.w.lock(true); } catch { /* proxy */ } }
    stage.dataset.locked = 'true';
    const sb = document.querySelector('.card-submit');
    if (sb) sb.disabled = true;
  }
  function offerNext(index) {
    nextRow.replaceChildren(
      h('p.muted.fs-1', 'Answer recorded — in a mock there is no second try.'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => advance(index) }, index + 1 < total ? 'Next question' : 'Hand it in'));
    nextRow.hidden = false;
    try { nextRow.scrollIntoView({ block: 'center' }); } catch { /* jsdom */ }
    nextRow.querySelector('button')?.focus({ preventScroll: true });
  }
  function advance(index, sub) {
    if (destroyed || index !== i) return;
    if (!results[index]) record(index, sub ?? { graded: 0 }, null);
    i = index + 1;
    step();
  }
  function step() {
    if (destroyed) return;
    if (i >= total) { teardownView(); draw(); cfg.onFinish?.({ results: results.slice(), items }); return; }
    const index = i, item = items[index];
    teardownView();
    draw();
    const sub = { graded: 0 };
    cur = { index, sub };
    let done = false;
    offBus = bus.on('card:graded', (ev) => {
      if (destroyed || done || index !== i || ev?.free) return;        // a malformed entry is not an answer
      sub.graded++;
      if (ev.kind === 'wrong' || (ev.ok === false && ev.kind !== 'correct')) {
        lock();
        record(index, sub, null);
        offerNext(index);
        draw();
      }
    });
    view = createCardView(stage, item.source, {
      hints: false, mode: 'mock', back: '/night',
      ...(item.opts || {}),
      query: item.params ? new URLSearchParams(item.params) : undefined,
      onDone: (result) => {
        if (destroyed || index !== i) return;
        done = true;
        record(index, sub, result);
        draw();
        if (result?.cleared !== true) offerNext(index);                 // a revealed card: forward, never the solution
      },
      onContinue: () => advance(index, sub),
    });
  }

  draw();
  step();
  return {
    el: root,
    get index() { return i; },
    get results() { return results.slice(); },
    /** Hand-in mid-item: the current item keeps whatever it has received. */
    settle() { if (!destroyed && cur && cur.index === i && i < total && !results[i] && cur.sub.graded > 0) record(i, cur.sub, null); },
    destroy() { destroyed = true; teardownView(); root.remove(); },
  };
}

/* ------------------------------------------------------------------ Night Before */

/** `#/night` (alias of `#/run/night`) */
export function mountNight(params, query) {
  return (el) => {
    let alive = true, seq = null, timer = 0;
    const startedAt = Date.now();
    const collected = { flash: [], sweep: [], mini: [] };
    const teardown = () => {
      if (seq) { try { seq.destroy(); } catch { /* gone */ } seq = null; }
      if (timer) { clearInterval(timer); timer = 0; }
      el.replaceChildren();
    };

    const rd0 = readiness(getState());
    setHeader({ readiness: rd0.r, provisional: rd0.provisional });

    function intro({ quiet }) {
      teardown();
      const save = getState();
      const D = daysUntilTest(save.settings?.testDate);
      el.append(h('section.screen.nb-intro', { 'aria-labelledby': 'nb-h' },
        h('p.ob-eyebrow.muted.fs-1', D === 1 ? 'The night before' : `Night Before · ${D == null ? 'no date set' : `T−${D}`}`),
        h('h1#nb-h', 'Thirty minutes, then stop.'),
        h('p.muted', 'Nothing new tonight. Four blocks, in this order, and the last one is a sheet you read — not a problem you solve.'),
        h('ol.nb-plan',
          h('li', h('b', 'Notation flash'), ' — 12 cards, about 3 minutes.'),
          h('li', h('b', 'Final sweep'), ' — up to 8 things you have not locked in. Hints on.'),
          h('li', h('b', 'Mini-mock'), ' — 8 questions, 15 minutes, no hints. Then the report.'),
          h('li', h('b', 'The cheat sheet'), ' — the one you can’t bring.'),
        ),
        h('div.ob-nav',
          h('button.btn.btn-primary', { type: 'button', onclick: () => runFlash() }, 'Start'),
          h('button.btn', { type: 'button', onclick: () => runSweep() }, 'Skip to the sweep'),
          h('button.btn.btn-ghost', { type: 'button', onclick: () => runMini() }, 'Straight to the mini-mock'),
        ),
        quiet ? h('p.muted.fs-1', `It is past ${QUIET_HOUR}:00 — sound is off and the closing card is one tap away.`) : null,
      ));
    }

    function runFlash() {
      teardown();
      const save = getState();
      seq = createSequence(el, {
        title: 'Notation flash',
        sub: '12 cards. Read the symbol, write the symbol.',
        back: '/night',
        cardOpts: { hints: true, back: '/night' },
        quitLabel: 'Skip this block',
        onQuit: () => runSweep(),
        items: flashItems(save),
        onItem: (rec) => { collected.flash.push(rec); },
        onFinish: () => runSweep(),
      });
      el.prepend(blockHead(1, 4, 'Notation flash', 3));
    }

    function runSweep() {
      teardown();
      const save = getState();
      const items = sweepItems(save);
      if (!items.length) return runMini();
      seq = createSequence(el, {
        title: 'Final sweep',
        sub: 'Everything you have not locked in. Hints are on — use them, this is the last rehearsal.',
        back: '/night',
        cardOpts: { hints: true, back: '/night' },
        quitLabel: 'Skip this block',
        onQuit: () => runMini(),
        items,
        onItem: (rec) => { collected.sweep.push(rec); },
        onFinish: () => runMini(),
      });
      el.prepend(blockHead(2, 4, 'Final sweep', 8));
    }

    function runMini() {
      teardown();
      const save = getState();
      const items = miniMockItems(save);
      const begun = Date.now();
      const clockEl = h('span.nb-clock.mono', clock(MINI_LIMIT_MS));
      seq = createMiniMock(el, {
        sub: 'Eight questions, 15 minutes, no hints. One answer per box — the first one you give is the one that counts.',
        badge: clockEl,
        quitLabel: 'Hand it in',
        onQuit: () => { seq?.settle?.(); miniReport(begun); },
        items,
        onItem: (rec) => { collected.mini.push(rec); },
        onFinish: () => miniReport(begun),
      });
      el.prepend(blockHead(3, 4, 'Mini-mock', 15));
      timer = setInterval(() => {
        if (!alive) return;
        const left = begun + MINI_LIMIT_MS - Date.now();           // wall clock (S6): never an interval count
        clockEl.textContent = clock(left);
        clockEl.dataset.low = String(left < 120000);
        if (left <= 0) { clearInterval(timer); timer = 0; miniReport(begun); }
      }, 1000);
    }

    function miniReport(begun) {
      const items = collected.mini;
      const submittedAt = Date.now();
      const scored = items.filter(r => r.answered !== false);          // skipped items are listed, not scored
      const answered = scored.length;
      const right = scored.filter(r => r.firstTry).length;
      const accuracy = answered ? right / answered : null;
      // S9 #10 "Honest": the night satisfies the daily goal because it is thirty minutes of work — so it
      // counts only past the floor (8 answered across the blocks, or some answered and 10 minutes).
      const answeredAll = collected.flash.length + collected.sweep.length + answered;
      const counted = nightCounted({ answered: answeredAll, startedAt, submittedAt });
      teardown();

      if (answeredAll > 0) update((s) => {
        writeRun(s, {
          kind: 'night', startedAt, submittedAt, limitMs: MINI_LIMIT_MS,
          accuracy, answered: answeredAll,
          items: scored.map(r => ({
            id: r.itemId, skill: r.result?.skills?.[0] ?? null, tier: r.result?.tier ?? null,
            credit: r.firstTry ? 1 : 0, ms: r.result?.elapsedMs ?? 0, work: r.scratch,
          })),
        });
        if (counted) {
          const d = dailyRecord(s, todayISO(new Date(submittedAt)));
          d.nightDone = true;
          checkDailyGoal(s, todayISO(new Date(submittedAt)));
        }
      });

      const save = getState();
      const rd = readiness(save);
      setHeader({ readiness: rd.r, provisional: rd.provisional });
      const quiet = isQuietHours(new Date(submittedAt));

      const report = h('section.screen.nb-report', { 'aria-labelledby': 'nb-rep-h' },
        blockHead(3, 4, 'Mini-mock report', 15),
        h('h1#nb-rep-h', answered ? `${right} of ${answered} first try` : 'Nothing answered'),
        h('p.muted', answered
          ? `Scored on the first answer you gave to each box${items.length > answered ? ` — ${items.length - answered} you never answered ${items.length - answered === 1 ? 'is' : 'are'} listed, not scored` : ''}. This is the number Readiness uses.`
          : 'No answers, so nothing was scored. The sheet is still worth five minutes.'),
        h('p.nb-rep-rd.mono', `Readiness ${rd.r}${rd.provisional ? ' · provisional' : ''}`),
        counted
          ? h('p.nb-rep-count.fs-1', { dataset: { counted: 'true' } }, `${answeredAll} answered tonight — the night counts toward today's goal.`)
          : h('p.nb-rep-count.fs-1', { dataset: { counted: 'false' } }, answeredAll
            ? `${answeredAll} answered tonight — the night counts at ${NIGHT_FLOOR.items}, or ${Math.round(NIGHT_FLOOR.ms / 60000)} minutes of work. It is not a streak day yet.`
            : 'Nothing answered — the night does not count yet. No streak day, no trophy, nothing written.'),
        items.length ? h('ol.nb-rep-list', items.map(r => h('li.nb-rep-item', { dataset: { ok: r.answered === false ? 'skip' : String(!!r.firstTry) } },
          h('div.nb-rep-head',
            h('span.nb-rep-mark', { 'aria-hidden': 'true' }, r.answered === false ? '–' : r.firstTry ? '✓' : '✗'),
            h('span.nb-rep-id.mono.fs-1', r.itemId ?? ''),
            r.answered === false ? h('span.muted.fs-1', 'not answered') : null,
          ),
          r.stem ? h('p.nb-rep-stem.fs-1.muted', { html: mathfmt(String(r.stem)) }) : null,   // real notation (S9 #3), clamped by CSS
          h('div.nb-rep-cols',
            h('div.nb-rep-col',
              h('h3.fs-1.muted', 'Your work'),
              h('pre.nb-rep-work', r.scratch ? r.scratch : '— nothing written —')),
            h('div.nb-rep-col',
              h('h3.fs-1.muted', 'Worked solution'),
              r.solution?.length
                ? h('ol.nb-rep-sol', r.solution.map(st => h('li', h('span', { html: mathfmt(st.say || '') }), st.math ? h('code.mono', { html: ' ' + mathfmt(st.math) }) : null)))   // steps carry {m EZJ} too
                : h('p.muted.fs-1', 'No written solution for this one — open the card for the steps.')),
          ),
        ))) : null,
        h('div.ob-nav',
          h('button.btn.btn-primary', { type: 'button', onclick: () => finishNight({ quiet }) }, 'The cheat sheet'),
          counted ? null : h('button.btn', { type: 'button', onclick: () => intro({ quiet }) }, 'Back to the blocks')),
      );
      el.append(report);
      window.scrollTo(0, 0);
    }

    function finishNight({ quiet }) {
      teardown();
      const save = getState();
      const sheet = sheetPreview(save);
      const wrap = h('section.screen.nb-final', blockHead(4, 4, 'The cheat sheet you can’t bring', 4));
      if (sheet) wrap.append(sheet);
      el.append(wrap);
      closingCard(el, { quiet, save, onKeepGoing: () => intro({ quiet: false }), onDone: null });
    }

    loadAll().then(() => {
      if (!alive) return;
      const quiet = isQuietHours();
      if (quiet) {
        // S7: after 22:00 the closing card shows FIRST, with a soft "keep going anyway".
        el.replaceChildren();
        closingCard(el, { quiet: true, save: getState(), onKeepGoing: () => intro({ quiet: true }), onDone: null });
      } else intro({ quiet: false });
    });
    el.append(h('section.screen', h('p.muted', 'Loading tonight’s work…')));
    return () => { alive = false; teardown(); };
  };
}

/* ------------------------------------------------------------------ Test Morning */

/** `#/morning` (alias of `#/run/morning`) */
export function mountMorning(params, query) {
  return (el) => {
    let alive = true, seq = null;
    const startedAt = Date.now();
    const done = [];
    const teardown = () => { if (seq) { try { seq.destroy(); } catch { /* gone */ } seq = null; } el.replaceChildren(); };
    const rd0 = readiness(getState());
    setHeader({ readiness: rd0.r, provisional: rd0.provisional });

    function intro() {
      teardown();
      el.append(h('section.screen.tm-intro', { 'aria-labelledby': 'tm-h' },
        h('p.ob-eyebrow.muted.fs-1', 'Test morning'),
        h('h1#tm-h', 'Nine things you already know.'),
        h('p.muted', 'Six notation, two statements, one factoring — all of them things you have already got right. This is a warm-up, not a last stand. Five minutes.'),
        h('div.ob-nav',
          h('button.btn.btn-primary', { type: 'button', onclick: run }, 'Start'),
          h('a.btn', { href: '#/sheet' }, 'Just the sheet'),
        )));
    }

    function run() {
      teardown();
      const items = morningItems(getState());
      if (!items.length) return finish();
      seq = createSequence(el, {
        title: 'Test morning',
        sub: 'Things you already know.',
        back: '/morning',
        cardOpts: { hints: false, back: '/morning' },
        quitLabel: 'Enough — take me to the sheet',
        onQuit: finish,
        items,
        onItem: (rec) => done.push(rec),
        onFinish: finish,
      });
    }

    function finish() {
      teardown();
      const submittedAt = Date.now();
      if (done.length) {
        update((s) => {
          writeRun(s, {
            kind: 'morning', startedAt, submittedAt,
            items: done.map(r => ({ id: r.itemId, credit: r.firstTry ? 1 : 0, ms: r.result?.elapsedMs ?? 0 })),
          });
        });
      }
      const save = getState();
      const rd = readiness(save);
      setHeader({ readiness: rd.r, provisional: rd.provisional });
      const right = done.filter(r => r.firstTry).length;
      el.append(h('section.screen.tm-go', { 'aria-labelledby': 'tm-go-h' },
        h('div.card.tm-go-card',
          h('p.ob-eyebrow.muted.fs-1', 'Readiness'),
          h('p#tm-go-h.tm-go-num.mono', String(rd.r)),
          h('p.tm-go-band', rd.band.label),
          done.length ? h('p.muted.fs-2', `${right} of ${done.length} first try this morning.`) : null,
          h('p.fs-2', 'Read the sheet once. Then put the phone away — everything after this is noise.'),
          h('div.ob-nav',
            h('a.btn', { href: '#/sheet' }, 'The sheet'),
            h('a.btn.btn-primary.tm-go-btn', { href: '#/today' }, 'Go.'),
          ),
        ),
        h('p.muted.fs-1.tm-after', 'Everything else is behind “after the test”.'),
      ));
      window.scrollTo(0, 0);
    }

    loadAll().then(() => { if (alive) intro(); });
    el.append(h('section.screen', h('p.muted', 'Loading…')));
    return () => { alive = false; teardown(); };
  };
}

/* ------------------------------------------------------------------ Post-test */

/** The last prediction the student made (Mock "Predict your score"), or null. */
function lastPrediction(save) {
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (isObj(r) && Number.isFinite(r.pred)) return { pred: r.pred, kind: String(r.kind).split(':')[0], at: r.submittedAt ?? r.startedAt ?? null };
  }
  const m = latestMock(save);
  return m ? { pred: null, kind: m.kind, at: m.at, scored: Math.round(m.accuracy * 100) } : null;
}

/** `#/run/post` — and what `#/night` / `#/morning` show once the test is behind us. */
export function mountPostTest() {
  return (el) => {
    let alive = true;
    function render() {
      if (!alive) return;
      el.replaceChildren();
      const save = getState();
      const pred = lastPrediction(save);
      const have = save.postTest?.score;
      const rd = readiness(save);
      setHeader({ readiness: rd.r, provisional: rd.provisional });

      const input = h('input#pt-score', { type: 'number', min: '0', max: '100', step: '1', inputmode: 'numeric', value: Number.isFinite(have) ? String(have) : '', placeholder: '—' });
      const save100 = () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return;
        update(s => { if (!isObj(s.postTest)) s.postTest = { score: null }; s.postTest.score = Math.max(0, Math.min(100, Math.round(v))); s.postTest.at = Date.now(); });
        render();
      };

      el.append(h('section.screen.pt', { 'aria-labelledby': 'pt-h' },
        h('p.ob-eyebrow.muted.fs-1', 'After the test'),
        h('h1#pt-h', 'How did it go?'),
        h('div.card.ob-card',
          h('div.pt-row',
            h('label', { for: 'pt-score' }, 'Your real score'),
            input,
            h('span.muted', '/ 100'),
            h('button.btn.btn-primary', { type: 'button', onclick: save100 }, Number.isFinite(have) ? 'Update' : 'Save')),
          Number.isFinite(have)
            ? h('p.pt-line.fs-2',
              pred?.pred != null
                ? `You predicted ${pred.pred} · you scored ${have} · ${Math.abs(pred.pred - have) <= 5 ? 'called it.' : pred.pred > have ? `overconfident by ${pred.pred - have}.` : `you undersold yourself by ${have - pred.pred}.`}`
                : pred?.scored != null
                  ? `Your last practice run scored ${pred.scored} · the real thing was ${have}.`
                  : `Stored. ${have} / 100.`)
            : h('p.muted.fs-2', 'One number. It is stored next to your last prediction so the calibration line means something next unit.'),
        ),
        h('div.card.ob-card',
          h('h2.fs-3', 'Still open'),
          h('p.fs-2', 'The Binder, the Bosses and the Mock stay playable — none of it is scored against the test any more.'),
          h('div.ob-nav',
            h('a.btn', { href: '#/binder' }, 'Binder'),
            h('a.btn', { href: '#/stats' }, 'Stats'),
            h('a.btn.btn-ghost', { href: '#/settings' }, 'Set the next test date'),
          )),
      ));
    }
    render();
    return () => { alive = false; };
  };
}

/* ------------------------------------------------------------------ the /run dispatcher (interim) */

const NOT_MINE = {
  page: ['Today’s Page', 'T16'], blitz: ['BLITZ', 'T16'], drill: ['Drill 5', 'T16'], daily: ['Daily Challenge', 'T16'],
  full36: ['Full 36', 'T16'], missed: ['Missed originals', 'T16'], upgrade: ['Upgrade run', 'T16'], baseline: ['Baseline', 'T13'],
};

function notMine(kind, id) {
  const [name, ticket] = NOT_MINE[kind] ?? ['Run', 'T16'];
  return (el) => {
    const save = getState();
    const ip = save.inProgress;
    el.append(h('section.screen.run-stub', { 'aria-labelledby': 'run-stub-h' },
      h('p.muted.fs-1.mono', `#/run/${kind}${id ? '/' + id : ''}`),
      h('h1#run-stub-h', name),
      h('p.muted', `This run lands with ticket ${ticket}. Everything it needs is already in the save — nothing here is lost.`),
      kind === 'page' && ip?.queue?.length
        ? h('p.fs-2', `A page of ${ip.queue.length} items is composed and waiting at item ${Math.min(ip.idx + 1, ip.queue.length)}.`)
        : null,
      h('div.ob-nav',
        h('a.btn.btn-primary', { href: '#/today' }, 'Today'),
        h('a.btn', { href: '#/binder' }, 'Binder'),
        h('a.btn', { href: '#/sheet' }, 'Sheet'),
      )));
  };
}

/**
 * `screens['/run/:kind/:id?']` — T14's kinds (`night`, `morning`, `jump`, `post`) plus a readable stub
 * for the kinds T13/T16 own. When run.js lands it takes this pattern over; see notes/T14.md → Requests.
 */
export function mountRunKind(params, query, ctx) {
  const kind = String(params?.kind ?? '').toLowerCase();
  const save = getState();
  const post = modeFor(save) === 'post';
  if (kind === 'post') return mountPostTest(params, query);
  if (kind === 'night') return post ? mountPostTest(params, query) : mountNight(params, query);
  if (kind === 'morning') return post ? mountPostTest(params, query) : mountMorning(params, query);
  if (kind === 'jump') return mountJump(params, query);
  return notMine(kind, params?.id ?? null);
}

export default mountNight;
