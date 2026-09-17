// tests/fix5-integrate.test.mjs — fix5 integrator: the critic home r3 findings fixed at merge time
// (notes/S9-SCORECARD.md "What a student will notice first" #1, notes/HANDOFF.md).
//   1. A wrong OPTIONAL setup (logged to errors[], never charged) followed by a GOLD first-try clear no longer drops
//      Readiness or lists the skill as weak (was after-ace 57 → 50, "Weak spots · Diagram Algebra 7").
//   2. Owed idle-day decay is charged once: at boot (app.js, before the first screen) and by Home's housekeeping —
//      never a second time inside a clean answer's save (the two decay ledgers now read each other).
//   3. saveEvidence reads the packed on-disk card history too.
//   4. FIG-ALG has one name (module M6 = skill "Diagram Algebra").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fresh, pack, unpack } from '../site/js/store.js';
import { readiness, skillState, saveEvidence, weakSpots } from '../site/js/readiness.js';
import { applyOutcome, decayAll, S } from '../site/js/mastery.js';
import { housekeep } from '../site/js/schedule.js';
import { skills } from '../site/data/skills.js';
import { modules } from '../site/data/modules.js';
import { byId } from '../site/data/cards.js';

const NOW = Date.parse('2026-09-17T14:00:00');
const DAY = 86400000;
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pct = (x) => Math.round(x * 100);

function afterAce(at = NOW) {
  const s = fresh(at);
  s.settings.testDate = '2026-09-21';
  for (const id of ['NOTE', 'ASN-PLP', 'CS-LIN', 'FAC2', 'CS-RATIO', 'SYS', 'QUAD-SOLVE', 'BISECT-L']) {
    s.skills[id] = { m: 80, n: 5, lastAt: at, lastDueCorrectAt: null, placedAt: at, decayDays: 0 };
  }
  s.placement = { done: true, at, answered: 8, total: 8, skipped: 0, placed: ['M4', 'M10', 'M12', 'M11', 'M7'] };
  s.cards['not-01'] = { cleared: true, lastAt: at };
  return s;
}

/** card.js finishClear's skill write for a clean first-try clear (decay first, then the EMA step). */
function cleanClear(save, cardId, now = NOW) {
  decayAll(save.skills, now);
  applyOutcome(save.skills, byId[cardId].skills, S.clean, { at: now, dueReview: false });
  const rec = save.cards[cardId] ??= { history: [] };
  rec.cleared = true; rec.lastAt = now; rec.lastFirstTry = true;
  (rec.history ??= []).push({ at: now, ok: true, attempt: 1, hints: 0, ms: 30000 });
}

test('fix5 integrate: a wrong optional setup then a GOLD first-try clear never lowers R / M or adds a weak spot', () => {
  for (const cardId of ['ang-04', 'ang-05', 'ang-09', 'ang-10', 'doc-07']) {
    if (!byId[cardId]) continue;
    const s = afterAce();
    const before = readiness(s);
    s.errors.push({ item: cardId, seed: null, t: NOW, got: '"x=3"', tags: [], cleared: true, part: 'setup', template: null, forCard: null });
    cleanClear(s, cardId);
    const after = readiness(s);
    assert.ok(after.r >= before.r, `${cardId}: R ${before.r} → ${after.r}`);
    assert.ok(pct(after.M) >= pct(before.M), `${cardId}: mastery ${pct(before.M)} → ${pct(after.M)}`);
    const primary = byId[cardId].skills[0];
    const st = skillState(s, primary);
    if (st.n === 1) assert.equal(st.started, true, `${cardId}: ${primary} is "just started"`);
    assert.equal(st.weak, false, `${cardId}: ${primary} is not weak`);
    assert.ok(!weakSpots(s).some(w => (w.id ?? w) === primary), `${cardId}: not under Weak spots`);
  }
  // the exact critic save: ang-10 → FIG-ALG
  const s = afterAce();
  s.errors.push({ item: 'ang-10', part: 'setup', t: NOW, cleared: true });
  cleanClear(s, 'ang-10');
  assert.equal(readiness(s).r >= 57, true);
  assert.equal(skillState(s, 'FIG-ALG').started, true);
});

test('fix5 integrate: a wrong REQUIRED answer still counts — errors[] from a non-setup part are evidence', () => {
  const s = afterAce();
  s.skills['FIG-ALG'] = { m: 35, n: 1, lastAt: NOW, lastDueCorrectAt: null, placedAt: null, decayDays: 0 };   // legacy record
  s.errors.push({ item: 'ang-10', part: 'x', t: NOW, cleared: true });
  assert.ok(saveEvidence(s).miss.has('FIG-ALG'));
  assert.equal(skillState(s, 'FIG-ALG').weak, true);
});

test('fix5 integrate: saveEvidence reads the packed on-disk history ([at, ok, attempt, hints, ms])', () => {
  const s = afterAce();
  s.cards['ang-10'] = { cleared: true, lastAt: NOW, history: [{ at: NOW, ok: true, attempt: 2, hints: 0, ms: 1 }] };
  const unpacked = saveEvidence(s);
  const raw = pack(s);
  assert.ok(Array.isArray(raw.cards['ang-10'].history[0]), 'pack() writes the array form');
  const packed = saveEvidence(raw);
  assert.deepEqual([...packed.miss].sort(), [...unpacked.miss].sort());
  assert.deepEqual([...saveEvidence(unpack(raw)).miss].sort(), [...unpacked.miss].sort());
});

test('fix5 integrate: idle days are charged once — housekeeping then a clean answer never lowers the number', () => {
  for (const idle of [3, 5, 9]) {
    const then = NOW - idle * DAY;
    const s = afterAce(then);
    const today = new Date(NOW).toISOString().slice(0, 10);
    housekeep(s, { now: NOW, today });                                   // app.js boot / Home
    const m0 = s.skills.NOTE.m;
    assert.ok(m0 < 80, `${idle} idle days decayed on housekeeping (m ${m0})`);
    const before = readiness(s);
    decayAll(s.skills, NOW);                                             // the answer's own decay pass
    assert.equal(s.skills.NOTE.m, m0, `${idle} idle days: decayAll after housekeeping charges nothing more`);
    housekeep(s, { now: NOW, today });
    assert.equal(s.skills.NOTE.m, m0, 'and housekeeping again charges nothing more');
    cleanClear(s, 'voc-01');
    const after = readiness(s);
    assert.ok(after.r >= before.r, `${idle} idle days: R ${before.r} → ${after.r}`);
    assert.ok(pct(after.M) >= pct(before.M), `${idle} idle days: mastery ${pct(before.M)} → ${pct(after.M)}`);
  }
  // the other order: an answer's decayAll first, then Home's housekeeping — no second charge either
  const s = afterAce(NOW - 5 * DAY);
  decayAll(s.skills, NOW);
  const m1 = s.skills.NOTE.m;
  housekeep(s, { now: NOW, today: new Date(NOW).toISOString().slice(0, 10) });
  assert.ok(s.skills.NOTE.m >= m1 - 2, `housekeeping after decayAll: ${m1} → ${s.skills.NOTE.m} (at most the calendar-day rounding)`);
});

test('fix5 integrate: app.js charges owed decay at boot before the first route mounts', () => {
  const app = src('site/js/app.js');
  const boot = app.slice(app.indexOf('function boot()'));
  assert.ok(boot.indexOf('chargeOwedDecay()') > -1 && boot.indexOf('chargeOwedDecay()') < boot.indexOf('route();'), 'boot: decay before route()');
  assert.match(app, /function route\(\) \{\s*chargeOwedDecay\(\);/, 'route(): decay once per calendar day');
});

test('fix5 integrate: FIG-ALG has one name — module M6 matches the skill table', () => {
  const m6 = modules.find(m => m.id === 'M6');
  assert.equal(m6.name, skills.find(s => s.id === 'FIG-ALG').name);
});

test('fix5 integrate: on short portrait phones only notation-builder cards keep the 150 px figure cap', () => {
  const css = src('site/css/polish.css');
  const block = css.slice(css.indexOf('/* === fix5:integrate r1 ==='), css.indexOf('/* === /fix5:integrate r1 === */'));
  assert.match(block, /\(min-height: 481px\) and \(max-height: 760px\)/, 'landscape phones keep their own rule');
  assert.match(block, /:not\(:has\(\.card-part\[data-type="notation"\]\)\) \.card-figure \.fig \{ max-height: 190px; \}/);
  assert.ok(css.indexOf('/* === fix5:integrate r1 ===') > css.lastIndexOf('/* === /fix5:run r2 === */'), 'appended after the run lane blocks');
});

test('fix5 integrate: the phone answer lift measures under any sticky head above the card, not just the app bar', () => {
  const card = src('site/js/screens/card.js');
  const fn = card.slice(card.indexOf('function revealAnswer()'), card.indexOf('function activeEntry()'));
  assert.match(fn, /getComputedStyle\(sib\)\.position === 'sticky'/, 'the Placement run head counts as cover');
  assert.match(fn, /let hdrBottom = document\.querySelector\('\.hdr'\)/);
});
