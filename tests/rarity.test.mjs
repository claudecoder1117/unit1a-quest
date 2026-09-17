// rarity.test.mjs — T06f: every non-bonus id in source-manifest.js has a Foil path under the S4 class rule
// (a / b / c), family tiles have theirs, the Bonus bank has none; fixtures reach Platinum for one card of each
// class and for a family tile (6 Gold across 2 days); Gold on wp-01 requires setupTried (COMPOSED S4 "Rarity",
// S6 test list). The class rule lives in site/js/rarity.js as pure functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { manifest, MANIFEST_IDS, FAMILY_TILES, isBonus, manifestIds } from '../site/data/source-manifest.js';
import { byId } from '../site/data/cards.js';
import { moduleById, familyById } from '../site/data/modules.js';
import {
  RARITIES, FOIL_NEED, FAMILY_PLATINUM_GOLD, FAMILY_PLATINUM_DAYS, FAMILY_STEPS,
  isClean, needsSetupForGold, rarityOf, bestRarity, foilClass, ownTemplate, generatorOf, familyTemplates,
  foilRule, foilPath, templateOfVia, foilProgress, foilEarned, familyRarity, tileRarity,
} from '../site/js/rarity.js';

const nonBonus = manifestIds({ bonus: false });
const range = (prefix, from, to, pad = 2) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}-${String(from + i).padStart(pad, '0')}`);

// =====================================================================================
// the class partition (S4)
// =====================================================================================

const CLASS_A = [...range('ang-wu', 1, 5, 1), ...range('ang', 2, 11), ...range('doc', 5, 7), ...range('wp', 1, 16)];
const CLASS_B = [...range('fac', 1, 18), ...range('quad', 1, 3), ...range('cls', 1, 4), ...range('not', 1, 9)];
const CLASS_C = [...range('asn', 1, 36), ...range('qz', 1, 18), ...range('voc', 1, 23), ...range('def', 1, 14), ...range('fact', 1, 5)];

test('rarity: every non-bonus manifest id has a Foil path under class (a), (b) or (c); bonus none; family tiles their own', () => {
  for (const id of nonBonus) {
    const cls = foilClass(id);
    assert.ok(cls === 'a' || cls === 'b' || cls === 'c', `${id}: no Foil path (class ${cls})`);
    const path = foilPath(id);
    assert.equal(path.cls, cls);
    assert.equal(path.need, FOIL_NEED);
    assert.ok(typeof path.rule === 'string' && path.rule.startsWith('Platinum = Gold + Foil.'), `${id}: rule "${path.rule}"`);
  }
  for (const id of manifestIds().filter(isBonus)) {
    assert.equal(foilClass(id), null, `${id}: the Bonus bank has no rarity path`);
    assert.equal(foilPath(id).need, 0);
    assert.match(foilRule(id), /Bonus bank/);
  }
  for (const f of FAMILY_TILES) {
    assert.equal(foilClass(f), 'family', f);
    assert.equal(foilPath(f).need, FAMILY_PLATINUM_GOLD);
    assert.match(foilRule(f), /Platinum at 6 Gold Variants across 2 or more days/);
    assert.ok(familyById[f], `${f} is a family tile in modules.js`);
  }
  for (const bad of [null, undefined, '', 42, 'ang-12', 'wp-17', 'fac-19', 'asn-37', 'qz-19', 'voc-24', 'def-15', 'fact-06', 'cls-05', 'not-10', 'quad-04', 'ang-wu-6', 'fam-nope', 'T-wp-07']) {
    assert.equal(foilClass(bad), null, `foilClass(${String(bad)})`);
  }
});

test('rarity: the class partition is exactly S4\'s — (a) 34 templated, (b) 34 family-templated, (c) 96 recall = 164 non-bonus', () => {
  const byClass = { a: [], b: [], c: [] };
  for (const id of nonBonus) byClass[foilClass(id)].push(id);
  assert.deepEqual(byClass.a.sort(), CLASS_A.slice().sort());
  assert.deepEqual(byClass.b.sort(), CLASS_B.slice().sort());
  assert.deepEqual(byClass.c.sort(), CLASS_C.slice().sort());
  assert.equal(byClass.a.length, 34);
  assert.equal(byClass.b.length, 34);
  assert.equal(byClass.c.length, 96);
  assert.equal(byClass.a.length + byClass.b.length + byClass.c.length, 164);
  assert.equal(MANIFEST_IDS.length, 197);
  // (a) = exactly the cards with a generated own template (S2 §7 rows + diagram variants); (b) = family templates
  for (const id of CLASS_A) assert.ok(byId[id], `${id} exists`);
  for (const row of manifest) if (!row.bonus) assert.equal(foilClass(row.id) === 'a', CLASS_A.includes(row.id), row.id);
});

test('rarity: class (a) own templates — T-<id> (T-fig-pairs for ang-wu-*), implemented by a generator in the module\'s template list', () => {
  for (const id of CLASS_A) {
    const t = ownTemplate(id);
    const g = generatorOf(id);
    const mod = moduleById[byId[id].module];
    assert.equal(t, /^ang-wu-/.test(id) ? 'T-fig-pairs' : `T-${id}`, `${id}: own template ${t}`);
    assert.ok(g, `${id}: generator`);
    assert.ok(mod.templates.includes(g), `${id}: generator ${g} is not one of ${mod.id}'s templates (${mod.templates})`);
    assert.deepEqual(familyTemplates(id), [], `${id}: class (a) has no family templates`);
    assert.ok(foilRule(id).includes(t), `${id}: the tooltip names the own template`);
  }
  assert.equal(ownTemplate('wp-07'), 'T-wp-07');
  assert.equal(ownTemplate('ang-10'), 'T-ang-10');
  assert.equal(ownTemplate('doc-06'), 'T-doc-06');
  assert.equal(ownTemplate('ang-wu-3'), 'T-fig-pairs');
  assert.equal(generatorOf('wp-07'), 'T-cs-lin');
  assert.equal(generatorOf('wp-10'), 'T-cs-ratio');
  assert.equal(generatorOf('wp-12'), 'T-cs-quad');
  assert.equal(generatorOf('ang-10'), 'T-fig-xlines-Q');
  assert.equal(generatorOf('doc-07'), 'T-fig-system');
  assert.equal(generatorOf('doc-05'), 'T-fig-bisect-L');
  assert.equal(generatorOf('ang-05'), 'T-fig-bisect-Q');
  assert.equal(generatorOf('ang-04'), 'T-seg-mid');
  assert.equal(generatorOf('ang-09'), 'T-cs-quad');
  assert.equal(ownTemplate('fac-01'), null);
  assert.equal(generatorOf('asn-01'), null);
});

test('rarity: class (b) family templates are the module\'s own generators (T-factor-*, T-quad-solve, T-classify, T-notation)', () => {
  for (const id of CLASS_B) {
    const fam = familyTemplates(id);
    const mod = moduleById[byId[id].module];
    assert.ok(fam.length >= 1, `${id}: family templates`);
    for (const t of fam) assert.ok(mod.templates.includes(t), `${id}: ${t} is not one of ${mod.id}'s templates (${mod.templates})`);
    assert.equal(ownTemplate(id), null, `${id}: class (b) has no own template`);
    assert.match(foilRule(id), /review target, or 3 clean due-review clears on 3 different days — whichever comes first/, id);
  }
  assert.deepEqual([...familyTemplates('fac-16')], ['T-factor-a1', 'T-factor-a2', 'T-factor-gcf', 'T-factor-neg']);
  assert.deepEqual([...familyTemplates('quad-02')], ['T-quad-solve']);
  assert.deepEqual([...familyTemplates('cls-01')], ['T-classify']);
  assert.deepEqual([...familyTemplates('not-04')], ['T-notation']);
  assert.match(foilRule('fac-16'), /T-factor-\*/);
  assert.match(foilRule('not-04'), /T-notation/);
  for (const id of CLASS_C) {
    assert.deepEqual(familyTemplates(id), []);
    assert.equal(ownTemplate(id), null);
    assert.equal(foilRule(id), 'Platinum = Gold + Foil. Foil: 3 clean due-review clears on 3 different days.');
  }
});

// =====================================================================================
// the rarity ladder (S4) and the setup rule
// =====================================================================================

test('rarity: Gold = firstTry ∧ hints ≤ 1; Silver = firstTry ∧ hints ≥ 2 or attempt 2; Bronze = attempt 3 or solution shown; clean = firstTry ∧ 0 hints', () => {
  assert.equal(rarityOf({ id: 'fac-01', firstTry: true, hints: 0 }), 'gold');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: true, hints: 1 }), 'gold', 'one H1 is tolerated — Gold is not the word clean');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: true, hints: 2 }), 'silver');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: true, hints: 3 }), 'silver');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: false, hints: 0, attempt: 2 }), 'silver');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: false, hints: 1 }), 'silver', 'attempt defaults to 2 when not first try');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: false, hints: 1, attempt: 3 }), 'bronze');
  assert.equal(rarityOf({ id: 'fac-01', firstTry: true, hints: 0, solutionShown: true }), 'bronze', 'solution shown caps at Bronze');
  assert.equal(rarityOf({ id: 'asn-01', firstTry: true, hints: 0 }), 'gold');
  assert.equal(rarityOf({ firstTry: true, hints: 0 }), 'gold', 'no id: no setup rule');
  assert.equal(rarityOf(null), null);
  assert.equal(rarityOf(undefined), null);
  assert.equal(isClean({ firstTry: true, hints: 0 }), true);
  assert.equal(isClean({ firstTry: true, hints: 1 }), false, 'Gold-with-H1 is not clean (Global rule 8)');
  assert.equal(isClean({ firstTry: false, hints: 0 }), false);
  assert.equal(isClean(null), false);
  assert.deepEqual([...RARITIES], ['bronze', 'silver', 'gold', 'platinum']);
  assert.equal(bestRarity('silver', 'gold'), 'gold');
  assert.equal(bestRarity('gold', 'silver'), 'gold');
  assert.equal(bestRarity('platinum', 'gold'), 'platinum');
  assert.equal(bestRarity(null, 'bronze'), 'bronze');
  assert.equal(bestRarity('bronze', undefined), 'bronze');
  assert.equal(bestRarity(null, null), null);
});

test('rarity: Gold on wp-01 (and every wp-*, ang-02..11, doc-06) requires the equation setup to have been tried; nowhere else', () => {
  assert.equal(rarityOf({ id: 'wp-01', firstTry: true, hints: 0 }), 'silver', 'first-try clean without a setup attempt is Silver, not Gold');
  assert.equal(rarityOf({ id: 'wp-01', firstTry: true, hints: 0, setupTried: false }), 'silver');
  assert.equal(rarityOf({ id: 'wp-01', firstTry: true, hints: 0, setupTried: true }), 'gold');
  assert.equal(rarityOf({ id: 'wp-01', firstTry: true, hints: 1, setupTried: true }), 'gold');
  assert.equal(rarityOf({ id: 'ang-10', firstTry: true, hints: 0 }), 'silver');
  assert.equal(rarityOf({ id: 'ang-10', firstTry: true, hints: 0, setupTried: true }), 'gold');
  assert.equal(rarityOf({ id: 'doc-06', firstTry: true, hints: 0 }), 'silver');
  assert.equal(rarityOf({ id: 'doc-05', firstTry: true, hints: 0 }), 'gold', 'doc-05 is a strip, not a setup card');
  assert.equal(rarityOf({ id: 'doc-07', firstTry: true, hints: 0 }), 'gold', 'S4 lists wp-*, ang-02..11, doc-06 only');
  assert.equal(rarityOf({ id: 'ang-wu-1', firstTry: true, hints: 0 }), 'gold');
  const WANT = new Set([...range('wp', 1, 16), ...range('ang', 2, 11), 'doc-06']);
  for (const id of MANIFEST_IDS) {
    assert.equal(needsSetupForGold(id), WANT.has(id), `${id}: needsSetupForGold`);
    if (WANT.has(id)) {
      assert.ok(byId[id].parts.some((p) => p.type === 'equation'), `${id}: a setup card must carry an equation part`);
      assert.match(foilRule(id), /Gold needs one equation setup\.$/, `${id}: the tooltip says so`);
      assert.equal(foilPath(id).needsSetup, true);
    } else {
      assert.doesNotMatch(foilRule(id), /equation setup/);
      assert.equal(foilPath(id).needsSetup, false);
    }
  }
  assert.equal(needsSetupForGold(null), false);
});

// =====================================================================================
// Platinum fixtures — one card of each class and a family tile
// =====================================================================================

const variant = (template, seed, day) => ({ day, via: `${template}#${seed}` });
const review = (day) => ({ day, via: 'review' });

test('rarity: class (a) fixture — wp-07 reaches Platinum after 3 Gold Variants of T-wp-07 (T-wp-08 variants and reviews never count)', () => {
  const id = 'wp-07';
  assert.equal(templateOfVia('T-wp-07#a91f2c'), 'T-wp-07');
  assert.equal(templateOfVia('review'), null);
  assert.equal(templateOfVia(null), null);
  const two = [variant('T-wp-07', 'a1', '2026-09-17'), variant('T-wp-07', 'a2', '2026-09-17')];
  assert.equal(foilEarned(id, two), false);
  assert.deepEqual({ ...foilProgress(id, two) }, { cls: 'a', have: 2, need: 3, variants: 2, reviewDays: 0, done: false });
  const three = [...two, variant('T-wp-07', 'a3', '2026-09-17')];
  assert.equal(foilEarned(id, three), true, 'three Gold Variants of the own template, same day is fine');
  assert.equal(foilProgress(id, three).have, 3);
  const wrongTemplate = [...two, variant('T-wp-08', 'b1', '2026-09-18')];
  assert.equal(foilEarned(id, wrongTemplate), false, 'another card\'s template does not count');
  const reviews = [review('2026-09-17'), review('2026-09-18'), review('2026-09-19')];
  assert.equal(foilEarned(id, reviews), false, 'reviews never earn class (a) Foil — the test is different numbers');
  const viaGenerator = [variant('T-cs-lin', 'g1', 'd1'), variant('T-cs-lin', 'g2', 'd1'), variant('T-cs-lin', 'g3', 'd2')];
  assert.equal(foilEarned(id, viaGenerator), true, 'a record naming the implementing generator (seeded for this card) counts too');
  // rarity + Foil ⇒ Platinum; Gold alone is Gold; Silver + Foil stays Silver
  const gold = rarityOf({ id, firstTry: true, hints: 1, setupTried: true });
  assert.equal(gold, 'gold');
  assert.equal(tileRarity(id, { rarity: gold, foilProgress: three }), 'platinum');
  assert.equal(tileRarity(id, { rarity: gold, foilProgress: two }), 'gold');
  assert.equal(tileRarity(id, { rarity: 'silver', foilProgress: three }), 'silver');
  assert.equal(tileRarity(id, { rarity: gold, foil: true }), 'platinum', 'a stored foil flag works too');
  assert.equal(tileRarity(id, { rarity: 'platinum' }), 'platinum');
  assert.equal(tileRarity(id, { rarity: null }), null);
  assert.equal(tileRarity(id, null), null);
  assert.equal(foilEarned(id, null), false);
  assert.equal(foilEarned(id, [null, 5, 'x', {}]), false, 'garbage entries are ignored');
});

test('rarity: class (b) fixture — fac-16 reaches Platinum via 3 Gold T-factor-* Variants OR 3 clean due-review days, whichever comes first (never a sum)', () => {
  const id = 'fac-16';
  const vars = [variant('T-factor-neg', 'n1', 'd1'), variant('T-factor-a2', 'n2', 'd1'), variant('T-factor-gcf', 'n3', 'd1')];
  assert.equal(foilEarned(id, vars), true, 'three family Variants drawn as this card\'s review target');
  assert.equal(foilEarned(id, vars.slice(0, 2)), false);
  const days = [review('2026-09-17'), review('2026-09-18'), review('2026-09-19')];
  assert.equal(foilEarned(id, days), true, 'three clean due-review clears on three distinct days');
  assert.equal(foilEarned(id, [review('2026-09-17'), review('2026-09-17'), review('2026-09-17')]), false, 'same day three times is one day');
  assert.equal(foilEarned(id, [review('2026-09-17'), review('2026-09-18'), { day: '2026-09-19', via: 'review', hints: 1 }]), false, 'a review with a hint is not clean');
  assert.equal(foilEarned(id, [review('2026-09-17'), review('2026-09-18'), { day: '2026-09-19', via: 'review', firstTry: false }]), false, 'a retry review is not clean');
  const mixed = [variant('T-factor-neg', 'n1', 'd1'), variant('T-factor-a2', 'n2', 'd1'), review('d2'), review('d3')];
  assert.equal(foilEarned(id, mixed), false, '2 Variants + 2 review days is not 3 of either — whichever comes FIRST, not a sum');
  assert.deepEqual({ ...foilProgress(id, mixed) }, { cls: 'b', have: 2, need: 3, variants: 2, reviewDays: 2, done: false });
  assert.equal(foilEarned(id, [variant('T-quad-solve', 'q1', 'd1'), variant('T-quad-solve', 'q2', 'd1'), variant('T-quad-solve', 'q3', 'd1')]), false, 'another family\'s template does not count');
  assert.equal(tileRarity(id, { rarity: 'gold', foilProgress: days }), 'platinum');
  assert.equal(tileRarity('quad-02', { rarity: 'gold', foilProgress: [variant('T-quad-solve', '1', 'd'), variant('T-quad-solve', '2', 'd'), variant('T-quad-solve', '3', 'd')] }), 'platinum');
  assert.equal(tileRarity('not-04', { rarity: 'gold', foilProgress: [variant('T-notation', '1', 'd'), variant('T-notation', '2', 'd'), variant('T-notation', '3', 'd')] }), 'platinum');
  assert.equal(tileRarity('cls-01', { rarity: 'gold', foilProgress: days }), 'platinum');
});

test('rarity: class (c) fixture — asn-01 reaches Platinum after 3 clean due-review clears on 3 distinct days; Variants never count', () => {
  const id = 'asn-01';
  const days = [review('2026-09-17'), review('2026-09-19'), review('2026-09-21')];
  assert.equal(foilEarned(id, days), true);
  assert.equal(foilEarned(id, days.slice(0, 2)), false);
  assert.equal(foilEarned(id, [review('d'), review('d'), review('d'), review('d')]), false, 'spacing is the proof for recall');
  assert.equal(foilEarned(id, [variant('T-vocab', '1', 'd1'), variant('T-vocab', '2', 'd2'), variant('T-vocab', '3', 'd3')]), false);
  assert.deepEqual({ ...foilProgress(id, days) }, { cls: 'c', have: 3, need: 3, variants: 0, reviewDays: 3, done: true });
  assert.equal(tileRarity(id, { rarity: 'gold', foilProgress: days }), 'platinum');
  for (const other of ['qz-04', 'voc-01', 'def-14', 'fact-05']) assert.equal(tileRarity(other, { rarity: 'gold', foilProgress: days }), 'platinum', other);
  assert.equal(tileRarity('bonus-01', { rarity: 'gold', foilProgress: days }), 'gold', 'the Bonus bank never reaches Platinum');
  assert.deepEqual({ ...foilProgress('bonus-01', days) }, { cls: null, have: 0, need: 0, variants: 0, reviewDays: 0, done: false });
});

test('rarity: family tile fixture — fam-sys goes Bronze / Silver / Gold at 1 / 2 / 3 Gold Variants and Platinum at 6 across ≥ 2 days', () => {
  assert.deepEqual({ ...FAMILY_STEPS }, { bronze: 1, silver: 2, gold: 3 });
  assert.equal(FAMILY_PLATINUM_GOLD, 6);
  assert.equal(FAMILY_PLATINUM_DAYS, 2);
  assert.equal(familyRarity({ clearsGold: 0, goldDays: [] }), null);
  assert.equal(familyRarity(null), null);
  assert.equal(familyRarity({ clearsGold: 1, goldDays: ['d1'] }), 'bronze');
  assert.equal(familyRarity({ clearsGold: 2, goldDays: ['d1'] }), 'silver');
  assert.equal(familyRarity({ clearsGold: 3, goldDays: ['d1'] }), 'gold');
  assert.equal(familyRarity({ clearsGold: 5, goldDays: ['d1', 'd2'] }), 'gold');
  assert.equal(familyRarity({ clearsGold: 6, goldDays: ['d1'] }), 'gold', 'six on one day is Gold, not Platinum — Gold and Foil never coincide');
  assert.equal(familyRarity({ clearsGold: 6, goldDays: ['d1', 'd1', 'd1'] }), 'gold', 'duplicate days count once');
  assert.equal(familyRarity({ clearsGold: 6, goldDays: ['d1', 'd2'] }), 'platinum');
  assert.equal(familyRarity({ clearsGold: 9, goldDays: ['d1', 'd2', 'd3'] }), 'platinum');
  assert.equal(familyRarity({ clearsGold: 2.9, goldDays: ['d1'] }), 'silver', 'fractional counts floor');
  assert.equal(foilEarned('fam-sys', [variant('T-sys', '1', 'd1')]), false, 'family tiles do not use foilEarned');
  assert.equal(foilClass('fam-sys'), 'family');
});
