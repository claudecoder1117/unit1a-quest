// tests/fix5-home.test.mjs — fix5 lane "home" (notes/FIX5-home.md, S9-SCORECARD "What a student will notice first").
//
// Bug 1 — "I got it right and my number went down": the provisional Readiness averaged every tested skill, so a
// clean first answer on a new skill (m = 35, n = 1 → m_shown 7) dragged M down, and Weak spots listed it.
//   (a) a clean first-try answer never lowers the displayed Readiness or the displayed mastery %, on any save;
//   (b) a skill with no miss recorded is never under Weak spots (it is "just started", grey) — r2: a correct answer
//       that needed a HINT is recorded (`helped`) and lets a skill be weak; a clean first-try answer never does;
//   (c) genuinely weak skills (a miss and m_shown < 70) are listed exactly as before;
//   (d) the formula printed in Settings is the one Home computes, to the number;
//   (e) the full (post-Mock) formula is unchanged.
// Bug 5 — the Mock appears once when the CTA is the Mock; module display names carry no lore.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fresh } from '../site/js/store.js';
import {
  readiness, masteryTerm, masteryTermTested, weakSpots, skillStates, startedSkills, coverageTerm,
  accuracyTerm, FORMULA_PROVISIONAL, WEAK_THRESHOLD, EVIDENCE_W0, saveEvidence,
} from '../site/js/readiness.js';
import { updateSkill, applyOutcome, placeSkill, freshSkill, hasMiss, hasHelp, legacyMisses, cleanM, mockMiss, S } from '../site/js/mastery.js';
import { mShown } from '../site/js/schedule.js';
import { skills as SKILLS, SKILL_IDS } from '../site/data/skills.js';
import { modules } from '../site/data/modules.js';
import { manifest, manifestIds } from '../site/data/source-manifest.js';

const NOW = Date.parse('2026-09-17T14:00:00');
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pct = (x) => Math.round(x * 100);
const BANK = manifestIds({ bonus: false });
/** r3: a card whose primary skill is `id` (null for the four generator-only skills). */
const cardOfSkill = (id) => manifest.find(r => r.skill === id)?.id ?? null;

/** mulberry32 — a seeded PRNG so a failure reproduces (tests only; site/js never uses randomness). */
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

/** The S9 walk's after-ace save: eight skills placed at m = 80, n = 5, written BEFORE `misses` existed (legacy). */
function afterAce() {
  const s = fresh(NOW);
  s.settings.testDate = '2026-09-21';
  for (const id of ['NOTE', 'ASN-PLP', 'CS-LIN', 'FAC2', 'CS-RATIO', 'SYS', 'QUAD-SOLVE', 'BISECT-L']) {
    s.skills[id] = { m: 80, n: 5, lastAt: NOW, lastDueCorrectAt: null, placedAt: NOW, decayDays: 0 };
  }
  s.placement = { done: true, at: NOW, answered: 8, total: 8, skipped: 0, placed: ['M4', 'M10', 'M12', 'M11', 'M7'] };
  s.cards['not-01'] = { cleared: true, lastAt: NOW };
  return s;
}

/**
 * A random but reachable save: histories through the real writers, some legacy records, some cleared cards, maybe a Mock.
 * r2: also returns `truth` — per skill, what HAPPENED ({ placed, wrong, hinted }) tracked from the generated events,
 * never read back off the record — so the (d) brute force implements the printed words, not the code.
 */
function randomSaveT(rnd, { mock = false, sparse = false } = {}) {
  const s = fresh(NOW);
  const truth = {};
  let at = NOW - 3600e3;
  for (const id of SKILL_IDS) {
    const r = rnd();
    if (r < (sparse ? 0.85 : 0.3)) continue;                           // untested (r3: sparse saves reach the 30-point floor)
    const t = truth[id] = { placed: false, wrong: false, hinted: false };
    let rec = null;
    if (sparse) { /* no placement: straight to answers */ }
    else if (r < 0.38) { rec = placeSkill(null, 80, at); t.placed = true; }                        // clean placement / JUMP
    else if (r < 0.45) {                                                                       // retry / wrong placement item (onboard.writeSkill)
      rec = { ...freshSkill(null), m: pick(rnd, [50, 0]), n: 5, lastAt: at, misses: 1 }; t.wrong = true;
    }
    const k = Math.floor(rnd() * 7);
    const step = (sc) => { rec = updateSkill(rec, sc, { at: at += 1000 }); if (sc < 70) t.wrong = true; else if (sc < 100) t.hinted = true; };
    for (let i = 0; i < k; i++) step(pick(rnd, [100, 100, 100, 70, 40, 0]));
    if (!rec) step(pick(rnd, [100, 70, 0]));
    if (rnd() < 0.25) {
      // a save written before `misses` / `helped`. r3: the record alone no longer implies a miss from an m deficit, so —
      // as in the real app, where every wrong card attempt lands in errors[] and every clear in the card's history —
      // the events leave their trace in the save. A generator-only skill (no card) keeps its fields.
      const card = cardOfSkill(id);
      if (card || !(t.wrong || t.hinted)) {
        const { misses, helped, ...legacy } = rec; rec = legacy;
        if (t.wrong) s.errors.push({ item: card, t: at, cleared: false });
        if (t.hinted) (s.cards[card] ??= { cleared: true, lastAt: at, history: [] }).history.push({ at, ok: true, attempt: 1, hints: 1 });
      }
    }
    s.skills[id] = rec;
  }
  for (const id of BANK) if (rnd() < 0.15 && !s.cards[id]) s.cards[id] = { cleared: true, lastAt: NOW };
  if (mock) s.runs.push({ kind: pick(rnd, ['mock', 'baseline']), status: 'done', accuracy: rnd() });
  return { save: s, truth };
}
const randomSave = (rnd, opts) => randomSaveT(rnd, opts).save;

/** What Home displays: the ring number and the "mastery X %" term. */
const shown = (save) => { const rd = readiness(save); return { r: rd.r, mastery: pct(rd.M), provisional: rd.provisional }; };

/** One clean first-try answer (s = 100) on a card touching `ids`, optionally clearing a new bank card — the card.js write. */
function cleanAnswer(save, ids, cardId = null) {
  applyOutcome(save.skills, ids, S.clean, { at: NOW, dueReview: false });
  if (cardId) save.cards[cardId] = { ...(save.cards[cardId] ?? {}), cleared: true, lastAt: NOW };
}

/* ================================================================ (a) */
test('fix5 home (a): a clean first-try answer never lowers the displayed Readiness or mastery %', async (t) => {
  await t.test('the S9 dip: after an aced placement, four clean page answers on new skills', () => {
    const s = afterAce();
    const before = shown(s);
    assert.equal(before.r, 57, 'the aced Home reads 57 (S9 #1)');
    assert.equal(before.mastery, 80);
    let prev = before;
    for (const [ids, card] of [[['VOC'], 'voc-01'], [['NOTE'], 'not-02'], [['CLASS'], 'cls-01'], [['PAIRS'], null]]) {
      cleanAnswer(s, ids, card);
      const now = shown(s);
      assert.ok(now.r >= prev.r, `Readiness ${prev.r} → ${now.r} after a clean ${ids}`);
      assert.ok(now.mastery >= prev.mastery, `mastery ${prev.mastery} → ${now.mastery} after a clean ${ids}`);
      prev = now;
    }
  });

  await t.test('property: 400 random saves (provisional and locked) × clean answers on 1–3 skills', () => {
    const rnd = prng(0xF15E);
    for (let i = 0; i < 400; i++) {
      const s = randomSave(rnd, { mock: rnd() < 0.3, sparse: i % 4 === 1 });   // r3: sparse saves sit under the 30-point floor
      for (let step = 0; step < 6; step++) {
        const before = shown(s);
        const ids = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(rnd, SKILL_IDS));
        const card = rnd() < 0.5 ? pick(rnd, BANK) : null;
        // fix5 integrate (critic home r3 blocker): a wrong OPTIONAL setup before the clean clear logs an errors[] row
        // (card.js afterSetup) without charging the card — that row must not turn the clean clear into a verdict.
        if (card && rnd() < 0.4) s.errors.push({ item: card, part: 'setup', t: NOW, cleared: true, tags: [] });
        cleanAnswer(s, [...new Set(ids)], card);
        const after = shown(s);
        assert.ok(after.r >= before.r, `save #${i} step ${step}: R ${before.r} → ${after.r} (${ids})`);
        assert.ok(after.mastery >= before.mastery, `save #${i} step ${step}: mastery ${before.mastery} → ${after.mastery} (${ids})`);
      }
    }
  });

  await t.test('a legacy record is stamped with the misses it was inferred to have — the first update changes nothing', () => {
    assert.equal(legacyMisses({ m: 35, n: 1 }), 0, 'one clean answer from 0');
    assert.equal(legacyMisses({ m: cleanM(4), n: 4 }), 0, 'four clean answers');
    assert.equal(legacyMisses({ m: 0, n: 1 }), 1, 'a wrong answer');
    assert.equal(legacyMisses({ m: 50, n: 5 }), 1, 'a retry placement (m 50, no placedAt)');
    assert.equal(legacyMisses({ m: 80, n: 5, placedAt: NOW }), 0, 'a clean placement');
    assert.equal(legacyMisses({ m: 74, n: 5, placedAt: NOW, decayDays: 3 }), 0, 'a clean placement that decayed');
    // r3 (critic r2): clean, clean, 5 idle days, clean — updateSkill reset decayDays, so the r1 deficit rule read a miss
    assert.equal(legacyMisses({ m: 66.04, n: 3, decayDays: 0 }), 0, 'a decayed-then-answered clean record is not a miss');
    assert.equal(legacyMisses({ m: 46, n: 5, decayDays: 2 }), 1, 'a retry placement item that decayed two days');
    assert.equal(updateSkill({ m: 35, n: 1 }, 100).misses, 0);
    assert.equal(updateSkill({ m: 0, n: 1 }, 100).misses, 1);
  });
});

/* ================================================================ (b) */
test('fix5 home (b): a skill with no miss is never a weak spot — it is "just started"', async (t) => {
  await t.test('one clean vocab answer after the ace: no weak spots, Vocabulary is just started', () => {
    const s = afterAce();
    cleanAnswer(s, ['VOC'], 'voc-01');
    assert.deepEqual(weakSpots(s), [], 'the S9 "Weak spots · Vocabulary 7" is gone');
    const voc = skillStates(s).find(x => x.id === 'VOC');
    assert.equal(voc.weak, false);
    assert.equal(voc.started, true);
    assert.ok(voc.mShown < WEAK_THRESHOLD, 'the bar still shows the honest 7');
    assert.deepEqual(startedSkills(s).map(x => x.id), ['VOC']);
  });

  await t.test('property: over random saves, weak ⇒ a wrong or a hinted answer really happened (tracked, not read off the record)', () => {
    const rnd = prng(0xB0B);
    for (let i = 0; i < 300; i++) {
      const { save: s, truth } = randomSaveT(rnd);
      for (const st of skillStates(s)) {
        if (st.weak) assert.ok(truth[st.id].wrong || truth[st.id].hinted, `${st.id} is weak with only clean answers`);
        if (st.started) assert.equal(st.weak, false);
      }
      // and one more CLEAN answer never makes anything weak
      const before = new Set(weakSpots(s, { max: 99 }).map(w => w.id));
      cleanAnswer(s, [pick(rnd, SKILL_IDS)]);
      for (const w of weakSpots(s, { max: 99 })) assert.ok(before.has(w.id), `save #${i}: a clean answer made ${w.id} weak`);
    }
  });

  await t.test('r2 wording: "Just started" only below 3 answers; past that the grey line says "no misses yet"', async () => {
    const { startedPhrases } = await import('../site/js/screens/home.js');
    assert.deepEqual(startedPhrases([{ name: 'Vocabulary', n: 1 }]), ['Just started, no misses yet: Vocabulary']);
    assert.deepEqual(startedPhrases([{ name: 'Vocabulary', n: 6 }]), ['No misses yet, still under 70: Vocabulary']);
    assert.deepEqual(startedPhrases([]), []);
  });
});

/* ================================================================ (c) */
test('fix5 home (c): genuinely weak skills (a miss or a hinted clear, m_shown < 70) are still listed exactly as before', async (t) => {
  await t.test('one WRONG answer on a new skill lists it', () => {
    const s = afterAce();
    applyOutcome(s.skills, ['VOC'], S.wrong, { at: NOW });
    assert.deepEqual(weakSpots(s).map(w => w.id), ['VOC']);
    assert.equal(weakSpots(s)[0].drill, '#/run/drill/VOC');
  });

  await t.test('a retry (attempt 2) is a miss; a hinted clear is `helped`, not a miss; a clean answer is neither', () => {
    assert.equal(updateSkill(null, S.retry).misses, 1);
    assert.equal(updateSkill(null, S.hints).misses, 0);
    assert.equal(updateSkill(null, S.hints).helped, 1);
    assert.equal(updateSkill(null, S.clean).misses, 0);
    assert.equal(updateSkill(null, S.clean).helped, 0);
    assert.equal(updateSkill(updateSkill(null, S.hints), S.clean).helped, 1, 'a clean answer never clears the record');
  });

  await t.test('r2 (critic r1): six answers that each needed a hint make the skill a weak spot, and it counts in M', () => {
    const s = afterAce();
    for (let i = 0; i < 6; i++) applyOutcome(s.skills, ['ASN-ANG'], S.hints, { at: NOW + i });
    const st = skillStates(s).find(x => x.id === 'ASN-ANG');
    assert.equal(st.n, 6);
    assert.ok(st.mShown < WEAK_THRESHOLD);
    assert.equal(st.started, false, 'not "just started" after six hinted answers');
    assert.deepEqual(weakSpots(s).map(w => w.id), ['ASN-ANG']);
    assert.equal(masteryTermTested(s).scored, 9, 'the hinted skill is inside M, not left out of it');
    // ten hinted answers (m_shown 69.1) — still weak
    for (let i = 6; i < 10; i++) applyOutcome(s.skills, ['ASN-ANG'], S.hints, { at: NOW + i });
    assert.deepEqual(weakSpots(s).map(w => w.id), ['ASN-ANG']);
  });

  await t.test('a Mock miss on a Mastered skill (m → 69) is a miss', () => {
    const rec = { m: 90, n: 6, lastAt: NOW, lastDueCorrectAt: NOW, placedAt: null, misses: 0 };
    const hit = mockMiss(rec);
    assert.equal(hit.m, 69);
    assert.equal(hit.misses, 1);
  });

  await t.test('a non-clean placement item writes a miss (onboard.applyPlacement)', async () => {
    const ob = await import('../site/js/screens/onboard.js');
    const s = fresh(NOW);
    ob.applyPlacement(s, { fac2: { outcome: 'wrong', skills: ['FAC2'], module: 'M10' }, sys: { outcome: 'retry', skills: ['SYS'], module: 'M12' }, quad: { outcome: 'clean', skills: ['QUAD-SOLVE'], module: 'M11' } }, { now: NOW, total: 8, skipped: 5 });
    assert.equal(s.skills.FAC2.misses, 1);
    assert.equal(s.skills.SYS.misses, 1);
    assert.equal(s.skills['QUAD-SOLVE'].misses, 0);
    assert.deepEqual(weakSpots(s).map(w => w.id).sort(), ['FAC2', 'SYS']);
  });

  await t.test('r2 (critic r1): a wrong-then-right placement item is not triple-counted, and re-applying is idempotent', async () => {
    const ob = await import('../site/js/screens/onboard.js');
    const s = fresh(NOW);
    // the card view already ran the item through updateSkill: a wrong attempt (s = 0), then the retry clear (s = 40)
    applyOutcome(s.skills, ['ASN-PLP'], S.wrong, { at: NOW });
    applyOutcome(s.skills, ['ASN-PLP'], S.retry, { at: NOW + 1 });
    assert.equal(s.skills['ASN-PLP'].misses, 2);
    const res = { asn: { outcome: 'retry', skills: ['ASN-PLP'], module: 'M9' } };
    ob.applyPlacement(s, res, { now: NOW + 2, total: 8 });
    assert.equal(s.skills['ASN-PLP'].misses, 2, 'the placement write adds no third miss on top of the card path');
    ob.applyPlacement(s, res, { now: NOW + 3, total: 8 });
    assert.equal(s.skills['ASN-PLP'].misses, 2, 'idempotent');
    assert.equal(s.skills['ASN-PLP'].m, 50);
  });

  await t.test('property: among skills WITH a miss or a hint, the list is the pre-fix rule (n ≥ 1 ∧ m_shown < 70, w·(1−m/100) desc, ≤ 5)', () => {
    const rnd = prng(0xC0FFEE);
    for (let i = 0; i < 300; i++) {
      const s = randomSave(rnd);
      const ev = saveEvidence(s);   // r3: a legacy record's miss / hint can live in the card history or errors[]
      const expected = SKILLS
        .map((def, idx) => ({ id: def.id, idx, rec: s.skills[def.id], score: def.w * (1 - (s.skills[def.id]?.m ?? 0) / 100) }))
        .filter(x => (x.rec?.n ?? 0) >= 1 && (hasMiss(x.rec) || hasHelp(x.rec) || ev.miss.has(x.id) || ev.help.has(x.id)) && mShown(x.rec) < 70)
        .sort((a, b) => b.score - a.score || a.idx - b.idx)
        .slice(0, 5)
        .map(x => x.id);
      assert.deepEqual(weakSpots(s).map(w => w.id), expected, `save #${i}`);
    }
  });
});

/* ================================================================ (d) */
test('fix5 home (d): Settings prints the formula Home computes, to the number', async (t) => {
  /**
   * The PRINTED provisional rule, brute-forced from its words (critic r1: the r1 version copied the code's own
   * classification). r3: "M runs over the skills tested so far (n ≥ 1); skills with a wrong or hinted answer always
   * count, any other skill counts only where it raises M, and M divides by at least 30 of the 100 weight points:
   * M = Σ w·m_shown/100 ÷ max(Σ w, 30)" — i.e. the best such ratio over the always-count skills plus ANY subset of the
   * others. Which skills got a wrong or a hinted answer comes from `truth` (the events the generator played), never
   * from the record's own fields. Returns { M, floored } (floored: the best set covers fewer than 30 points).
   */
  function printedM(save, truth) {
    const always = [], others = [];
    for (const def of SKILLS) {
      const rec = save.skills[def.id];
      if (!((rec?.n ?? 0) >= 1)) continue;
      const tr = truth[def.id];
      (tr.wrong || tr.hinted ? always : others).push({ w: def.w, v: mShown(rec) / 100 });
    }
    let best = 0, floored = false;
    for (let mask = 0; mask < (1 << others.length); mask++) {
      const set = always.concat(others.filter((_, i) => mask & (1 << i)));
      const W = set.reduce((a, x) => a + x.w, 0);
      if (W === 0) continue;
      const val = set.reduce((a, x) => a + x.w * x.v, 0) / Math.max(W, 30);
      if (val > best + 1e-12) { best = val; floored = W < 30; }
    }
    return { M: best, floored };
  }

  await t.test('the printed provisional text names the rule — the hint exception and the 30-point evidence floor', () => {
    assert.match(FORMULA_PROVISIONAL, /R = round\(100 × \(0\.5·M \+ 0\.2·C\) \/ 0\.7\)/);
    assert.match(FORMULA_PROVISIONAL, /tested so far \(n ≥ 1\)/);
    assert.match(FORMULA_PROVISIONAL, /skills with a wrong or hinted answer always count, any other skill counts only where it raises M, and M divides by at least 30 of the 100 weight points: M = Σ w·m_shown\/100 ÷ max\(Σ w, 30\)/);
    assert.equal(EVIDENCE_W0, 30, 'the printed 30 is the constant the code divides by');
    assert.equal(FORMULA_PROVISIONAL.split('—').length, 2, 'Settings splits the text on its one dash');
    const settings = src('site/js/screens/settings.js');
    assert.match(settings, /FORMULA_PROVISIONAL/);
    assert.match(settings, /live = readiness\(getState\(\)\)/, 'Settings computes its number with the same function Home uses');
    assert.match(settings, /skills you have got wrong or needed a hint on always count, and any other skill you have answered counts only where it raises M/);
    assert.match(settings, /M also divides by at least 30 of the 100 weight points[^']*M = Σ w · m_shown \/ 100 ÷ max\(Σ w, 30\)/);
    assert.match(settings, /answering right first try without a hint never lowers the number \(a hint, a wrong answer, idle-day decay and the first Mock’s switch to the full formula can\)/);
  });

  await t.test('property: readiness() equals the printed formulas evaluated independently', () => {
    const rnd = prng(0xD00D);
    let verdictPulledDown = 0, floored = 0;
    for (let i = 0; i < 400; i++) {
      const { save: s, truth } = randomSaveT(rnd, { mock: rnd() < 0.3, sparse: i % 4 === 1 });
      if (i % 3 === 0) { const id = pick(rnd, SKILL_IDS); cleanAnswer(s, [id]); truth[id] ??= { placed: false, wrong: false, hinted: false }; }   // a clean answer adds no event to `truth`
      const rd = readiness(s);
      const C = coverageTerm(s);
      if (rd.provisional) {
        const P = printedM(s, truth), M = P.M;
        assert.ok(Math.abs(rd.M - M) < 1e-9, `save #${i}: M ${rd.M} vs printed ${M}`);
        assert.equal(rd.r, Math.max(0, Math.min(100, Math.round(100 * (0.5 * M + 0.2 * C) / 0.7))), `save #${i}`);
        // both halves of the printed rule are exercised: a wrong/hinted skill below M still counts; the floor binds
        if (SKILL_IDS.some(id => (truth[id]?.wrong || truth[id]?.hinted) && mShown(s.skills[id]) / 100 < rd.M - 1e-9)) verdictPulledDown++;
        if (P.floored) floored++;
      } else {
        assert.equal(rd.r, Math.max(0, Math.min(100, Math.round(100 * (0.5 * masteryTerm(s) + 0.3 * accuracyTerm(s) + 0.2 * C)))));
      }
    }
    assert.ok(verdictPulledDown > 0, 'the generator produced saves where the always-count exception matters');
    assert.ok(floored > 0, 'the generator produced saves where the 30-point floor binds');
  });

  await t.test('the critic r1 counter-example: after-ace + one clean CS-LIN answer reads the same by the printed rule', () => {
    const s = afterAce();
    cleanAnswer(s, ['CS-LIN']);
    const truth = Object.fromEntries(Object.keys(s.skills).map(id => [id, { placed: Number.isFinite(afterAce().skills[id]?.placedAt), wrong: false, hinted: false }]));
    const { M } = printedM(s, truth);
    assert.ok(Math.abs(readiness(s).M - M) < 1e-9);
  });
});

/* ================================================================ (e) */
test('fix5 home (e): the full (post-Mock) formula is untouched — M over all 19 m_shown, misses play no part', () => {
  const s = afterAce();
  applyOutcome(s.skills, ['VOC'], S.clean, { at: NOW });
  s.runs.push({ kind: 'mock', status: 'done', accuracy: 0.75 });
  const rd = readiness(s);
  assert.equal(rd.provisional, false);
  let M = 0; for (const def of SKILLS) M += def.w * mShown(s.skills[def.id]) / 100;
  M /= 100;
  assert.ok(Math.abs(rd.M - M) < 1e-12);
  assert.equal(rd.r, Math.round(100 * (0.5 * M + 0.3 * 0.75 + 0.2 * coverageTerm(s))));
  // the tested-only M is still what an aced placement reads (home r1 / S9 #1 unchanged)
  assert.ok(Math.abs(masteryTermTested(afterAce()).M - 0.8) < 1e-12);
  assert.equal(freshSkill({ m: 80, n: 5 }).misses, legacyMisses({ m: 80, n: 5 }));
});

/* ================================================================ Bug 5 */
test('fix5 home / bug 5: one Mock entry point when the CTA is the Mock; ≥ 44 px link otherwise', () => {
  const home = src('site/js/screens/home.js');
  const plan = src('site/js/plan.js');
  assert.match(home, /fillPlanStrip\(planStrip\(state, today, D\), state, \{ today, hideMock: act\.kind === 'mock' \}\)/);
  assert.match(home, /act\.kind !== 'mock' \? h\('a\.btn', \{ href: '#\/mock' \}, 'Mock'\) : null/);
  assert.match(plan, /if \(plan\.mock\.offered && !opts\.hideMock\)/);
  // the grey "just started" line is appended only when it exists (DOM append(null) prints the text "null")
  assert.ok(!/sec\.append\([^;]*startedLine\)/.test(home.replace(/if \(startedLine\) sec\.append\(startedLine\)/g, '')));
  const polish = src('site/css/polish.css');
  const block = polish.slice(polish.indexOf('/* === fix5:home r1 === */'), polish.indexOf('/* === /fix5:home r1 === */'));
  assert.match(block, /\.plan-mock[^{]*\{[^}]*min-height: var\(--tap, 44px\)/);
});

test('fix5 home / bug 5: module display names are dry and descriptive — no lore', () => {
  const LORE = /Lexicon|Figure Recon|Comp\/Supp Sprint|Bisector Verdicts|ASN Arena|Factor Forge|Forge/;
  for (const m of modules) assert.ok(!LORE.test(m.name), `${m.id} "${m.name}"`);
  const byId = Object.fromEntries(modules.map(m => [m.id, m.name]));
  assert.equal(byId.M1, 'Vocabulary & Notation');
  assert.equal(byId.M2, 'Pairs in a Figure');
  assert.equal(byId.M3, 'Complement & Supplement');
  assert.equal(byId.M7, 'Does It Bisect?');
  assert.equal(byId.M9, 'Always / Sometimes / Never');
  assert.equal(byId.M10, 'Factoring');
  assert.ok(!/'Comp\/Supp Sprint'/.test(src('site/data/templates.js')), 'the M3 template label is student-visible (Binder, JUMP)');
});

/* ================================================================ r2 (critic r1) — screens */
test('fix5 home r2: a resumed Page shows the LIVE Readiness in the header, not the page-start snapshot', () => {
  const run = src('site/js/screens/run.js');
  const mount = run.slice(run.indexOf('function mountCardRun('), run.indexOf('renderHead();\n  renderItem();'));
  assert.ok(!/setHeader\(\{ readiness: before\.readiness\.r/.test(mount), 'the header is not set from `before` on mount');
  assert.match(mount, /const live = readiness\(getState\(\)\); setHeader\(\{ readiness: live\.r, provisional: !!live\.provisional \}\)/);
  // per-answer climbs come from the shell: app.js derives the header ring from every saved state
  assert.match(src('site/js/app.js'), /const r = readinessOf\(s\); hdr\.readiness = r\.r;/);
});

test('fix5 home r2: the Weak spots empty state follows the CTA', async () => {
  const { weakEmptyLine } = await import('../site/js/screens/home.js');
  assert.match(weakEmptyLine('resume'), /finish the page/);
  assert.match(weakEmptyLine('mock'), /the Mock will find them/);
  assert.match(weakEmptyLine('page'), /take the Baseline or run a Page/);
  assert.ok(!/Baseline/.test(weakEmptyLine('page', { locked: true })), 'no "take the Baseline" once one is on the save');
});

test('fix5 home r2: placement summary — no "first try · the ratio item too" beside a non-clean ratio row; no Comp/supp label', async () => {
  const onboard = src('site/js/screens/onboard.js');
  assert.ok(!/`first try · the \$\{what\} item too`/.test(onboard));
  assert.match(onboard, /sib === 'clean' \? 'first try' : sib \? `first try · needs the \$\{what\} item clean too`/);
  // r3 (critic r2): the note after " · " is rendered on its own line inside the label cell, not in the auto column
  assert.match(onboard, /h\('span\.ob-result-name', c\.label, note \? h\('span\.ob-result-note\.muted\.fs-1', note\) : null\)/);
  const { PLACEMENT_CLUSTERS } = await import('../site/js/screens/onboard.js');
  for (const c of PLACEMENT_CLUSTERS) assert.ok(!/Comp\/supp|Lexicon|Recon|Sprint|Verdicts|Arena|Forge/i.test(c.label), c.label);
});

/* ================================================================ r3 (critic r2) */
/** Σ w · m_shown / 100 over the tested skills, and their weight. */
function testedSums(save) {
  let acc = 0, w = 0;
  for (const def of SKILLS) { const rec = save.skills[def.id]; if ((rec?.n ?? 0) >= 1) { acc += def.w * mShown(rec) / 100; w += def.w; } }
  return { acc, w, mean: w ? acc / w : 0 };
}

test('fix5 home r3: the 30-point evidence floor — a lopsided all-clean save cannot read as the whole unit', async (t) => {
  await t.test("critic r2 inflate: 12 clean VOC + 1 clean on 3 / 9 more skills no longer reads 'Ready 71, mastery 99 %'", () => {
    const s = fresh(NOW);
    for (let i = 0; i < 12; i++) applyOutcome(s.skills, ['VOC'], S.clean, { at: NOW + i });
    for (const id of ['CLASS', 'NOTE', 'ASN-PLP']) applyOutcome(s.skills, [id], S.clean, { at: NOW });
    let rd = readiness(s);
    assert.ok(rd.r <= 25 && pct(rd.M) <= 30, `4 skills tested: R ${rd.r}, mastery ${pct(rd.M)} %`);
    const ts = testedSums(s);
    assert.ok(ts.w < EVIDENCE_W0 && rd.M <= ts.mean + 1e-12, 'under 30 points covered, mastery % never exceeds the tested-weight mean');
    for (const id of ['FAC1', 'FAC2', 'SYS', 'QUAD-SOLVE', 'CS-LIN', 'PAIRS']) applyOutcome(s.skills, [id], S.clean, { at: NOW });
    for (let i = 0; i < 8; i++) applyOutcome(s.skills, ['VOC'], S.clean, { at: NOW + 20 + i });
    rd = readiness(s);
    assert.ok(rd.r <= 25, `10 skills tested: R ${rd.r}`);
    assert.notEqual(rd.band.key, 'ready');
    // and the r2 one-wrong cliff (71 → 48) is gone: one wrong SYS answer moves the number by at most a couple of points
    const d = structuredClone(s);
    d.skills.SYS = updateSkill(freshSkill(null), S.wrong, { at: NOW });
    assert.ok(rd.r - readiness(d).r <= 2, `one wrong SYS answer: R ${rd.r} → ${readiness(d).r}`);
  });

  await t.test('property: M ≤ Σ_tested w·m_shown / 30, and ≤ the tested-weight mean whenever fewer than 30 points are tested', () => {
    const rnd = prng(0xF1002);
    for (let i = 0; i < 400; i++) {
      const s = randomSave(rnd, { sparse: i % 2 === 0 });
      const rd = readiness(s), ts = testedSums(s);
      assert.ok(rd.M <= ts.acc / EVIDENCE_W0 + 1e-12, `save #${i}: M ${rd.M} vs Σ/30 ${ts.acc / EVIDENCE_W0}`);
      if (ts.w < EVIDENCE_W0) assert.ok(rd.M <= ts.mean + 1e-12, `save #${i}: M ${rd.M} above the tested mean ${ts.mean} with ${ts.w} points tested`);
    }
  });

  await t.test('the after-ace number the scorecard pinned is unchanged by the floor (47 points tested)', () => {
    const s = afterAce();
    assert.equal(readiness(s).r, 57);
    assert.equal(masteryTermTested(s).weight, 47);
  });

  await t.test('exact optimum: the floor makes "best prefix by m_shown" wrong in general — the knapsack matches every subset', () => {
    // hand case: always-count ASN-ANG (w 7, hinted) at 100; just-started CLASS (w 3) at 60 and CS-LIN (w 9) at 50.
    // Prefixes: {} 7/30 = .233, {CLASS} 8.8/30 = .293, {CLASS, CS-LIN} 13.3/30 = .443 — here the full prefix wins; the
    // property below checks random sparse saves against every subset.
    const rnd = prng(0x5EB);
    for (let i = 0; i < 300; i++) {
      const s = randomSave(rnd, { sparse: true });
      const ev = saveEvidence(s);
      const always = [], others = [];
      for (const def of SKILLS) {
        const rec = s.skills[def.id]; if (!((rec?.n ?? 0) >= 1)) continue;
        const item = { w: def.w, v: mShown(rec) / 100 };
        (hasMiss(rec) || hasHelp(rec) || ev.miss.has(def.id) || ev.help.has(def.id) ? always : others).push(item);
      }
      let best = 0;
      for (let mask = 0; mask < (1 << others.length); mask++) {
        const set = always.concat(others.filter((_, j) => mask & (1 << j)));
        const W = set.reduce((a, x) => a + x.w, 0);
        if (W) best = Math.max(best, set.reduce((a, x) => a + x.w * x.v, 0) / Math.max(W, 30));
      }
      assert.ok(Math.abs(masteryTermTested(s).M - best) < 1e-9, `save #${i}`);
    }
    // a non-prefix optimum really occurs: always-count NOTE (8) + PAIRS (8) + CSARITH (5), hinted, at m_shown 100;
    // just-started QUAD-CTX (w 2) at 50 and CS-LIN (w 9) at 40. Prefix sets: {} 21/30 = .70, {QUAD-CTX} 22/30 = .733,
    // {QUAD-CTX, CS-LIN} 25.6/32 = .80 — but {CS-LIN} alone gives 24.6/30 = .82.
    const s = fresh(NOW);
    for (const id of ['NOTE', 'PAIRS', 'CSARITH']) s.skills[id] = { ...freshSkill(null), m: 100, n: 5, lastAt: NOW, helped: 1 };
    s.skills['QUAD-CTX'] = { ...freshSkill(null), m: 50, n: 5, lastAt: NOW };
    s.skills['CS-LIN'] = { ...freshSkill(null), m: 40, n: 5, lastAt: NOW };
    const mt = masteryTermTested(s);
    assert.ok(Math.abs(mt.M - 0.82) < 1e-12, `M ${mt.M}`);
    assert.equal(mt.weight, 30);
    assert.equal(mt.started, 1, 'QUAD-CTX is the one left out');
  });
});

test('fix5 home r3: a JUMP HERE pass (and a clean placement) never lowers an earned m, Readiness or mastery %', async (t) => {
  const ids = ['VOC', 'NOTE', 'CLASS'];
  const tenClean = () => { const s = afterAce(); for (let i = 0; i < 10; i++) applyOutcome(s.skills, [ids[i % 3]], S.clean, { at: NOW + i }); return s; };

  await t.test('onboard.applyJump after 10 clean M1 answers', async () => {
    const ob = await import('../site/js/screens/onboard.js');
    const s = tenClean();
    const before = shown(s), noteM = s.skills.NOTE.m;
    assert.ok(noteM > 90, 'NOTE earned > 90 on top of its placement');
    const res = ob.applyJump(s, 'M1', { correct: 10, total: 10, skills: ids, now: NOW + 20 });
    assert.equal(res.passed, true);
    const after = shown(s);
    assert.ok(after.r >= before.r, `R ${before.r} → ${after.r}`);
    assert.ok(after.mastery >= before.mastery, `mastery ${before.mastery} → ${after.mastery}`);
    assert.equal(s.skills.NOTE.m, noteM, 'the earned m is kept, not flattened to 80');
    assert.ok(Number.isFinite(s.skills.VOC.placedAt));
  });

  await t.test('run.applyJump (Binder JUMP HERE run) after 10 clean M1 answers', async () => {
    const run = await import('../site/js/screens/run.js');
    const s = tenClean();
    const before = shown(s);
    run.applyJump(s, 'M1', { correct: 10, total: 10, at: NOW + 20 });
    const after = shown(s);
    assert.ok(after.r >= before.r, `R ${before.r} → ${after.r}`);
    assert.ok(after.mastery >= before.mastery, `mastery ${before.mastery} → ${after.mastery}`);
    assert.equal(placeSkill({ m: 93, n: 8 }, 80, NOW).m, 93, 'placeSkill never lowers an earned m');
    assert.equal(placeSkill({ m: 40, n: 2 }, 80, NOW).m, 80);
  });

  await t.test('a clean placement is not a verdict on its own: adding one at 80 never lowers M', () => {
    assert.ok(!/placed skills/.test(FORMULA_PROVISIONAL));
    const s = afterAce();
    for (const id of ['NOTE', 'CS-LIN']) for (let i = 0; i < 6; i++) applyOutcome(s.skills, [id], S.clean, { at: NOW + i });
    const without = readiness(s).M;
    s.skills.VOC = placeSkill(null, 80, NOW);
    assert.ok(readiness(s).M >= without - 1e-12, `M ${without} → ${readiness(s).M}`);
  });
});

test('fix5 home r3: a legacy clean-only record is not inferred as a miss; positive evidence in the save still is', async (t) => {
  await t.test('critic r2: clean, clean, 5 idle days, clean → { m 66.04, n 3, decayDays 0 } is "just started", R unchanged', () => {
    const s = afterAce();
    const r0 = readiness(s).r;
    s.skills.VOC = { m: 66.04, n: 3, lastAt: NOW - 1000, decayDays: 0 };
    assert.deepEqual(weakSpots(s), []);
    assert.equal(skillStates(s).find(x => x.id === 'VOC').started, true);
    assert.ok(readiness(s).r >= r0, `R ${r0} → ${readiness(s).r}`);
  });

  await t.test('the same kind of record with a wrong attempt in errors[], or a retry / hint in the card history, is weak', () => {
    const base = () => { const s = afterAce(); s.skills.VOC = { m: 50, n: 3, lastAt: NOW, decayDays: 0 }; return s; };
    let s = base(); s.errors.push({ item: 'voc-04', t: NOW, cleared: true });
    assert.deepEqual(weakSpots(s).map(w => w.id), ['VOC'], 'errors[] naming a VOC card');
    s = base(); s.cards['voc-02'] = { cleared: true, history: [{ at: NOW, ok: true, attempt: 2, hints: 0 }] };
    assert.deepEqual(weakSpots(s).map(w => w.id), ['VOC'], 'a second-try clear in the history');
    s = base(); s.cards['voc-02'] = { cleared: true, history: [{ at: NOW, ok: true, attempt: 1, hints: 1 }] };
    assert.deepEqual(weakSpots(s).map(w => w.id), ['VOC'], 'a hinted clear in the history');
    s = base(); s.cards['voc-02'] = { cleared: true, history: [{ at: NOW, ok: true, attempt: 1, hints: 0 }] };
    assert.deepEqual(weakSpots(s), [], 'a clean clear in the history is no evidence');
  });
});

test('fix5 home r3: the placement summary note has its own line (polish.css block)', () => {
  const polish = src('site/css/polish.css');
  const block = polish.slice(polish.indexOf('/* === fix5:home r3 ==='), polish.indexOf('/* === /fix5:home r3 === */'));
  assert.match(block, /\.ob-result-note \{ display: block;/);
  assert.match(block, /\.ob-result-row > \.ob-result-tag \{ max-width: 48vw;/);
});
