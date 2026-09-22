// tests/job-index.test.mjs — J7. The Fault Index, the Backchecks and the two meta surfaces.
//
// Every acceptance line of G8's J7 row is measured here, with the number printed in notes/J7.md:
//   · all 68 tags present and grouped by the 11 AREAS
//   · sealed requires 3 clean resolutions on 3 DISTINCT days with no trigger in the window
//   · tellFor returns a tag for every one of the 19 skill ids — ASN-PLP and ASN-ANG included — out of
//     `save.errors` alone, with no card-data change (data/cards/asn.js still holds zero `tag:` entries)
//   · resolve() sets `cleared` and drops the tell to 1.00 the same tick
//   · a Backcheck changes the STAKE ONLY: bucket, mastery, error log, Rematch and the `calls[]` entry
//     are byte-identical to an unshielded miss
//   · mint requires dues ≥ 1 ∧ all cleared, cap 3, none on the vault
//   · every probability visible in the game has a Settings panel printing its formula
//   · Readiness on Home is byte-identical with the layer on and off for the same save
//
// The two screens are asserted over their SOURCE, the way `fix5-home.test.mjs` asserts the Readiness
// panel: there is no DOM under `node --test` and this repo runs its real rendering through Playwright
// in `qa/` (BUILD-POLICY §3).

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './_helpers.mjs';

import * as index from '../site/js/job/index.js';
import * as state from '../site/js/job/state.js';
import { AREAS, TAGS, MISCONCEPTIONS } from '../site/data/misconceptions.js';
import { SKILL_IDS } from '../site/data/skills.js';
import { byId as cardById, cards as ALL_CARDS } from '../site/data/cards.js';
import { todayISO, addDays } from '../site/js/days.js';
import { DAY_MS } from '../site/js/schedule.js';
import { templates } from '../site/data/templates.js';
import { WINGS, BACKCHECK, FAULT_INDEX, TAG_RECORD_DEFAULT } from '../site/data/job.js';
import { settle, tellFor as tellMultOf } from '../site/js/job/econ.js';
import { callEntry, windowPush, weightOf } from '../site/js/job/call.js';
import { trophies, trophyById, GAME_WING_IDS } from '../site/data/trophies.js';
import { check as trophyCheck, makeCtx } from '../site/js/trophies.js';
import { fresh, migrate, SAVE_VERSION } from '../site/js/store.js';
import { readiness } from '../site/js/readiness.js';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/** Source with its comments removed — a grep for `window` must not trip over the word "window". */
const bare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const SETTINGS = read('site/js/screens/settings.js');
const STATS = read('site/js/screens/stats.js');
const INDEX_SRC = read('site/js/job/index.js');
const AT = new Date(2026, 8, 16, 10, 0, 0).getTime();

const emptySave = () => ({ game: { tags: {} }, errors: [] });
const CARD_INDEX = { cards: cardById, templates };

/* ================================================================================================
   1. The 68 cells, in the 11 areas
   ================================================================================================ */

describe('J7 — the Fault Index is 68 entries in 11 areas', () => {
  test('areaRollup prints every one of the 68 tags, grouped by data/misconceptions.js own AREAS', () => {
    const roll = index.areaRollup(emptySave());
    assert.equal(roll.length, AREAS.length);
    assert.equal(roll.length, FAULT_INDEX.areas, '11 areas');
    assert.deepEqual(roll.map(a => a.id), AREAS.map(a => a.id), 'AREAS order, verbatim');
    const flat = roll.flatMap(a => a.tags.map(c => c.tag));
    assert.equal(flat.length, TAGS.length);
    assert.equal(flat.length, FAULT_INDEX.tags, '68 tags');
    assert.equal(index.TAG_COUNT, 68);
    assert.deepEqual([...flat].sort(), [...TAGS].sort(), 'the cells ARE the catalogue — no tag added, none dropped');
    assert.equal(new Set(flat).size, flat.length, 'no tag appears in two areas');
    for (const a of roll) for (const c of a.tags) assert.equal(MISCONCEPTIONS[c.tag].area, a.id, `${c.tag} is in its own area`);
  });

  test('a fresh save shows 68 untouched cells and a score of 0 / 68', () => {
    const p = index.indexProgress(emptySave());
    assert.deepEqual(
      { sealed: p.sealed, cleared: p.cleared, live: p.live, untouched: p.untouched, total: p.total },
      { sealed: 0, cleared: 0, live: 0, untouched: 68, total: 68 });
    assert.deepEqual(index.sealedOf(emptySave()), []);
    assert.deepEqual(p.milestones, [{ need: 25, have: 0, met: false }, { need: 68, have: 0, met: false }]);
  });

  test('every cell carries its wing, so the index and the guard agree about where a fault lives', () => {
    const roll = index.areaRollup(emptySave());
    const wings = new Set(WINGS.map(w => w.id));
    for (const a of roll) {
      for (const c of a.tags) {
        if (a.id === 'general') { assert.equal(c.wing, null, 'a general tag resolves to the target card wing, by design'); continue; }
        assert.ok(wings.has(c.wing), `${c.tag} → ${c.wing}`);
      }
    }
  });

  test('the default export IS the namespace — the two import forms answer the same questions', () => {
    /* `screens/job.js` imports `{ tellHookFor }`, `screens/run.js` imports `* as jobIndex`, and
       `screens/home.js` imports the module lazily. A curated default export that silently omits
       `tellHookFor` — the function this module's own docblock calls "the single definition of it" —
       hands `undefined` to whichever surface picks the default form. */
    const named = Object.keys(index).filter((k) => k !== 'default').sort();
    const def = Object.keys(index.default).sort();
    assert.deepEqual(def, named, 'the default export and the namespace disagree');
    assert.equal(index.default.tellHookFor, index.tellHookFor, 'the board hook is on both forms');
    assert.equal(typeof index.default.tellHookFor({ game: {}, errors: [] }, CARD_INDEX), 'function');
  });

  test('a record is exactly G7 shape — `days` is a COUNT, never an array', () => {
    assert.deepEqual(index.freshTag(), { ...TAG_RECORD_DEFAULT });
    assert.deepEqual(Object.keys(index.freshTag()).sort(), ['cleared', 'days', 'lastDay', 'resolved', 'sealed', 'triggered']);
    const repaired = index.recordOf({ game: { tags: { 'dropped-gcf': { days: ['2026-09-14', '2026-09-15'], resolved: 2 } } } }, 'dropped-gcf');
    assert.equal(repaired.days, 2, 'an array left by an older save is read as its length');
    assert.equal(typeof repaired.days, 'number');
  });
});

/* ================================================================================================
   2. Sealing — 3 clean resolutions, 3 distinct days, no re-trigger in the window
   ================================================================================================ */

describe('J7 — sealed requires 3 clean resolutions on 3 DISTINCT days with no trigger in the window', () => {
  const days = ['2026-09-15', '2026-09-16', '2026-09-17'];

  test('three resolutions on three days seal it — and not one step sooner', () => {
    assert.equal(FAULT_INDEX.sealResolutions, 3);
    assert.equal(FAULT_INDEX.sealDistinctDays, 3);
    let s = index.trigger(emptySave(), 'dropped-gcf').save;
    const seen = [];
    for (const d of days) { const r = index.resolve(s, 'dropped-gcf', { day: d }); s = r.save; seen.push(r.record.sealed); }
    assert.deepEqual(seen, [false, false, true], 'it seals on the third day and not before');
    assert.deepEqual(index.sealedOf(s), ['dropped-gcf']);
    assert.equal(index.recordOf(s, 'dropped-gcf').days, 3);
  });

  test('three resolutions on TWO days do not seal it', () => {
    let s = index.trigger(emptySave(), 'dropped-gcf').save;
    for (const d of ['2026-09-15', '2026-09-15', '2026-09-16']) s = index.resolve(s, 'dropped-gcf', { day: d }).save;
    const r = index.recordOf(s, 'dropped-gcf');
    assert.deepEqual({ resolved: r.resolved, days: r.days, sealed: r.sealed }, { resolved: 3, days: 2, sealed: false });
  });

  test('alternating two dates can never seal — `days` counts three DISTINCT days, not three changes', () => {
    /* The record stores a COUNT plus one date (G7), so "3 distinct days" can only be enforced as 3
       FORWARD day-changes. Before this was enforced, A, B, A reached `days = 3` on TWO distinct days
       and sealed — 68 cells, `index-25`, `index-68` and the completion certificate for one backwards
       clock move, with no re-trigger and no play in between. */
    const A = '2026-09-15', B = '2026-09-16';
    let s = index.trigger(emptySave(), 'dropped-gcf').save;
    const seen = [];
    for (const d of [A, B, A, B, A, B]) { const r = index.resolve(s, 'dropped-gcf', { day: d }); s = r.save; seen.push(r.record.sealed); }
    assert.deepEqual(seen, [false, false, false, false, false, false],
      'alternating two dates sealed a tag — that is two distinct days, not three');
    assert.equal(index.recordOf(s, 'dropped-gcf').days <= 2, true, 'two dates produced more than two days');
    assert.deepEqual(index.sealedOf(s), [], 'the certificate counted a day the student never played');

    /* the backwards day RESTARTS the window at itself, the way a re-trigger does */
    let w = index.trigger(emptySave(), 'middle-term').save;
    for (const d of [A, B]) w = index.resolve(w, 'middle-term', { day: d }).save;
    assert.deepEqual({ ...index.recordOf(w, 'middle-term') },
      { resolved: 2, triggered: 1, days: 2, lastDay: B, cleared: true, sealed: false });
    const back = index.resolve(w, 'middle-term', { day: A });
    assert.deepEqual({ resolved: back.record.resolved, days: back.record.days, lastDay: back.record.lastDay },
      { resolved: 1, days: 1, lastDay: A }, 'a day earlier than lastDay did not restart the window');
    assert.equal(back.changed, true, 'the resolution itself still counted and still cleared the tell');
    assert.equal(index.tellMultiplierOf(back.save, 'middle-term'), 1);

    /* and it is self-healing, not a stall: a clock that ran AHEAD and was corrected can still seal */
    let ahead = index.trigger(emptySave(), 'sign-flip').save;
    ahead = index.resolve(ahead, 'sign-flip', { day: '2030-01-01' }).save;      // the wrong clock
    for (const d of [A, B, '2026-09-17']) ahead = index.resolve(ahead, 'sign-flip', { day: d }).save;
    assert.equal(index.recordOf(ahead, 'sign-flip').sealed, true,
      'a corrected clock stalled the seal behind a date the student cannot reach again');
  });

  test('a re-trigger inside the window resets the count — that is what "no re-triggers" means in the record', () => {
    let s = index.trigger(emptySave(), 'middle-term').save;
    s = index.resolve(s, 'middle-term', { day: days[0] }).save;
    s = index.resolve(s, 'middle-term', { day: days[1] }).save;
    assert.equal(index.recordOf(s, 'middle-term').resolved, 2);
    s = index.trigger(s, 'middle-term').save;
    const after = index.recordOf(s, 'middle-term');
    assert.deepEqual({ resolved: after.resolved, days: after.days, lastDay: after.lastDay, cleared: after.cleared },
      { resolved: 0, days: 0, lastDay: null, cleared: false });
    assert.equal(after.triggered, 2, 'the LIFETIME trigger count survives — it is what the tell ranks by');
    // and the third resolution after the break does not seal
    assert.equal(index.resolve(s, 'middle-term', { day: days[2] }).record.sealed, false);
  });

  test('sealing retires the tag for good: a later trigger counts but never re-opens the cell', () => {
    let s = index.trigger(emptySave(), 'dropped-gcf').save;
    for (const d of days) s = index.resolve(s, 'dropped-gcf', { day: d }).save;
    const t = index.trigger(s, 'dropped-gcf');
    assert.equal(t.record.sealed, true);
    assert.equal(t.record.triggered, 2);
    assert.equal(index.tellMultiplierOf(t.save, 'dropped-gcf'), 1, 'a sealed tag never pays a tell again');
    assert.equal(index.isLive(t.save, 'dropped-gcf'), false);
  });

  test('trigger / resolve are PURE — the save handed in is never mutated', () => {
    const before = emptySave();
    const snapshot = JSON.stringify(before);
    const t = index.trigger(before, 'sign-flip');
    const r = index.resolve(t.save, 'sign-flip', { day: days[0] });
    assert.equal(JSON.stringify(before), snapshot, 'trigger mutated its argument');
    assert.notEqual(t.save, before);
    assert.notEqual(r.save, t.save);
    assert.equal(index.recordOf(t.save, 'sign-flip').triggered, 1);
  });

  test('an unknown tag is refused rather than given one of the 68 slots', () => {
    const r = index.trigger(emptySave(), 'not-a-real-tag');
    assert.deepEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: index.REFUSALS.UNKNOWN_TAG });
    assert.equal(index.resolve(emptySave(), 'not-a-real-tag').ok, false);
  });

  test('a clear the grader did not call CLEAN advances nothing — G2 seals on CLEAN resolutions', () => {
    const s = index.trigger(emptySave(), 'dropped-gcf').save;
    const r = index.resolve(s, 'dropped-gcf', { day: '2026-09-15', clean: false });
    assert.deepEqual({ reason: r.reason, changed: r.changed }, { reason: index.REFUSALS.NOT_CLEAN, changed: false });
    assert.deepEqual(index.recordOf(r.save ?? s, 'dropped-gcf'), index.recordOf(s, 'dropped-gcf'), 'the record moved');
    assert.equal(index.tellMultiplierOf(s, 'dropped-gcf'), 1.25, 'a hinted clear does not retire a live fault');
    // omitted (what state.js passes today) is treated as clean, so this seam changes no behaviour
    assert.equal(index.resolve(s, 'dropped-gcf', { day: '2026-09-15' }).record.resolved, 1);
  });
});

/* ================================================================================================
   2b. THE SEAL IS REACHABLE BY PLAYING — three simulated days through `state.applyTarget`
   ------------------------------------------------------------------------------------------------
   §2 above proves the MODULE's arithmetic by calling `resolve()` three times in a row, which is a
   sequence the wired app cannot produce: `state.applyTarget` is the only caller of `resolve()` in
   `site/js`, it resolves exactly the tag the priced target's TELL names, and it fires once per clean
   clear. Until this section existed, `tellDetail` dropped a tag the instant it was first resolved, so
   resolution #2 was unreachable and NOTHING could ever seal: 68 cells, both milestones, the
   completion certificate and the retirement half of G3.7 proof 3(e) were all dead. So the seal is
   asserted HERE the way a student reaches it — by answering.
   ================================================================================================ */

describe('J7 — a tag seals through the shipped state machine, over three distinct days', () => {
  const MAKE = 'FAC2';
  const TAG = 'middle-term';
  const MAKE_CARDS = ALL_CARDS.filter((c) => (c.skills ?? [])[0] === MAKE).slice(0, 8);
  const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, clean: true };
  const MISS = { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0 };
  /* The three clears that are NOT clean (G1's ladder rungs 1, 2, 3). HINT1 carries the grader's own
     `clean: false` the way `screens/card.js` writes it; ATT2 and ATT3 deliberately carry NO `clean`
     key at all — the shape every synthetic result in this repo has — because `state.applyTarget`
     passes neither to `resolve()`, and the rule must hold for both. */
  const HINT1 = { cleared: true, firstTry: true, hints: 1, attempt: 1, clean: false };
  const ATT2 = { cleared: true, firstTry: false, hints: 0, attempt: 2 };
  const ATT3 = { cleared: true, firstTry: false, hints: 0, attempt: 3 };

  /** A composed page of one make's cards, so the job is guaranteed to deal the make under test. */
  const pageFor = (day, dayIndex) => ({
    seed: 4100 + dayIndex, seedTag: `j7-seal-${dayIndex}`, meta: { day, dayIndex, pageIndex: 0 },
    queue: MAKE_CARDS.map((c, i) => ({
      n: i + 1, id: c.id, kind: 'card', role: 'practice', skill: (c.skills ?? [])[0],
      skills: (c.skills ?? []).slice(), tier: c.tier ?? 2, module: c.module, sheet: c.sheet ?? null,
      isReview: false, isRematch: false, isVariant: false, done: false, result: null,
    })),
  });

  /** Exactly what `screens/card.js logError` writes, at the moment it writes it. */
  const logError = (save, itemId, tags, at) => save.errors.push({
    item: itemId, seed: null, t: at, got: 'x', tags, cleared: false, part: 'a', template: null, forCard: null,
  });

  /**
   * One day of play, driven through the SHIPPED machine only — `startJob` → `lockCall` →
   * `applyTarget` → `push`, with `screens/job.js`'s own hook (`index.tellHookFor`) passed exactly as
   * `screens/job.js` passes it. Nothing here calls `index.resolve` or `index.trigger`.
   *
   * WHICH makes a job deals is `js/job/board.js`'s business, not this test's: `startJob` drafts its
   * own queue out of the posted board, so handing it a page of one make's cards guarantees nothing
   * (it stopped guaranteeing it when the board lane changed the recommendation, and this suite went
   * red for a reason that had nothing to do with the Fault Index). The make under test is therefore
   * whatever the board actually dealt — the error log is seeded with one line per DRAFTED card,
   * exactly the line `screens/card.js logError` writes, so every target carries TAG as its tell.
   * `tellDetail` counts out of `save.errors` ALONE, so that is the whole of what it takes, and the
   * assertions below stop depending on a draft this lane does not own.
   */
  function playDay(save, day, dayIndex, { missFirst = false, clear = CLEAN } = {}) {
    const clearFor = typeof clear === 'function' ? clear : () => clear;
    let at = AT + dayIndex * DAY_MS;
    const step = (ms) => (at += ms);
    save.inProgress = null;
    state.startJob(save, { today: day, now: at, page: pageFor(day, dayIndex), force: true });
    state.beginTargets(save, { now: step(6000) });
    for (const it of state.queueOf(save)) logError(save, it.id, [TAG], step(10));
    let n = 0;
    const seals = [];
    const beats = [];
    for (let guardN = 0; guardN < 200; guardN++) {
      const g = state.stateOf(save);
      if (!g || g.outcome != null) break;
      if (g.phase === 'envelope') { state.lockCall(save, 70, { now: step(5000) }); continue; }
      if (g.phase === 'answer') {
        n++;
        const item = state.currentItem(save);
        const plan = (missFirst && n === 1) ? MISS : clearFor(n);
        if (plan === MISS) logError(save, item.id, [TAG], step(100));
        const beat = state.applyTarget(save, plan, {
          now: step(40000), cards: cardById, tellFor: index.tellHookFor(save, CARD_INDEX),
        });
        beats.push({
          n, skill: item.skill, tell: beat.target?.tell?.tag ?? null, rung: beat.rung, ok: beat.ok,
          stamped: state.stateOf(save)?.last?.rung ?? null,
          record: index.recordOf(save, TAG),
        });
        if (beat.sealedTag) seals.push(beat.sealedTag);
        continue;
      }
      if (g.phase === 'payout' || g.phase === 'bagpush') { state.push(save, { now: step(9000) }); continue; }
      break;
    }
    return { targets: n, seals, beats };
  }

  function playerSave() {
    const s = fresh(AT - 20 * DAY_MS);
    s.profileId = 'j7-seal';
    s.settings.testDate = addDays(todayISO(new Date(AT)), 10);
    return s;
  }

  test('miss it once, then clear it cleanly on three distinct days — it seals, and not one day sooner', () => {
    const save = playerSave();
    const d0 = todayISO(new Date(AT));

    const day1 = playDay(save, d0, 0, { missFirst: true });
    const r1 = index.recordOf(save, TAG);
    assert.equal(r1.triggered, 1, 'the miss did not trigger the tag');
    assert.ok(r1.resolved >= 1, 'the clean clears after the miss did not resolve it');
    assert.deepEqual({ days: r1.days, sealed: r1.sealed }, { days: 1, sealed: false },
      'one day of play sealed it — G2 needs THREE distinct days');
    assert.deepEqual(day1.seals, []);

    playDay(save, addDays(d0, 1), 1);
    const r2 = index.recordOf(save, TAG);
    assert.deepEqual({ days: r2.days, sealed: r2.sealed }, { days: 2, sealed: false }, 'two days is not a seal');

    const day3 = playDay(save, addDays(d0, 2), 2);
    const r3 = index.recordOf(save, TAG);
    assert.equal(r3.sealed, true, 'three clean days of play did not seal the tag');
    assert.ok(r3.resolved >= index.SEAL.resolutions && r3.days >= index.SEAL.distinctDays);
    assert.deepEqual(day3.seals, [TAG], 'applyTarget did not report the seal the debrief line prints');

    /* the collection actually moves — this is the 68, the two milestones and the certificate */
    assert.deepEqual(index.sealedOf(save), [TAG]);
    const p = index.indexProgress(save);
    assert.equal(p.sealed, 1);
    assert.deepEqual(p.milestones.map(m => m.have), [1, 1]);

    /* and sealing RETIRES it: the error lines are all still in save.errors and the make offers nothing */
    assert.ok(save.errors.some(e => (e.tags ?? []).includes(TAG)), 'the error log was cleaned — the test is vacuous');
    assert.equal(index.tellFor(save, MAKE, CARD_INDEX), null, 'a sealed tag came back to the tell pool');
    assert.equal(index.tellMultiplierOf(save, TAG), 1);

    /* a later miss on a sealed tag counts and nothing else */
    playDay(save, addDays(d0, 3), 3, { missFirst: true });
    assert.equal(index.recordOf(save, TAG).sealed, true, 'a sealed cell re-opened');
    assert.equal(index.tellMultiplierOf(save, TAG), 1, 'a sealed tag started paying a tell again');
  });

  test('a re-trigger inside the window costs the days back, in the app and not just in the module', () => {
    const save = playerSave();
    const d0 = todayISO(new Date(AT));
    playDay(save, d0, 0, { missFirst: true });
    playDay(save, addDays(d0, 1), 1);
    assert.equal(index.recordOf(save, TAG).days, 2);
    playDay(save, addDays(d0, 2), 2, { missFirst: true });     // missed it again: the window breaks
    const r = index.recordOf(save, TAG);
    assert.equal(r.sealed, false, 'a broken window still sealed');
    assert.equal(r.days, 1, 'the re-trigger did not reset the seal window');
    assert.equal(r.triggered, 2, 'the LIFETIME trigger count is not a window');
  });

  test('the re-offered tag is priced at 1.00, so reaching the seal moves NO posted value', () => {
    /* the only record the pool gained is a cleared one, and econ prices it exactly like no tell */
    const t = index.trigger(emptySave(), 'dropped-gcf');
    const cleared = index.resolve(t.save, 'dropped-gcf', { day: '2026-09-15' }).record;
    assert.equal(cleared.cleared, true);
    assert.equal(tellMultOf(cleared), 1);
    const base = settle({ tier: 3, tell: null, call: 60, rung: 0 }, 0, 0);
    const offered = settle({ tier: 3, tell: cleared, call: 60, rung: 0 }, 0, 0);
    assert.deepEqual(offered, base, 'offering a resolved tag as the tell changed the payout');
  });

  test('a LIVE fault always outranks a resolved one — the ×1.25 slot is never taken by a cleared tag', () => {
    const save = emptySave();
    const line = (tags, t) => ({ item: 'fac-01', seed: null, t, got: 'x', tags, cleared: false, part: 'a', template: null, forCard: null });
    for (let i = 0; i < 5; i++) save.errors.push(line(['dropped-gcf'], AT + i));   // 5 triggers
    save.errors.push(line(['middle-term'], AT + 9));                              // 1 trigger
    assert.equal(index.tellFor(save, 'FAC2', CARD_INDEX).tag, 'dropped-gcf', 'most-triggered first');

    const resolved = index.resolve(save, 'dropped-gcf', { day: '2026-09-15' }).save;
    resolved.errors = save.errors;
    const detail = index.tellDetail(resolved, 'FAC2', CARD_INDEX);
    assert.equal(detail.tag, 'middle-term', 'a cleared 5-trigger tag outranked a live 1-trigger one');
    assert.equal(detail.record.live, true);
    assert.equal(tellMultOf(detail.record), 1.25);
    assert.deepEqual(detail.candidates.map(c => [c.tag, c.live]), [['middle-term', true], ['dropped-gcf', false]],
      'the resolved tag is still in the pool, but behind every live one');

    /* and once the live one is resolved too, the cleared pair is still offered — at 1.00 */
    const both = index.resolve(resolved, 'middle-term', { day: '2026-09-15' }).save;
    both.errors = save.errors;
    const after = index.tellFor(both, 'FAC2', CARD_INDEX);
    assert.equal(after.tag, 'dropped-gcf');
    assert.equal(after.live, false);
    assert.equal(tellMultOf(after), 1, 'the re-offer paid a multiplier');
  });

  /* ==============================================================================================
     2c. …AND ONLY CLEANLY. G2: "a tag is sealed when it has been resolved CLEANLY 3 times across 3
     distinct days", and G8's J7 row repeats it — "sealed requires 3 clean resolutions on 3 distinct
     days". The certificate reads "here are the sixty-eight mistakes I no longer make", which a card
     you got wrong twice and right on the third attempt has not earned. Every assertion below is made
     through `state.applyTarget`, because the gate is only worth anything if the SHIPPED machine has
     it: `resolve()` has honoured an explicit `clean: false` since round 1, and the state machine has
     never passed one.
     ============================================================================================== */

  const fresh68 = () => playerSave();

  for (const [label, plan, rung] of [['a hinted clear', HINT1, 1], ['an attempt-2 clear', ATT2, 2], ['an attempt-3 clear', ATT3, 3]]) {
    test(`${label} clears the card and resolves NOTHING — the seal counts CLEAN resolutions`, () => {
      const save = fresh68();
      const d0 = todayISO(new Date(AT));
      const day = playDay(save, d0, 0, { missFirst: true, clear: plan });

      /* not vacuous: the tag really was triggered, the tell really was offered back, and the student
         really did CLEAR the targets that offered it */
      const offered = day.beats.filter((b) => b.tell === TAG && b.ok === true);
      assert.ok(offered.length >= 1, 'no cleared target carried the tag as its tell — nothing was tested');
      assert.deepEqual([...new Set(offered.map((b) => b.rung))], [rung], 'the clears did not land on the rung under test');

      const r = index.recordOf(save, TAG);
      assert.equal(r.triggered, 1, 'the miss did not trigger the tag');
      assert.deepEqual({ resolved: r.resolved, days: r.days, cleared: r.cleared, sealed: r.sealed },
        { resolved: 0, days: 0, cleared: false, sealed: false },
        `${label} advanced the Fault Index — G2 seals on CLEAN resolutions only`);
      assert.equal(index.tellMultiplierOf(save, TAG), 1.25,
        `${label} retired a live fault: the ×1.25 G2 calls the best-paying thing in the game is gone`);
      assert.deepEqual(day.seals, []);
      assert.equal(index.tellFor(save, offered[0].skill, CARD_INDEX)?.tag, TAG, 'the fault left the tell pool');
    });
  }

  test('three attempt-3 days never seal, and the first clean day is the first one that counts', () => {
    const save = fresh68();
    const d0 = todayISO(new Date(AT));
    for (let d = 0; d < 3; d++) playDay(save, addDays(d0, d), d, { missFirst: d === 0, clear: ATT3 });
    const messy = index.recordOf(save, TAG);
    assert.deepEqual({ resolved: messy.resolved, days: messy.days, sealed: messy.sealed },
      { resolved: 0, days: 0, sealed: false }, 'three days of third-attempt clears sealed a tag');
    assert.deepEqual(index.sealedOf(save), [], 'the certificate counted a mistake the student still makes');

    /* and the road is still open: the same save seals on three CLEAN days after it */
    for (let d = 3; d < 6; d++) playDay(save, addDays(d0, d), d);
    const clean = index.recordOf(save, TAG);
    assert.equal(clean.days, 3, 'the clean days did not count');
    assert.equal(clean.sealed, true, 'clean play after messy play could not seal');
  });

  test('the rung `applyTarget` stamps belongs to the target the Fault Index is resolving FOR', () => {
    /* The gate reads `inProgress.game.last.rung` when the caller passes no `clean` flag, which is
       only sound because `applyTarget` stamps `last` for THIS target BEFORE it touches the index.
       Mixed play inside ONE job pins it: target 2 is an attempt-3 clear and must move nothing;
       target 3 is clean and must resolve on the same day, same make, same tell. */
    const save = fresh68();
    const day = playDay(save, todayISO(new Date(AT)), 0, { missFirst: true, clear: (n) => (n === 2 ? ATT3 : CLEAN) });
    assert.ok(day.beats.length >= 3, 'the job dealt too few targets to mix the rungs');
    for (const b of day.beats) {
      assert.equal(b.stamped, b.rung, `last.rung is not this target's rung (target ${b.n})`);
    }
    assert.deepEqual(day.beats[1].rung, 3);
    assert.deepEqual(
      { afterMessy: day.beats[1].record.resolved, afterClean: day.beats[2].record.resolved },
      { afterMessy: 0, afterClean: 1 },
      'the messy clear and the clean one were not told apart inside one job');
    assert.equal(day.beats[1].record.cleared, false, 'the attempt-3 clear retired the tell mid-job');
  });
});

/* ================================================================================================
   3. resolve() drops the tell to 1.00 the same tick
   ================================================================================================ */

describe('J7 — resolve() sets cleared and the tell falls to 1.00 in the same tick', () => {
  test('triggered → ×1.25, resolved → ×1.00, with no second call in between', () => {
    const t = index.trigger(emptySave(), 'dropped-gcf');
    assert.equal(index.tellMultiplierOf(t.save, 'dropped-gcf'), 1.25);
    const r = index.resolve(t.save, 'dropped-gcf', { day: '2026-09-15' });
    assert.equal(r.record.cleared, true);
    assert.equal(tellMultOf(r.record), 1, 'econ.tellFor reads the record J7 just wrote');
    assert.equal(index.tellMultiplierOf(r.save, 'dropped-gcf'), 1);
  });

  test('the posted value moves with it: the same target prices 25 % lower the instant the fault is resolved', () => {
    const t = index.trigger(emptySave(), 'dropped-gcf');
    const live = settle({ tier: 2, tell: index.recordOf(t.save, 'dropped-gcf'), call: 50, rung: 0 }, 0, 0);
    const r = index.resolve(t.save, 'dropped-gcf', { day: '2026-09-15' });
    const done = settle({ tier: 2, tell: index.recordOf(r.save, 'dropped-gcf'), call: 50, rung: 0 }, 0, 0);
    assert.equal(live.delta, 23);          // 18 × 1.25
    assert.equal(done.delta, 18);
    assert.equal(index.sealedLine('dropped-gcf'), 'dropped-gcf sealed · tell 1.00');
  });
});

/* ================================================================================================
   4. The tell, for every one of the 19 makes, out of save.errors alone
   ================================================================================================ */

describe('J7 — tellFor names a tag for all 19 makes, from save.errors, with no card-data change', () => {
  /** One error line in EXACTLY the shape `screens/card.js logError` writes. */
  const errline = (item, tags, { t = AT, template = null, forCard = null } = {}) =>
    ({ item, seed: null, t, got: 'x', tags, cleared: false, part: 'a', template, forCard });

  /** The first card (or template) that teaches each make — the same lookup the composer uses. */
  function itemForSkill(skill) {
    for (const [id, c] of Object.entries(cardById)) if ((c.skills ?? []).includes(skill)) return { item: id };
    for (const [id, t] of Object.entries(templates)) if ((t.skills ?? []).includes(skill)) return { item: `${id}#s1`, template: id };
    return null;
  }

  test('data/cards/asn.js still holds zero authored tags — the tell is skill-keyed, not card-keyed', () => {
    const asn = read('site/data/cards/asn.js');
    assert.equal((bare(asn).match(/\btag\s*:/g) ?? []).length, 0, 'G10 #26: the data wins, no migration happens');
    const asnCards = Object.values(cardById).filter(c => /^(asn|qz)-/.test(c.id));
    assert.equal(asnCards.length, 54, 'the 54 Always/Sometimes/Never statements');
    for (const c of asnCards) {
      assert.equal((c.misconceptions ?? []).length, 0, `${c.id} carries an authored misconception`);
      for (const part of (c.parts ?? [])) assert.equal(part.tag, undefined, `${c.id}/${part.id} carries a tag`);
    }
    // 14 of the 100 skill weight, and not one authored tag between them (G4): whatever tell ASN-PLP and
    // ASN-ANG carry has to be read back out of the error log the graders write.
    const tagged = Object.values(cardById).filter(c => (c.misconceptions ?? []).some(m => m && m.tag));
    assert.deepEqual(tagged.filter(c => /^(asn|qz)-/.test(c.id)).map(c => c.id), []);
  });

  test('all 19 skill ids produce a tell', () => {
    const save = emptySave();
    const tags = ['dropped-gcf', 'wrong-reason', 'sign-flip', 'gave-angle', 'ray-order'];
    SKILL_IDS.forEach((skill, i) => {
      const src = itemForSkill(skill);
      assert.ok(src, `no card or template teaches ${skill}`);
      save.errors.push(errline(src.item, [tags[i % tags.length]], { t: AT + i * 1000, template: src.template ?? null }));
    });
    const named = SKILL_IDS.filter(s => index.tellFor(save, s, CARD_INDEX) != null);
    assert.deepEqual(named, [...SKILL_IDS], `every make carries a tell; missed: ${SKILL_IDS.filter(s => !named.includes(s))}`);
    assert.equal(named.length, 19);
  });

  test('ASN-PLP and ASN-ANG read the asn grader’s own four tags back off the error log', () => {
    // `js/grader/asn.js` emits exactly these, and writes them through card.js into save.errors.
    for (const tag of ['overgeneralised', 'undergeneralised', 'flipped-verdict', 'wrong-reason']) {
      assert.ok(Object.hasOwn(MISCONCEPTIONS, tag), `${tag} is catalogued`);
    }
    const save = emptySave();
    save.errors.push(errline('asn-01', ['flipped-verdict'], { t: AT }));         // ASN-ANG
    save.errors.push(errline('asn-01', ['flipped-verdict'], { t: AT + 1 }));
    save.errors.push(errline('asn-01', ['wrong-reason'], { t: AT + 2 }));
    save.errors.push(errline('fact-01', ['overgeneralised'], { t: AT + 3 }));    // ASN-PLP
    const ang = index.tellDetail(save, 'ASN-ANG', CARD_INDEX);
    const plp = index.tellDetail(save, 'ASN-PLP', CARD_INDEX);
    assert.equal(ang.tag, 'flipped-verdict');
    assert.equal(ang.triggered, 2, 'the most-triggered tag on that make wins');
    assert.equal(ang.source, 'errors');
    assert.equal(plp.tag, 'overgeneralised');
    assert.equal(index.tellFor(save, 'ASN-ANG', CARD_INDEX).title, MISCONCEPTIONS['flipped-verdict'].title);
  });

  test('the record it returns is exactly what econ.tellFor and J5’s board read', () => {
    const save = emptySave();
    save.errors.push(errline('fac-01', ['dropped-gcf'], { t: AT }));
    const rec = index.tellFor(save, 'FAC2', CARD_INDEX);
    for (const k of ['triggered', 'cleared', 'sealed']) assert.ok(k in rec, `the board needs ${k}`);
    assert.equal(tellMultOf(rec), 1.25);
    assert.equal(rec.tag, 'dropped-gcf');
    assert.equal(rec.wing, 'ALGEBRA');
  });

  test('a resolved tag drops BEHIND every live one the same tick; a SEALED one leaves the pool', () => {
    /* The title used to say a resolved tag "leaves the tell pool", which is not what this module
       does and not what the assertion below shows: `tellDetail` keeps a cleared-but-unsealed tag,
       ranked behind every live one, because `state.applyTarget` resolves the tag the tell names and
       a seal needs three of those (index.js header, §2b). Only SEALING removes it, and that half was
       never asserted here — so it is asserted here now. */
    const save = emptySave();
    save.errors.push(errline('fac-01', ['dropped-gcf'], { t: AT }));
    save.errors.push(errline('fac-01', ['middle-term'], { t: AT }));
    assert.equal(index.tellFor(save, 'FAC2', CARD_INDEX).tag, 'dropped-gcf', 'catalogue order breaks the 1–1 tie');
    const resolved = index.resolve(save, 'dropped-gcf', { day: '2026-09-15' }).save;
    resolved.errors = save.errors;
    assert.equal(index.tellFor(resolved, 'FAC2', CARD_INDEX).tag, 'middle-term', 'the resolved tag still outranked a live one');
    assert.deepEqual(index.tellDetail(resolved, 'FAC2', CARD_INDEX).candidates.map((c) => [c.tag, c.live]),
      [['middle-term', true], ['dropped-gcf', false]], 'the resolved tag left the pool — resolution #2 is now unreachable');

    /* sealing is the only thing that removes it: three clean resolutions on three forward days */
    let sealed = resolved;
    for (const d of ['2026-09-16', '2026-09-17']) sealed = index.resolve(sealed, 'dropped-gcf', { day: d }).save;
    sealed.errors = save.errors;
    assert.equal(index.isSealed(sealed, 'dropped-gcf'), true, 'three clean forward days did not seal it');
    assert.deepEqual(index.tellDetail(sealed, 'FAC2', CARD_INDEX).candidates.map((c) => c.tag), ['middle-term'],
      'a SEALED tag is still in the tell pool');
    assert.ok(save.errors.some((e) => (e.tags ?? []).includes('dropped-gcf')), 'the error log was cleaned — the test is vacuous');
  });

  test('ties break by the most recent trigger, then by catalogue order — never by a random number', () => {
    const save = emptySave();
    save.errors.push(errline('fac-01', ['middle-term'], { t: AT + 50 }));
    save.errors.push(errline('fac-01', ['dropped-gcf'], { t: AT + 10 }));
    assert.equal(index.tellFor(save, 'FAC2', CARD_INDEX).tag, 'middle-term');
    assert.equal(index.tellFor(save, 'FAC2', CARD_INDEX).tag, 'middle-term', 'and again, identically');
  });

  test('with no index the answer is an honest null, and it says which kind of nothing it is', () => {
    const save = emptySave();
    save.errors.push(errline('fac-01', ['dropped-gcf'], { t: AT }));
    const blind = index.tellDetail(save, 'FAC2');
    assert.equal(blind.tag, null);
    assert.equal(blind.source, 'no-index', 'a forgotten opts.cards is diagnosable, not silent');
    assert.equal(index.tellDetail(emptySave(), 'FAC2', CARD_INDEX).source, 'none');
  });

  test('tellsFor gives the board all 19 in one pass', () => {
    const save = emptySave();
    save.errors.push(errline('fac-01', ['dropped-gcf'], { t: AT }));
    const all = index.tellsFor(save, CARD_INDEX);
    assert.deepEqual(Object.keys(all), [...SKILL_IDS]);
    assert.equal(all['FAC2'].tag, 'dropped-gcf');
    assert.equal(all['VOC'], null);
  });
});

/* ================================================================================================
   5. Backchecks — the stake and only the stake
   ================================================================================================ */

describe('J7 — a Backcheck changes the STAKE ONLY', () => {
  const target = { tier: 2, skill: 'FAC2', call: 85, rung: 4 };

  test('the stake half: the chain holds and LOOSE is untouched', () => {
    const bare = settle({ ...target }, 4, 300);
    const shielded = settle({ ...target, shielded: true }, 4, 300);
    assert.ok(bare.delta < 0 && bare.chain === 0, 'an unshielded miss takes loose and resets the chain');
    assert.equal(shielded.delta, 0);
    assert.equal(shielded.loose, 300);
    assert.equal(shielded.chain, 4, 'the chain holds');
  });

  test('the rating half: the calls[] entry is BYTE-IDENTICAL, shielded or not (G12 #26)', () => {
    const args = { call: 85, ok: false, qHat: 0.7, skill: 'FAC2', at: AT };
    const unshielded = callEntry(args);
    const withShield = callEntry(args);            // a Backcheck is not an argument to the rating at all
    assert.equal(JSON.stringify(withShield), JSON.stringify(unshielded));
    const w1 = windowPush([], unshielded);
    const w2 = windowPush([], withShield);
    assert.equal(JSON.stringify(w1), JSON.stringify(w2));
    assert.equal(w1.length, 1, 'the miss enters the window either way');
    /* `weightOf`, not `.w`: since verify round 2 a q̂-derived slot stores the q̂ and the weight is
       derived from it (`call.callEntry` — the rank cap has to know what material the call was made
       on, and `w = K·q̂(1−q̂)` is two-to-one). The claim is unchanged: the miss enters the window
       weighing what the evidence says, shielded or not. */
    assert.ok(weightOf(w1[0]) >= 0.25 && w1[0].ok === false);
    // and the file that spends it never mentions the rating
    assert.ok(!/callEntry|windowPush|ratingFrom/.test(bare(INDEX_SRC)), 'spend() must not be able to touch the rating window');
  });

  test('spend() moves the counter and nothing else in the save', () => {
    const s = fresh(AT);
    s.game.backchecks.held = 2;
    s.cards['fac-01'] = { bucket: 3, cleared: true };
    s.skills['FAC2'] = { m: 80, n: 5 };
    s.errors.push({ item: 'fac-01', tags: ['dropped-gcf'], cleared: false, t: AT });
    const before = JSON.parse(JSON.stringify(s));
    const r = index.spend(s);
    assert.deepEqual({ ok: r.ok, from: r.from, held: r.held }, { ok: true, from: 2, held: 1 });
    const after = JSON.parse(JSON.stringify(r.save));
    after.game.backchecks = before.game.backchecks;      // the one key it is allowed to move
    assert.deepEqual(after, before, 'bucket, mastery, the error log and everything else are byte-identical');
    assert.equal(s.game.backchecks.held, 2, 'and the save handed in is not mutated');
  });

  test('none on the vault, and none when none are held', () => {
    assert.equal(BACKCHECK.allowedOnVault, false);
    const s = fresh(AT); s.game.backchecks.held = 3;
    assert.deepEqual(index.canSpend(s, { vault: true }), { ok: false, reason: 'on-vault', held: 3 });
    assert.equal(index.spend(s, { vault: true }).ok, false);
    const empty = fresh(AT);
    assert.deepEqual(index.canSpend(empty), { ok: false, reason: 'none-held', held: 0 });
  });
});

describe('J7 — the mint: dues ≥ 1 ∧ all cleared, cap 3, one a day', () => {
  const day = '2026-09-16';

  test('a day with dues, all cleared, mints one', () => {
    const r = index.mint(fresh(AT), { day, dues: 4, duesCleared: true });
    assert.deepEqual({ ok: r.ok, held: r.held, source: r.source }, { ok: true, held: 1, source: 'dues' });
  });

  test('a day with ZERO dues mints nothing (G12 #38)', () => {
    const r = index.mint(fresh(AT), { day, dues: 0, duesCleared: true });
    assert.deepEqual({ ok: r.ok, reason: r.reason, held: r.held }, { ok: false, reason: 'no-dues', held: 0 });
    assert.equal(BACKCHECK.requiresDuesAtLeast, 1);
  });

  test('dues left open mint nothing', () => {
    const r = index.mint(fresh(AT), { day, dues: 5, duesCleared: 3 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'dues-open');
    assert.equal(index.mint(fresh(AT), { day, dues: 5, duesCleared: 5 }).ok, true);
  });

  test('one a day, whatever the source', () => {
    const first = index.mint(fresh(AT), { day, dues: 1, duesCleared: true });
    const second = index.mint(first.save, { day, dues: 1, duesCleared: true });
    assert.deepEqual({ ok: second.ok, reason: second.reason }, { ok: false, reason: 'already-minted' });
    const tomorrow = index.mint(first.save, { day: '2026-09-17', dues: 1, duesCleared: true });
    assert.deepEqual({ ok: tomorrow.ok, held: tomorrow.held }, { ok: true, held: 2 });
  });

  test('the cap is 3 held', () => {
    const s = fresh(AT); s.game.backchecks.held = 3;
    const r = index.mint(s, { day, dues: 9, duesCleared: true });
    assert.deepEqual({ ok: r.ok, reason: r.reason, held: r.held }, { ok: false, reason: 'at-cap', held: 3 });
    assert.equal(BACKCHECK.max, 3);
  });

  test('a clean vault mints one; a vault that spent one does not', () => {
    assert.equal(index.mint(fresh(AT), { day, vault: true, spentOnVault: false }).ok, true);
    assert.equal(index.mint(fresh(AT), { day, vault: true, spentOnVault: true }).ok, false);
  });
});

/* ================================================================================================
   6. The six trophy predicates
   ================================================================================================ */

describe('J7 — six pure trophy predicates', () => {
  const IDS = ['crew-held', 'index-25', 'index-68', 'chain-8', 'calibrated', 'clean-getaway'];

  test('all six exist, are pure predicates, and print their condition', () => {
    for (const id of IDS) {
      const t = trophyById[id];
      assert.ok(t, `${id} is in the catalogue`);
      assert.equal(typeof t.test, 'function');
      assert.ok(t.cond.length >= 10, `${id} prints what it takes`);
      assert.ok(['firsts', 'sheets', 'craft', 'runs', 'bosses', 'habit'].includes(t.group));
    }
    assert.equal(trophies.filter(t => IDS.includes(t.id)).length, 6);
  });

  test('data/trophies.js imports nothing from js/ and reads only the save', () => {
    const src = read('site/data/trophies.js');
    const imports = [...src.matchAll(/from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    assert.deepEqual(imports.filter(p => p.includes('/js/') || p.includes('../js')), [], 'data may not import js/');
    assert.ok(!/\bdocument\b|\bwindow\b|Math\.random|Date\.now/.test(bare(src)), 'a predicate is pure');
  });

  test('its local wing map deep-equals data/job.js WINGS, so the two can never drift', () => {
    assert.deepEqual([...GAME_WING_IDS], WINGS.map(w => w.id));
    const src = read('site/data/trophies.js');
    for (const w of WINGS) for (const s of w.skills) assert.ok(src.includes(`'${s}'`), `${s} is in the local map`);
  });

  test('crew-held: one manned make in each of the four wings', () => {
    const s = fresh(AT);
    s.game.crew = { VOC: 1, PAIRS: 1, 'CS-LIN': 1 };
    assert.equal(trophyById['crew-held'].test(makeCtx(s)), false);
    assert.deepEqual(trophyById['crew-held'].progress(makeCtx(s)), { have: 3, need: 4 });
    s.game.crew['FAC2'] = 2;
    assert.equal(trophyById['crew-held'].test(makeCtx(s)), true);
  });

  test('index-25 / index-68 count SEALED cells only', () => {
    let s = fresh(AT);
    for (const tag of TAGS.slice(0, 24)) {
      s = index.trigger(s, tag).save;
      for (const d of ['2026-09-15', '2026-09-16', '2026-09-17']) s = index.resolve(s, tag, { day: d }).save;
    }
    assert.equal(index.indexProgress(s).sealed, 24);
    assert.equal(trophyById['index-25'].test(makeCtx(s)), false);
    s = index.resolve(index.resolve(index.resolve(index.trigger(s, TAGS[24]).save, TAGS[24], { day: '2026-09-15' }).save, TAGS[24], { day: '2026-09-16' }).save, TAGS[24], { day: '2026-09-17' }).save;
    assert.equal(trophyById['index-25'].test(makeCtx(s)), true);
    assert.equal(trophyById['index-68'].test(makeCtx(s)), false);
    // a merely resolved (not sealed) tag does not count
    const soft = fresh(AT);
    for (const tag of TAGS.slice(0, 30)) soft.game.tags[tag] = { resolved: 1, triggered: 1, days: 1, lastDay: '2026-09-15', cleared: true, sealed: false };
    assert.equal(trophyById['index-25'].test(makeCtx(soft)), false);
  });

  test('chain-8 fires on the record or on the job running right now', () => {
    const s = fresh(AT);
    s.player.records.bestChain = 7;
    assert.equal(trophyById['chain-8'].test(makeCtx(s)), false);
    s.inProgress = { kind: 'job', game: { chain: 8 } };
    assert.equal(trophyById['chain-8'].test(makeCtx(s)), true, 'it can be earned mid-job, where it happens');
  });

  test('calibrated: a rolling Brier ≤ 0.10 over 20 informative calls, and not over 19', () => {
    const s = fresh(AT);
    const call = (p, ok) => ({ p, ok, w: 0.51, skill: 'FAC2', at: AT });
    s.player.rating.calls = Array.from({ length: 19 }, () => call(0.85, true));
    assert.equal(trophyById['calibrated'].test(makeCtx(s)), false, '19 calls is not a window');
    s.player.rating.calls.push(call(0.85, true));
    // mean Brier = (1 − 0.85)² = 0.0225
    assert.equal(trophyById['calibrated'].test(makeCtx(s)), true);
    s.player.rating.calls = Array.from({ length: 20 }, (_, i) => call(0.85, i % 2 === 0));
    // mean Brier = (0.0225 + 0.7225)/2 = 0.3725
    assert.equal(trophyById['calibrated'].test(makeCtx(s)), false);
  });

  test('clean-getaway reads the ledger stamp the Night Before pays', () => {
    const s = fresh(AT);
    assert.equal(trophyById['clean-getaway'].test(makeCtx(s)), false);
    s.player.records.cleanGetaway = true;
    assert.equal(trophyById['clean-getaway'].test(makeCtx(s)), true);
  });

  test('a fresh save earns none of the six', () => {
    const earned = trophyCheck(fresh(AT));
    assert.deepEqual(IDS.filter(id => earned.includes(id)), []);
  });
});

/* ================================================================================================
   7. Settings — every probability the game prints has its formula here
   ================================================================================================ */

describe('J7 — every probability visible in the game has a Settings panel printing its formula', () => {
  test('the five panels are built and painted', () => {
    for (const fn of ['callCard', 'guardCard', 'ladderCard', 'postedCard', 'ratingCard']) {
      assert.ok(new RegExp(`function ${fn}\\b`).test(SETTINGS), `${fn} is missing`);
      assert.ok(new RegExp(`${fn}\\(`).test(SETTINGS.split('function paint()')[1] ?? ''), `${fn} is never painted`);
    }
    assert.match(SETTINGS, /How the Call is scored/);
    assert.match(SETTINGS, /How the Guard draws/);
    assert.match(SETTINGS, /How the payout ladder works/);
    assert.match(SETTINGS, /How posted is computed/);
    assert.match(SETTINGS, /How the rating is computed/);
  });

  /** Every probability the layer puts in front of the student, and the formula that must be printed. */
  const PROBABILITIES = [
    ['the guard draw', /y = project\(\s*\(1 − ε\)·x̂ \+ ε·uniform_n/],
    ['the water-filling projection', /over = \{ i : y_i > cap \}/],
    ['an index that has been capped stays capped', /capped stays capped/],
    ['the stake weighting of x̂', /ωⱼ = min\(postedⱼ, \$\{GUARD\.jobWeightCap\} · Σₖ postedₖ\)/],
    ['ε by rank', /RANKS\.map\(r => `\$\{r\.name\} \$\{r\.eps\}`\)/],
    ['the ×2 posting', /1-in-\$\{Math\.round\(1 \/ X2\.p\)\} per target/],
    ['the carry EV', /EV = q·W − \(1 − q\)·P/],
    ['the Brier credit', /c\(p, o\) = \$\{CREDIT\.base\} − \$\{CREDIT\.k\}\(p − o\)²/],
    ['propriety', /dE\/dp = 0\s+⟺\s+p = q/],
    ['the EV-max table', /evTable\(q\)/],
    ['the two disagreement bands', /disagreementBands\(\)/],
    ['the rating window', /rating = clamp\(0, 10, \$\{RATING\.base\} \+ \$\{RATING\.scale\}·Σ\(wᵢ · cᵢ\) \/ N \)/],
    ['the informative weight', /w = \$\{RATING\.weightK\}·q̂\(1 − q̂\)/],
    ['the informative gate', /informativeBand\(RATING\.informativeMin\)/],
    ['the empty slot', /contributes 0, which pulls the rating toward exactly 5\.00/],
    ['the push/bag threshold', /q\* = θ\*\/\(1 \+ θ\*\)/],
    ['the shallow-pile threshold', /shallow pile q\* =/],
    ['the chain multiplier', /m_chain = 1 \+ \$\{CHAIN\.step\}·min\(chain, \$\{CHAIN\.cap\}\)/],
    ['the payout ladder', /ρ_eff = LADDER\[ max\(0, rung − crew rank\) \]/],
    ['the cold multiplier', /min\(1, overdue ÷ that card’s own interval\), capped/],
    ['the tell multiplier', /×\$\{TELL\} while the make has a triggered, unresolved, unsealed tag/],
    ['posted itself', /posted = round\( L · scope · wing · cold · tell · ×2 \)/],
    ['the Elo expectation', /E = 1 \/ \(1 \+ 10\^\(\(R_house − R_player\)\/\$\{ELO\.divisor\}\)\)/],
    ['the vault grade bands', /VAULT_GRADE\[1\]\.from/],
  ];

  for (const [what, re] of PROBABILITIES) {
    test(`Settings prints the formula for ${what}`, () => {
      assert.match(SETTINGS, re);
    });
  }

  test('the panels are rendered from the layer’s own constants, never retyped numerals', () => {
    for (const sym of ['CALL_LEVELS', 'RANKS', 'LADDER', 'LOOT', 'CHAIN', 'COLD', 'TELL', 'FEE', 'X2', 'GUARD', 'ELO', 'CREW_RANKS', 'BACKCHECK', 'RATING', 'CREDIT']) {
      assert.ok(new RegExp(`\\b${sym}\\b`).test(SETTINGS), `${sym} is imported but never printed from`);
    }
    assert.match(SETTINGS, /from '\.\.\/job\/call\.js'/);
    assert.match(SETTINGS, /from '\.\.\/\.\.\/data\/job\.js'/);
  });

  test('the toggle defaults ON and one switch kills the layer', () => {
    assert.match(SETTINGS, /s\.settings\.game !== false/, 'absent means on');
    assert.match(SETTINGS, /st\.settings\.game = v/, 'the switch writes it');
    assert.match(SETTINGS, /\.\.\.\(game \? \[callCard\(\), guardCard\(\), ladderCard\(\), postedCard\(\), ratingCard\(s\)\] : \[\]\)/,
      'with the layer off the five panels go with it');
    /* `settings.game` is now DECLARED and coerced in `store.js` (it was an undeclared pass-through
       key, the drift `ledger.debriefAt` was caught for). What this test has to pin is not that the
       store leaves it alone — it no longer does — but the DIRECTION of the coercion, because every
       reader is `settings.game !== false`: absent must still come back ON, and only a literal
       `false` may switch the layer off. */
    assert.equal(fresh(AT).settings.game, true, 'a fresh save does not have the layer on');
    assert.equal(migrate({ v: SAVE_VERSION }, AT).settings.game, true, 'a save with no switch came back OFF');
    assert.equal(migrate({ v: SAVE_VERSION, settings: { game: false } }, AT).settings.game, false,
      'the one switch that kills the layer stopped working');
  });

  test('Global law 6 holds: the EV-max table is in Settings and nowhere a call is made', () => {
    assert.ok(/argmaxCall|evTable|evMaxBands/.test(SETTINGS), 'Settings is the one pre-call-legal home');
    assert.ok(!/argmaxCall|evTable|evMaxBands/.test(INDEX_SRC), 'js/job/index.js never names the argmax');
  });
});

/* ================================================================================================
   8. Stats — the three panels and the crew grid, and no new route
   ================================================================================================ */

describe('J7 — the Stats panels', () => {
  test('three panels and the crew grid are built', () => {
    for (const fn of ['ledgerPanel', 'crewGrid', 'faultIndexPanel', 'reliabilityBlock']) {
      assert.ok(new RegExp(`function ${fn}\\b`).test(STATS), `${fn} is missing`);
    }
    assert.match(STATS, /section\('st-ledger', 'The Ledger'/);
    assert.match(STATS, /section\('st-index', 'Fault Index'/);
    assert.match(STATS, /game \? reliabilityBlock\(save\) : null/, 'reliability sits beside the Mock line');
  });

  test('the Ledger prints the records and BOTH Elo numbers', () => {
    for (const re of [/bestBag/, /bestChain/, /bestRating20/, /cleanJobs/, /rec\.cracked/, /rec\.walked/, /cleanGetaway/, /elo\.player/, /elo\.house/]) {
      assert.match(STATS, re);
    }
  });

  test('the crew grid prints the manned ≤ min(capacity, 12) counter', () => {
    assert.match(STATS, /budgetFor\(save\)/);
    assert.match(STATS, /capacityDetail\(save\)/);
    assert.match(STATS, /min\(\$\{budget\.capacity\}/, 'the counter is printed as min(capacity, 12)');
    assert.match(STATS, /budget\.mannedMax/);
  });

  test('the Fault Index panel draws all 68 through areaRollup, not a second implementation', () => {
    assert.match(STATS, /areaRollup\(save\)/);
    assert.match(STATS, /indexProgress\(save\)/);
    assert.ok(!/MISCONCEPTIONS\s*\[/.test(STATS), 'Stats never re-derives a cell');
  });

  test('no new route: every panel is a section of #/stats', () => {
    const registry = bare(read('site/js/screens/index.js'));
    assert.equal((registry.match(/screens\['\/stats'\]/g) ?? []).length, 1);
    assert.ok(!/screens\['\/ledger'\]|screens\['\/index'\]/.test(registry));
  });

  test('with settings.game = false the panels are not built at all', () => {
    assert.match(STATS, /const gameOn = \(save\) => save\?\.settings\?\.game !== false;/);
    assert.match(STATS, /if \(game\) \{/);
  });
});

/* ================================================================================================
   9. The prime directive — Readiness does not move, and js/job/index.js keeps the job/ discipline
   ================================================================================================ */

describe('J7 — the study layer is untouched', () => {
  test('Readiness is byte-identical with the layer on and off, for the same save', () => {
    const base = fresh(AT);
    base.skills = { VOC: { m: 72, n: 6 }, FAC2: { m: 40, n: 3 }, 'CS-LIN': { m: 88, n: 9 } };
    base.cards = { 'voc-01': { cleared: true, rarity: 'gold' }, 'fac-01': { cleared: true, rarity: 'silver' } };
    base.runs = [{ n: 1, kind: 'mock', status: 'done', acc: 0.72, items: [], submittedAt: AT }];
    // and a save that has PLAYED: player, game, tags, crew, a live job
    base.player.rating.calls = [{ p: 0.85, ok: true, w: 0.51, skill: 'FAC2', at: AT }];
    base.player.records.bestBag = 312;
    base.game.crew = { FAC2: 1 };
    base.game.tags = { 'dropped-gcf': { resolved: 3, triggered: 4, days: 3, lastDay: '2026-09-15', cleared: true, sealed: true } };

    const on = JSON.parse(JSON.stringify(base));
    const off = JSON.parse(JSON.stringify(base));
    on.settings.game = true;
    off.settings.game = false;
    assert.equal(JSON.stringify(readiness(on)), JSON.stringify(readiness(off)));
    const absent = JSON.parse(JSON.stringify(base));
    assert.equal(JSON.stringify(readiness(absent)), JSON.stringify(readiness(on)), 'and absent is the same as on');
  });

  test('readiness.js and home.js never read a game key', () => {
    const r = read('site/js/readiness.js');
    assert.ok(!/save\.game\b|save\.player\b|settings\.game\b/.test(r), 'no game term enters readiness.js');
    const home = read('site/js/screens/home.js');
    const ring = home.match(/readiness\([^)]*\)/g) ?? [];
    assert.ok(ring.length > 0, 'Home computes the ring with readiness()');
    assert.ok(!/from '\.\.\/job\//.test(home), 'J7 adds no job import to Home');
  });

  test('js/job/index.js is DOM-free, clock-free and seedless', () => {
    const src = bare(INDEX_SRC);
    assert.ok(!/\bdocument\b|\bwindow\b|localStorage/.test(src), 'no DOM');
    assert.ok(!/Math\.random/.test(src), 'no Math.random');
    for (const ident of ['Date', 'now', 'elapsed', 'performance']) {
      assert.ok(!new RegExp(`\\b${ident}\\b`).test(src), `js/job/* may not read the clock: found ${ident}`);
    }
    assert.ok(!/from '\.\.\/screens\//.test(INDEX_SRC), 'job/ never imports a screen');
  });

  test('it writes only save.game — never a study key', () => {
    const s = fresh(AT);
    s.cards['fac-01'] = { bucket: 4, cleared: true, rarity: 'gold' };
    s.skills['FAC2'] = { m: 62, n: 7 };
    s.xp = 4200;
    const before = JSON.parse(JSON.stringify(s));
    const after = index.resolve(index.trigger(s, 'dropped-gcf').save, 'dropped-gcf', { day: '2026-09-16' }).save;
    const copy = JSON.parse(JSON.stringify(after));
    copy.game = before.game;
    assert.deepEqual(copy, before, 'cards, skills, xp, errors, counters and runs are untouched');
  });

  test('the 68-tag cap holds even against a save carrying junk', () => {
    const junk = {};
    for (const t of TAGS) junk[t] = { resolved: 1, triggered: 1, days: 1, lastDay: '2026-09-15', cleared: true, sealed: false };
    junk['not-a-tag'] = { resolved: 9 };
    const capped = index.capTags(junk);
    assert.equal(Object.keys(capped).length, 68);
    assert.ok(!('not-a-tag' in capped));
  });
});
