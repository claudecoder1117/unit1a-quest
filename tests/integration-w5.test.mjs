// integration-w5.test.mjs — Wave 5 (T17 test consolidation · CI gate · unit hand-off) plus the four
// decisions the integrator was asked to make in `notes/OPEN-ISSUES.md`. Written by the integrator; each
// case names the issue it closes (see notes/INTEGRATION-W5.md).
import test from 'node:test';
import assert from 'node:assert/strict';

import { fresh, pack, unpack, archiveUnit, archivedUnits, UNIT_ID, LEGACY_UNIT_ID } from '../site/js/store.js';
import { cards as ALL_CARDS, byId } from '../site/data/cards.js';
import { moduleById } from '../site/data/modules.js';
import * as page from '../site/js/page.js';
import * as plan from '../site/js/plan.js';
import * as onboard from '../site/js/screens/onboard.js';
import { read as src } from './_helpers.mjs';

const tierOf = (c) => (Number.isInteger(c?.tier) ? c.tier : 2);

/** A fresh save with the test D days out — D = 3 is deep in the lowering (q = 32 against a target of 12). */
function saveAt(D) {
  const s = fresh(Date.parse('2026-09-17T09:00:00'));
  s.profileId = 'w5';
  s.settings.testDate = plan.addDays('2026-09-17', D);
  s.settings.testTime = '08:00';
  return s;
}

/* ------------------------------------------------------------------ §A2 — the M1 placement wipe */

test('W5 §A2: one clean placement item can no longer erase a 55-card module', async (t) => {
  await t.test('the rule is a size rule, and it catches exactly the two modules that need it', () => {
    const offenders = Object.keys(moduleById).filter(m => onboard.placeWithheld(m)
      && onboard.PLACEMENT_CLUSTERS.some(c => c.module === m));
    assert.deepEqual(offenders.sort(), ['M1', 'M9'], 'Lexicon (55) and ASN Arena (54) — one cluster each');
    for (const m of offenders) assert.ok(onboard.originalsCount(m) > onboard.PLACE_MAX_ORIGINALS, m);
    // Everything else the placement asks about is small enough that S7's sentence stands unchanged.
    for (const c of onboard.PLACEMENT_CLUSTERS) {
      if (c.module === 'M1' || c.module === 'M9') continue;
      assert.equal(onboard.placeNeedsClean(c.module), 1, `${c.module} still places off one clean item`);
    }
  });

  await t.test('the 55 M1 originals stay in the new-card pool after a clean notation item', () => {
    const s = saveAt(7);
    const before = page.newCardPool(s).filter(c => c.module === 'M1').length;
    onboard.applyPlacement(s, { notation: { outcome: 'clean', skills: ['NOTE'], module: 'M1' } }, { now: 1, total: 8 });
    const after = page.newCardPool(s).filter(c => c.module === 'M1').length;
    assert.ok(before > 0);
    assert.equal(after, before, 'the whole Lexicon would otherwise have gone, and never come back as reviews either');
    assert.equal(moduleById.M1.originals.length, 55);
  });

  await t.test('a small module still places off one clean item (S7 unchanged)', () => {
    const s = saveAt(7);
    const out = onboard.applyPlacement(s, { fac2: { outcome: 'clean', skills: ['FAC2'], module: 'M10' } }, { now: 1, total: 8 });
    assert.deepEqual(out.placedModules, ['M10']);
    assert.deepEqual(out.withheld, []);
    assert.equal(s.jumps.M10, true);
    assert.equal(page.newCardPool(s).filter(c => c.module === 'M10').length, 0);
  });

  await t.test('JUMP HERE is still the gate that CAN place a big module', () => {
    const s = saveAt(7);
    onboard.applyJump(s, 'M1', { correct: 8, total: 10, skills: ['VOC', 'NOTE', 'CLASS'], now: 5 });
    assert.equal(s.jumps.M1, true, '8 of 10 is a real sample of 55 cards; one item is not');
    assert.equal(page.newCardPool(s).filter(c => c.module === 'M1').length, 0);
    const fail = saveAt(7);
    onboard.applyJump(fail, 'M1', { correct: 7, total: 10, skills: ['VOC'], now: 5 });
    assert.ok(!fail.jumps.M1, '7 of 10 writes nothing');
  });

  await t.test('the summary does not call a withheld module "placed"', () => {
    const s = src('site/js/screens/onboard.js');
    assert.match(s, /placedSet\.has\(c\.module\) \? 'placed' : 'first try'/, 'the row label follows the save, not the outcome');
    assert.match(s, /stayed in the plan on purpose/, 'and the screen says why');
  });
});

/* ------------------------------------------------------------------ §A3 — "flash only" */

test('W5 §A3: every line the lowered plan strip prints is true of the page it builds', async (t) => {
  const s = saveAt(3);
  const opts = plan.composeOpts(s, { D: 3 });

  await t.test('the lowering is active and hands the composer all three levers', () => {
    assert.equal(plan.qFor(s, { D: 3 }).warn, true);
    assert.equal(opts.q, 12);
    assert.equal(opts.tier4, 1);
    assert.equal(opts.microFlashOnly, true);
  });

  await t.test('microFlashOnly really doubles the share of ten-second cards', () => {
    const { q, ...planOpts } = opts;                       // the call sites drop q (W4 §1.2)
    const share = (o) => {
      const queue = page.composePage(s, { ...o, D: 3 }).queue.filter(i => i.role === 'new');
      const micro = queue.filter(i => tierOf(byId[i.id]) <= page.MICRO_TIER);
      return { n: queue.length, micro: micro.length };
    };
    const plainOpts = { ...planOpts }; delete plainOpts.microFlashOnly;
    const plain = share(plainOpts);
    const low = share(planOpts);
    assert.equal(low.n, plain.n, 'the same number of new cards …');
    assert.ok(low.micro > plain.micro, `… but more of them are micro (${low.micro} vs ${plain.micro})`);
    assert.equal(low.micro, Math.floor(low.n / page.LIMITS.microEveryLowered), 'every other new slot');
    assert.equal(page.LIMITS.microEveryLowered, 2);
  });

  await t.test('the tier-4 promise and the "nothing is dropped" promise still hold', () => {
    const { q, ...planOpts } = opts;
    const queue = page.composePage(s, { ...planOpts, D: 3 }).queue;
    assert.ok(queue.filter(i => i.tier >= 4).length <= 1, 'one hard diagram problem a day');
    assert.ok(!('drop' in s), 'the Binder keeps everything; the lowering only reorders the day');
  });

  await t.test('no promise is left in the copy that the composer does not keep', () => {
    const low = plan.lowering(s, { D: 3 });
    assert.equal(low.lines.length, 3);
    assert.ok(!/flash only/i.test(low.lines.join(' ')), 'the app has no read-only flash mode and no longer claims one');
    assert.match(low.lines[0], /every other new card/);
    assert.match(low.lines[1], new RegExp(`${plan.TIER4_PER_DAY_LOWERED} a day`));
    // …and the flag is read by the composer, not just produced by the plan.
    assert.match(src('site/js/page.js'), /opts\.microFlashOnly === true \? LIMITS\.microEveryLowered/);
  });
});

/* ------------------------------------------------------------------ T17 → T15: the unit hand-off UI */

test('W5: the S8 #19 hand-off is visible in Settings', async (t) => {
  await t.test('Settings reads the store API T17 exported', () => {
    const s = src('site/js/screens/settings.js');
    assert.match(s, /archivedUnits/, 'the "Past units" list');
    assert.match(s, /flags\.archivedUnit/, 'the "Unit 1A is filed away" note on the load that did it');
    assert.match(s, /unitsCard\(s\)/, 'and the card is actually mounted');
    assert.match(src('site/css/screens.css'), /\.set-units/, 'with CSS');
  });

  await t.test('the card is hidden while there is nothing to show (this build never archives itself)', () => {
    const s = fresh();
    assert.equal(archivedUnits(s).length, 0);
    assert.equal(s.unitId, UNIT_ID);
    assert.match(src('site/js/screens/settings.js'), /if \(!past\.length && !justNow\) return null;/);
  });

  await t.test('an archived unit survives a pack/unpack round trip with its stats', () => {
    const s = fresh(Date.parse('2026-08-01T09:00:00'));
    s.xp = 6420;
    s.cards['voc-01'] = { attempts: 2, cleared: true, history: [] };
    s.skills.VOC = { m: 82, n: 9, lastAt: 1 };
    archiveUnit(s, { id: 'u1b', skills: ['VOC'] }, Date.parse('2026-09-16T09:00:00'));
    const back = unpack(JSON.parse(JSON.stringify(pack(s))));
    const [entry] = archivedUnits(back);
    assert.equal(entry.unitId, LEGACY_UNIT_ID);
    assert.equal(entry.stats.cards, 1);
    assert.equal(entry.stats.xpAtArchive, 6420);
    assert.equal(back.skills.VOC.m, 82, 'a reused skill id keeps its record');
    assert.ok(!back.cards['voc-01'], 'the live unit starts clean');
  });
});

/* ------------------------------------------------------------------ standing policy */

test('W5: the wave did not break the standing rules', async (t) => {
  // (the real Math.random scan is no-random.test.mjs — it strips comments first, which matters here:
  // onboard.js names the rule in a comment. This case is about the content bank an engine wave must not move.)
  await t.test('the pool of originals is unchanged', () => {
    assert.equal(ALL_CARDS.length, 197, 'the content bank is untouched by an engine wave');
    assert.equal(moduleById.M1.originals.length + moduleById.M9.originals.length, 109);
  });
});
