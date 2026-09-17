// tests/pairs.test.mjs — T04: figure model + pairs grader + SVG (COMPOSED S6 test list, S8 #4).
//   • F1's valid-pair set for EVERY relation equals a hand-checked list (letters A and G)
//   • every teacher warm-up pair from content/SOURCE.md §1 is accepted
//   • ∠BFC + ∠CFD is rejected as supplementary (64 + 26 = 90) and accepted as complementary
//   • all four typed spellings parse (∠GFC · angle GFC · <GFC · GFC), two letters / vertex-first are refused
//   • the T-fig-pairs generic angle set {23, 29, 41, 47, 71, 79} + 90 has no accidental sums
//     (assertNoAccidentalSums / accidentalSumsInSet), and a fan that does have one is caught
//   • every shipped figure validates, renders, and lints clean at 375 px (no clipped labels)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { figures, F1, F2, D5, D7, AH, F2_TICKS, getFigure } from '../site/data/figures.js';
import {
  resolve, angles, pairs, measure, validate, relate, isPair, findAngle, getAngle, applyRename,
  accidentalSums, accidentalSumsInSet, assertNoAccidentalSums, generic, generic2,
  GENERIC_DEG, GENERIC_ANGLE_SET, RELATIONS, normRelation, describe as describeModel,
} from '../site/js/figure/model.js';
import { render, renderModel, layout, lint, clearCache, VIEW } from '../site/js/figure/svg.js';
import { gradePairs, grade, parseName, normalizeName, NAME_RE, resolveModel } from '../site/js/grader/pairs.js';

const sortPairs = (list) => list.map(p => [...p].sort()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
const canon = (n) => { const [x, v, y] = n.replace(/A/g, 'G'); return [x, y].sort().join(v); };   // A→G, outer letters re-sorted
const withG = (list) => sortPairs(list.map(p => p.map(canon)));
const F1A = () => resolve(F1, {});
const F1G = () => resolve(F1, { rename: { A: 'G' } });

// ------------------------------------------------------------------------------------------------
// hand lists for F1 (rays D 0°, C 26°, B 90°, A 180°, E 206°; lines AD and EC; FB ⟂ AD)
const HAND = {
  linearPair: [['AFB', 'BFD'], ['AFC', 'AFE'], ['AFC', 'CFD'], ['AFE', 'DFE'], ['BFC', 'BFE'], ['CFD', 'DFE']],
  vertical: [['AFC', 'DFE'], ['AFE', 'CFD']],
  complementary: [['AFE', 'BFC'], ['BFC', 'CFD']],
  supplementary: [['AFB', 'BFD'], ['AFC', 'AFE'], ['AFC', 'CFD'], ['AFE', 'DFE'], ['BFC', 'BFE'], ['CFD', 'DFE']],
  adjacent: [
    ['AFB', 'BFD'], ['AFC', 'AFE'], ['AFC', 'CFD'], ['AFE', 'DFE'], ['BFC', 'BFE'], ['CFD', 'DFE'],   // the six linear pairs
    ['BFC', 'CFD'], ['AFB', 'BFC'], ['AFB', 'AFE'], ['BFD', 'BFE'], ['BFD', 'DFE'], ['BFE', 'DFE'],   // adjacent, not linear
  ],
  nonAdjacent: [
    ['AFB', 'AFC'], ['AFB', 'BFE'], ['AFB', 'CFD'], ['AFB', 'DFE'], ['AFC', 'BFC'], ['AFC', 'BFD'], ['AFC', 'BFE'], ['AFC', 'DFE'],
    ['AFE', 'BFC'], ['AFE', 'BFD'], ['AFE', 'BFE'], ['AFE', 'CFD'], ['BFC', 'BFD'], ['BFC', 'DFE'], ['BFD', 'CFD'], ['BFE', 'CFD'],
  ],
};

describe('figure model — F1', () => {
  test('every shipped figure validates and has no accidental sums', () => {
    for (const [id, fig] of Object.entries(figures)) {
      const m = resolve(fig, {});
      assert.deepEqual(validate(m), [], id);
      assert.deepEqual(accidentalSums(m), [], id);
      assert.equal(assertNoAccidentalSums(m), true);
      assert.equal(m.figId, id);
    }
    assert.equal(getFigure('F1G'), F1); assert.equal(getFigure('F1A'), F1); assert.equal(getFigure('F2'), F2); assert.equal(getFigure('nope'), null);
  });

  test('angles(F1): the eight angles < 180, straight AFD / CFE excluded, composites included', () => {
    const names = angles(F1A()).map(a => a.name).sort();
    assert.deepEqual(names, ['AFB', 'AFC', 'AFE', 'BFC', 'BFD', 'BFE', 'CFD', 'DFE']);
    const afc = getAngle(F1A(), 'AFC');
    assert.equal(afc.level, 1); assert.deepEqual(afc.inside, ['B']); assert.equal(afc.atomic, false);
    assert.equal(getAngle(F1A(), 'CFD').atomic, true);
    assert.equal(getAngle(F1A(), 'C-D').name, 'CFD');                 // by id
    assert.equal(findAngle(F1A(), 'D', 'A').straight, true);          // opposite rays → straight, refused by graders
    assert.equal(findAngle(F1A(), 'D', 'Z'), null);
  });

  test('measure() reports the DRAWN instance (C at 26° per the scan)', () => {
    const m = F1A();
    assert.equal(measure(m, 'C', 'D'), 26); assert.equal(measure(m, 'D', 'C'), 26);
    assert.equal(measure(m, 'B', 'C'), 64); assert.equal(measure(m, 'B', 'D'), 90); assert.equal(measure(m, 'A', 'B'), 90);
    assert.equal(measure(m, 'A', 'E'), 26); assert.equal(measure(m, 'B', 'E'), 116); assert.equal(measure(m, 'A', 'C'), 154);
    assert.equal(measure(m, 'D', 'E'), 154); assert.equal(measure(m, 'A', 'D'), 180);
    assert.ok(Number.isNaN(measure(m, 'A', 'Z')));
    assert.equal(measure(F1G(), 'G', 'E'), 26);
  });

  test('generic instance puts the free ray C at 35.37° and E stays opposite; a generic model is its own generic', () => {
    const m = F1A();
    const g = generic(m);
    assert.ok(Math.abs(g.rays.find(r => r.n === 'C').deg - GENERIC_DEG) < 1e-9);
    assert.ok(Math.abs(g.rays.find(r => r.n === 'E').deg - (GENERIC_DEG + 180)) < 1e-9);
    assert.equal(g.rays.find(r => r.n === 'B').deg, 90);                 // tied to D by the right-angle mark
    assert.equal(generic(g), g);
    const g2 = generic2(m);
    assert.notEqual(g2.rays.find(r => r.n === 'C').deg, g.rays.find(r => r.n === 'C').deg);
    assert.deepEqual(angles(g).map(a => a.name).sort(), angles(m).map(a => a.name).sort());   // same angle identities
  });

  for (const rel of RELATIONS) {
    test(`pairs(F1, '${rel}') equals the hand list (letters A)`, () => {
      assert.deepEqual(pairs(F1A(), rel), sortPairs(HAND[rel]));
    });
    test(`pairs(F1G, '${rel}') equals the hand list with G`, () => {
      assert.deepEqual(pairs(F1G(), rel), withG(HAND[rel]));
    });
  }

  test('relation aliases and isPair', () => {
    assert.equal(normRelation('linear pair'), 'linearPair'); assert.equal(normRelation('supp'), 'supplementary');
    assert.equal(normRelation('non-adjacent'), 'nonAdjacent'); assert.equal(normRelation('nope'), null);
    const m = F1A();
    assert.equal(isPair(m, 'AFE', 'CFD', 'vertical'), true);
    assert.equal(isPair(m, 'AFE', 'CFD', 'linear pair'), false);
    assert.equal(isPair(m, 'BFC', 'AFE', 'complementary'), true);       // non-adjacent complementary pair
    assert.equal(isPair(m, 'BFC', 'AFE', 'adjacent'), false);
    assert.throws(() => pairs(m, 'bogus'), /unknown relation/);
  });

  test('relate(): arithmetic of the drawn instance and structural flags', () => {
    const r = relate(F1A(), 'BFC', 'CFD');
    assert.equal(r.sum, 90); assert.equal(r.complementary, true); assert.equal(r.adjacent, true); assert.equal(r.linearPair, false);
    assert.ok(Math.abs(r.sumGeneric - 90) < 1e-9);
    const v = relate(F1A(), 'AFE', 'CFD');
    assert.equal(v.vertical, true); assert.equal(v.nonAdjacent, true); assert.equal(v.shared, null);
    const o = relate(F1A(), 'AFC', 'BFC');
    assert.equal(o.overlap, true); assert.equal(o.contains, true); assert.equal(o.adjacent, false);
    assert.equal(relate(F1A(), 'AFB', 'AFB').sameAngle, true);
  });

  test('rename is applied everywhere and must be injective', () => {
    const g = F1G();
    assert.deepEqual(g.rays.map(r => r.n), ['D', 'C', 'B', 'G', 'E']);
    assert.deepEqual(g.lines, [['G', 'D'], ['E', 'C']]);
    assert.deepEqual(g.rightMarks, [['B', 'G']]);
    assert.equal(getAngle(g, 'AFC'), null);
    assert.ok(validate(resolve(F1, { rename: { A: 'B' } })).some(s => /duplicate letter B/.test(s)));   // collides with the unmapped B
    assert.ok(validate({ ...F1A(), rename: { A: 'G', B: 'G' } }).some(s => /injective/.test(s)));
    const r = applyRename(F1, { A: 'K', B: 'M' });
    assert.deepEqual(r.rightMarks, [['M', 'K']]);
  });

  test('rotate / mirror keep every structural relation (generated variants)', () => {
    for (const opts of [{ rotate: 30 }, { rotate: 195, mirror: true }, { rotate: 345, mirror: false, rename: { A: 'K', B: 'M', C: 'P', D: 'R', E: 'S', F: 'T' } }]) {
      const m = resolve(F1, opts);
      assert.deepEqual(validate(m), []);
      for (const rel of RELATIONS) assert.equal(pairs(m, rel).length, HAND[rel].length, `${rel} ${JSON.stringify(opts)}`);
      assert.deepEqual(accidentalSums(m), []);
    }
  });

  test('notToScale: auto from letters in labels, or a numeric label that disagrees with the drawing', () => {
    assert.equal(resolve(F1, {}).notToScale, false);
    assert.equal(resolve(F1, { labels: [{ angle: ['B', 'C'], text: '−x + 84' }] }).notToScale, true);
    assert.equal(resolve(F1, { labels: [{ angle: ['C', 'D'], text: '31°' }] }).notToScale, true);    // cls-01 gives 31° on a 26° drawing
    assert.equal(resolve(F1, { labels: [{ angle: ['C', 'D'], text: '26°' }] }).notToScale, false);
    assert.equal(resolve(F1, { labels: [{ angle: ['C', 'D'], text: '31°' }], notToScale: false }).notToScale, false);
    assert.equal(resolve(F2, {}).notToScale, true);
  });
});

// ------------------------------------------------------------------------------------------------
describe('figure model — F2, D5, D7, AH', () => {
  test('F2 poly: seven angles across five vertices, aliases through the midpoints, linear pairs at B and D', () => {
    const m = resolve(F2, {});
    assert.equal(angles(m).length, 7);
    assert.equal(findAngle(m, 'B', 'E', 'A').key, findAngle(m, 'C', 'E', 'A').key);   // ∠BAE ≡ ∠CAE
    assert.deepEqual(pairs(m, 'linearPair'), [['ABD', 'CBD'], ['BDC', 'BDE']]);
    assert.deepEqual(pairs(m, 'supplementary'), [['ABD', 'CBD'], ['BDC', 'BDE']]);
    assert.deepEqual(pairs(m, 'vertical'), []);
    assert.ok(Math.abs(measure(m, 'C', 'E', 'A') - 62.85) < 0.1);
    assert.equal(m.ticks.length, 0);                                     // as printed
    assert.equal(resolve(F2, { ticks: F2_TICKS }).ticks.length, 2);
    const bad = resolve({ ...F2, points: { ...F2.points, B: [160, 127.5] } }, {});
    assert.ok(validate(bad).some(s => /off the line/.test(s)));
  });

  test('D5 / AH: three rays, one adjacent pair, both halves inside the whole', () => {
    for (const [fig, whole, h1, h2] of [[D5, 'ABC', 'ABD', 'CBD'], [AH, 'CAM', 'HAM', 'CAH']]) {
      const m = resolve(fig, {});
      assert.deepEqual(angles(m).map(a => a.name).sort(), [whole, h1, h2].sort());
      assert.deepEqual(pairs(m, 'adjacent'), [[h1, h2].sort()]);
      assert.deepEqual(pairs(m, 'supplementary'), []); assert.deepEqual(pairs(m, 'complementary'), []);
      assert.equal(relate(m, whole, h1).contains, true);
    }
    assert.equal(measure(resolve(D5, {}), 'A', 'D'), 82); assert.equal(measure(resolve(D5, {}), 'D', 'C'), 78);
    assert.equal(measure(resolve(AH, {}), 'M', 'H'), 65); assert.equal(measure(resolve(AH, {}), 'H', 'C'), 62);
  });

  test('D7: position names UL/UR/LR/LL, vertical and linear pairs by alias', () => {
    const m = resolve(D7, {});
    const ul = getAngle(m, 'UL');
    assert.equal(ul.alias, 'UL'); assert.equal(ul.label, 'upper-left angle'); assert.equal(ul.deg, 32);
    assert.equal(getAngle(m, 'UR').deg, 148); assert.equal(getAngle(m, 'LR').deg, 32); assert.equal(getAngle(m, 'LL').deg, 148);
    assert.equal(isPair(m, 'UL', 'LR', 'vertical'), true); assert.equal(isPair(m, 'UR', 'LL', 'vertical'), true);
    assert.equal(isPair(m, 'UL', 'UR', 'linearPair'), true); assert.equal(isPair(m, 'UL', 'LL', 'supplementary'), true);
    assert.equal(isPair(m, 'UL', 'LR', 'supplementary'), false);
    assert.doesNotMatch(describeModel(m), /line [A-Z]{2}/);              // internal letters never reach aria
    assert.match(describeModel(m), /upper-left angle labelled 3x \+ y/);
  });
});

// ------------------------------------------------------------------------------------------------
describe('accidental sums — the T-fig-pairs generic set', () => {
  test('{23, 29, 41, 47, 71, 79} + 90 has no two members (with repetition) summing to 90 or 180', () => {
    assert.deepEqual(accidentalSumsInSet([...GENERIC_ANGLE_SET, 90]), []);
    assert.deepEqual(accidentalSumsInSet(GENERIC_ANGLE_SET), []);
    assert.deepEqual(accidentalSumsInSet([...GENERIC_ANGLE_SET, 90], { allowRight: false }), [[90, 90]]);
    // the old set failed: 23 + 67 and 37 + 53
    assert.deepEqual(accidentalSumsInSet([23, 67, 37, 53, 90]), [[23, 67], [37, 53]]);
    assert.ok(GENERIC_ANGLE_SET.every(d => d !== 45 && d !== 90));
  });

  test('a fan built from the set (two lines + one extra ray, rotated, mirrored) passes assertNoAccidentalSums', () => {
    const build = (a, b, rotate, mirror) => resolve({
      id: 'gen', kind: 'fan', vertex: 'V',
      rays: [{ n: 'P', deg: 0 }, { n: 'Q', deg: a }, { n: 'R', deg: a + b, free: true }, { n: 'S', deg: 180 }, { n: 'T', deg: 180 + a + b }],
      lines: [['P', 'S'], ['R', 'T']], rightMarks: [], dots: true, arrows: true, labels: [],
    }, { rotate, mirror });
    for (const [a, b] of [[23, 47], [29, 41], [41, 71], [47, 79], [71, 23], [79, 29]]) {
      for (const rotate of [0, 15, 195]) for (const mirror of [false, true]) {
        const m = build(a, b, rotate, mirror);
        assert.deepEqual(validate(m), []);
        assert.equal(assertNoAccidentalSums(m), true, `${a} ${b} ${rotate} ${mirror}`);
        assert.equal(pairs(m, 'vertical').length, 2);
        assert.equal(pairs(m, 'linearPair').length, 6);
        assert.deepEqual(pairs(m, 'complementary'), []);
      }
    }
  });

  test('a fan WITH an accidental 90 sum is caught; the same fan with a right-angle mark is structural', () => {
    const fan = (rightMarks) => resolve({
      id: 'acc', kind: 'fan', vertex: 'V',
      rays: [{ n: 'P', deg: 0 }, { n: 'Q', deg: 67 }, { n: 'R', deg: 90 }, { n: 'S', deg: 180 }],
      lines: [['P', 'S']], rightMarks, dots: false, arrows: true, labels: [],
    }, {});
    const loose = fan([]);
    assert.deepEqual(accidentalSums(loose), [{ a: 'PVQ', b: 'QVR', sum: 90 }]);
    assert.throws(() => assertNoAccidentalSums(loose), /PVQ \+ QVR = 90/);
    assert.deepEqual(pairs(loose, 'complementary'), []);                 // 67 + 23 = 90 only by luck
    const tied = fan([['R', 'P']]);
    assert.deepEqual(accidentalSums(tied), []);
    assert.deepEqual(pairs(tied, 'complementary'), [['PVQ', 'QVR']]);    // ⟂ makes the sum structural
    assert.deepEqual(pairs(tied, 'linearPair'), [['PVQ', 'QVS'], ['PVR', 'RVS']]);
  });
});

// ------------------------------------------------------------------------------------------------
describe('pairs grader — names', () => {
  test('all four typed spellings parse, plus case, spacing, m∠ and the degree sign', () => {
    const m = F1G();
    for (const raw of ['∠GFC', 'angle GFC', '<GFC', 'GFC', 'gfc', ' Angle   gfc ', 'm∠GFC', '∠GFC°', 'ANGLE GFC']) {
      const p = parseName(raw, m);
      assert.equal(p.ok, true, raw); assert.equal(p.key, 'CFG', raw); assert.equal(p.v, 'F');
    }
    assert.ok(NAME_RE.test(normalizeName('angle gfc')));
    assert.equal(parseName('∠CFG', m).shown, '∠CFG');                   // shown as typed, key canonical
    assert.equal(parseName('C-G', m).key, 'CFG');                        // wedge id
    assert.equal(parseName({ key: 'CFG' }, m).key, 'CFG');               // angle object
    assert.equal(parseName('UL', resolve(D7, {})).angle.alias, 'UL');   // alias
  });

  test('two letters → "three letters, vertex in the middle"; vertex first/last → "the vertex goes in the middle"', () => {
    const m = F1G();
    const two = parseName('FC', m);
    assert.equal(two.ok, false); assert.equal(two.kind, 'malformed'); assert.match(two.msg, /three letters, vertex in the middle/);
    assert.deepEqual(two.tags, ['vertex-not-middle']);
    const first = parseName('FCD', m);
    assert.equal(first.ok, false); assert.match(first.msg, /vertex goes in the middle/); assert.match(first.msg, /∠CFD/);
    assert.deepEqual(first.tags, ['vertex-not-middle']);
    assert.match(parseName('CDG', m).msg, /vertex goes in the middle/);
    assert.match(parseName('AFC', m).msg, /no point A/);                 // renamed away
    assert.match(parseName('GFG', m).msg, /same point twice/);
    assert.match(parseName('', m).msg, /three letters/);
    assert.match(parseName('GFCD', m).msg, /three letters only/);
  });

  test('straight angles are refused with a message (free, never an attempt)', () => {
    const p = parseName('∠AFD', F1A());
    assert.equal(p.ok, false); assert.equal(p.kind, 'malformed'); assert.equal(p.straight, true);
    assert.match(p.msg, /straight angle \(180°\)/); assert.match(p.msg, /opposite rays/);
    const r = gradePairs({ type: 'pairs', relation: 'supplementary', count: 1 }, [['∠AFD', '∠BFC']], F1A());
    assert.equal(r.kind, 'malformed'); assert.equal(r.results[0].straight, true); assert.equal(r.credit, 0);
  });
});

describe('pairs grader — verdicts', () => {
  const part = (relation, count) => ({ type: 'pairs', relation, count });

  test("every teacher warm-up pair from SOURCE §1 is accepted (teacher wrote A for the printed G)", () => {
    const m = F1A();
    const supp = gradePairs(part('supplementary', 3), [['∠EFA', '∠AFC'], ['∠AFC', '∠CFD'], ['∠AFE', '∠EFD']], m);
    assert.equal(supp.ok, true); assert.equal(supp.kind, 'correct'); assert.equal(supp.credit, 1); assert.equal(supp.valid, 3);
    assert.ok(supp.results.every(r => r.ok));
    assert.match(supp.results[0].msg, /26 \+ 154 = 180/);
    const comp = gradePairs(part('complementary', 1), [['∠BFC', '∠CFD']], m);
    assert.equal(comp.ok, true); assert.match(comp.msg, /64 \+ 26 = 90/);
    const vert = gradePairs(part('vertical', 1), [['∠AFE', '∠CFD']], m);
    assert.equal(vert.ok, true); assert.match(vert.msg, /vertical angles/);
    const lp = gradePairs(part('linearPair', 2), [['∠AFC', '∠CFD'], ['∠AFE', '∠EFD']], m);
    assert.equal(lp.ok, true); assert.match(lp.results[0].msg, /opposite rays/);
    const lpG = gradePairs(part('linearPair', 2), [['∠GFB', '∠BFD'], ['∠GFC', '∠CFD']], F1G());
    assert.equal(lpG.ok, true);
    const non = gradePairs(part('nonAdjacent', 2), [['∠BFA', '∠CFD'], ['∠BFC', '∠AFE']], m);
    assert.equal(non.ok, true); assert.match(non.results[1].msg, /complementary but not adjacent/);
    // S2's assertion list, one call each, in the printed letters
    for (const [a, b, rel] of [['EFA', 'AFC', 'supplementary'], ['AFC', 'CFD', 'supplementary'], ['AFE', 'EFD', 'supplementary'], ['BFC', 'CFD', 'complementary'], ['AFE', 'CFD', 'vertical'], ['BFA', 'CFD', 'nonAdjacent'], ['BFC', 'AFE', 'nonAdjacent'], ['BFC', 'AFE', 'complementary']]) {
      assert.equal(gradePairs(part(rel, 1), [[a, b]], m).ok, true, `${a} ${b} ${rel}`);
    }
  });

  test('∠BFC + ∠CFD: rejected as supplementary with the arithmetic line, accepted as complementary', () => {
    const m = F1A();
    const bad = gradePairs(part('supplementary', 3), [['∠BFC', '∠CFD']], m);
    assert.equal(bad.ok, false); assert.equal(bad.kind, 'wrong'); assert.equal(bad.credit, 0);
    assert.equal(bad.msg, "64 + 26 = 90 — that's complementary, not supplementary");
    assert.deepEqual(bad.tags, ['confused-comp-supp']);
    const good = gradePairs(part('complementary', 1), [['∠BFC', '∠CFD']], m);
    assert.equal(good.ok, true); assert.equal(good.kind, 'correct');
    const wrongComp = gradePairs(part('complementary', 1), [['∠AFC', '∠CFD']], m);
    assert.equal(wrongComp.kind, 'wrong'); assert.match(wrongComp.msg, /154 \+ 26 = 180 — that's supplementary \(a linear pair\), not complementary/);
    const notSum = gradePairs(part('supplementary', 1), [['∠BFD', '∠BFE']], m);
    assert.equal(notSum.kind, 'wrong'); assert.match(notSum.msg, /90 \+ 116 = 206, not 180/);
  });

  test('vertical / linear pair / adjacent / non-adjacent misconceptions carry their tags', () => {
    const m = F1A();
    const vl = gradePairs(part('vertical', 1), [['∠AFC', '∠CFD']], m);
    assert.equal(vl.kind, 'wrong'); assert.deepEqual(vl.tags, ['confused-vertical-linear']); assert.match(vl.msg, /linear pair/);
    const lv = gradePairs(part('linearPair', 1), [['∠AFE', '∠CFD']], m);
    assert.deepEqual(lv.tags, ['confused-vertical-linear']);
    const anl = gradePairs(part('linearPair', 1), [['∠BFC', '∠CFD']], m);
    assert.deepEqual(anl.tags, ['adjacent-not-linear']); assert.match(anl.msg, /FB and FD aren't opposite rays/);
    const na = gradePairs(part('linearPair', 1), [['∠AFE', '∠BFC']], m);
    assert.deepEqual(na.tags, ['not-adjacent']);
    const adj = gradePairs(part('adjacent', 1), [['∠AFB', '∠CFD']], m);
    assert.deepEqual(adj.tags, ['not-adjacent']); assert.match(adj.msg, /no common side/);
    const ov = gradePairs(part('adjacent', 1), [['∠AFC', '∠BFC']], m);
    assert.deepEqual(ov.tags, ['not-adjacent']); assert.match(ov.msg, /one lies inside the other/);
    const ane = gradePairs(part('nonAdjacent', 1), [['∠AFC', '∠CFD']], m);
    assert.deepEqual(ane.tags, ['adjacent-as-nonexample']); assert.match(ane.msg, /a linear pair, even/);
    const ok = gradePairs(part('adjacent', 1), [['∠BFD', '∠BFE']], m);
    assert.equal(ok.ok, true); assert.match(ok.msg, /share vertex F and ray FB/);
    const same = gradePairs(part('vertical', 1), [['∠AFE', '∠EFA']], m);
    assert.equal(same.kind, 'malformed'); assert.match(same.msg, /same angle/);
  });

  test('duplicates are free ("already used"), ∠XFY = ∠YFX collapse, progress is kind almost', () => {
    const m = F1A();
    const r = gradePairs(part('supplementary', 3), [['∠AFC', '∠CFD'], ['∠CFD', '∠AFC'], ['DFC', 'angle cfa']], m);
    assert.equal(r.ok, false); assert.equal(r.kind, 'almost'); assert.equal(r.valid, 1);
    assert.ok(Math.abs(r.credit - 1 / 3) < 1e-12);
    assert.equal(r.results[1].dup, true); assert.equal(r.results[1].kind, 'almost'); assert.match(r.results[1].msg, /already used/);
    assert.equal(r.results[2].dup, true);
    assert.deepEqual(r.normalized, ['∠AFC + ∠CFD']);
    const wrongTwice = gradePairs(part('supplementary', 3), [['∠BFC', '∠CFD'], ['∠CFD', '∠BFC']], m);
    assert.equal(wrongTwice.results[1].dup, true); assert.match(wrongTwice.results[1].msg, /already tried/);
    assert.equal(wrongTwice.kind, 'almost');                             // a repeat never charges again
    const two = gradePairs(part('supplementary', 3), [['∠AFC', '∠CFD'], ['∠AFE', '∠EFD']], m);
    assert.equal(two.kind, 'almost'); assert.match(two.msg, /2 of 3/);
    const none = gradePairs(part('supplementary', 3), [], m);
    assert.equal(none.kind, 'malformed'); assert.equal(none.credit, 0);
    const single = gradePairs(part('vertical', 1), ['∠AFE', '∠CFD'], m);  // one flat pair is accepted too
    assert.equal(single.ok, true);
  });

  test('grade(part, raw, ctx) resolves the figure from a card figure spec, a raw figure or a model', () => {
    const p = part('linearPair', 1);
    assert.equal(grade(p, [['∠GFC', '∠CFD']], { figure: { id: 'F1', rename: { A: 'G' } } }).ok, true);
    assert.equal(grade(p, [['∠GFC', '∠CFD']], { figure: { id: 'F1G', rename: { A: 'G' } } }).ok, true);
    assert.equal(grade(p, [['∠AFC', '∠CFD']], { figure: F1 }).ok, true);
    assert.equal(grade(p, [['∠AFC', '∠CFD']], { model: F1A() }).ok, true);
    assert.equal(grade({ ...p, figure: { id: 'F1' } }, [['∠AFC', '∠CFD']]).ok, true);
    assert.equal(resolveModel(p, { figure: { id: 'F1', rename: { A: 'G' } } }), resolveModel(p, { figure: { id: 'F1', rename: { A: 'G' } } }));   // memoised
    assert.throws(() => grade(p, [['∠AFC', '∠CFD']], {}), /no figure/);
    assert.throws(() => gradePairs({ type: 'pairs', relation: 'bogus', count: 1 }, [], F1A()), /relation/);
    const d7 = grade(part('vertical', 1), [['UL', 'LR']], { figure: { id: 'D7' } });
    assert.equal(d7.ok, true); assert.match(d7.msg, /upper-left angle and lower-right angle are vertical/);
  });
});

// ------------------------------------------------------------------------------------------------
describe('svg renderer', () => {
  const CASES = [
    ['F1G', F1, { rename: { A: 'G' } }],
    ['F1A', F1, { labels: [{ angle: ['B', 'C'], text: '−x + 84' }, { angle: ['A', 'E'], text: '2x² − 4x + 3' }] }],
    ['F1 cls-01', F1, { labels: [{ angle: ['C', 'D'], text: '31°' }] }],
    ['F1 cls-03', F1, { labels: [{ angle: ['B', 'E'], text: '121°' }] }],
    ['F2', F2, {}],
    ['F2 ticks', F2, { ticks: F2_TICKS }],
    ['D5', D5, {}],
    ['D7', D7, {}],
    ['AH', AH, { labels: [{ angle: ['M', 'H'], text: 'x² + 3' }, { angle: ['H', 'C'], text: '11 − 7x' }] }],
    ['F1 variant', F1, { rotate: 30, mirror: true, rename: { A: 'K', B: 'M', C: 'P', D: 'R', E: 'S', F: 'T' }, labels: [{ angle: ['M', 'P'], text: '3x + 10' }, { angle: ['K', 'S'], text: 'x² − 5x + 2' }] }],
    ['F1 variant 2', F1, { rotate: 195, labels: [{ angle: ['B', 'C'], text: '5x − 7' }, { angle: ['C', 'D'], text: '2x + 11' }] }],
  ];

  test('every case lints clean at 375 px: no clipped labels, no label on a stroke, no overlaps, wedges ≥ 44 px', () => {
    for (const [name, fig, opts] of CASES) {
      const m = resolve(fig, opts);
      assert.deepEqual(validate(m), [], name);
      assert.deepEqual(lint(m, { widthPx: 343 }), [], name);
      const L = layout(m);
      for (const e of L.exprLabels) assert.equal(e.fits, true, `${name}: ${e.text}`);
    }
  });

  test('wedges: one <path role="button" tabindex="0" aria-label="angle CFG"> per angle, composite angles included', () => {
    const svg = render(F1, { rename: { A: 'G' } });
    assert.equal((svg.match(/class="fig-wedge"/g) || []).length, 8);
    assert.equal((svg.match(/role="button"/g) || []).length, 8);
    // canonical names (outer letters sorted) — the same spelling data-name and the side list use
    for (const n of ['CFG', 'CFD', 'BFC', 'BFG', 'EFG', 'DFE', 'BFD', 'BFE']) assert.match(svg, new RegExp(`<path class="fig-wedge-hit" role="button" tabindex="0" aria-label="angle ${n}"`), n);
    assert.match(svg, /data-angle="C-G"/);
    assert.match(svg, /aria-pressed="false"/);
    assert.match(svg, /<marker id="fig-F1-arrow"/);
    assert.match(svg, /marker-start="url\(#fig-F1-arrow\)" marker-end="url\(#fig-F1-arrow\)"/);     // lines: both ends
    assert.match(svg, /class="fig-ray" data-names="B"[^>]*marker-end/);                             // ray FB: one end
    assert.match(svg, /class="fig-mark" data-names="BG"/);
    assert.match(svg, /<circle class="fig-pt-dot" data-point="G"/);
    assert.match(svg, /<circle class="fig-pt-hit" data-point="F" [^>]*r="12"/);
    assert.match(svg, /<text class="fig-label fig-pt" data-point="G"[^>]*>G<\/text>/);
    assert.doesNotMatch(svg, />A</);
    assert.doesNotMatch(svg, /Not to scale/);
    assert.match(svg, /viewBox="0 0 400 260"/);
    assert.match(svg, /aria-label="Figure: line GD and line EC meet at F; ray FB; right angle BFG"/);
  });

  test('"Not to scale" chip, ticks, expression labels, aliases, poly wedges off by default', () => {
    assert.match(render(F1, { labels: [{ angle: ['B', 'C'], text: '−x + 84' }] }), /Not to scale/);
    assert.match(render(F1, { labels: [{ angle: ['B', 'C'], text: '−x + 84' }] }), /<text class="fig-label fig-expr" data-angle="B-C" data-name="BFC"[^>]*>−x \+ 84<\/text>/);
    assert.doesNotMatch(render(F2, {}), /fig-tick/);
    assert.equal((render(F2, { ticks: F2_TICKS }).match(/class="fig-tick"/g) || []).length, 6);      // 1+1 and 2+2 marks
    assert.doesNotMatch(render(F2, {}), /fig-wedge/);
    assert.equal((render(F2, { wedges: true }).match(/class="fig-wedge"/g) || []).length, 7);
    const d7 = render(D7, {});
    assert.match(d7, /aria-label="upper-left angle" aria-pressed="false" data-angle="L-Q" data-name="LPQ" data-alias="UL"/);
    assert.doesNotMatch(d7, /fig-pt-dot/);                                // no dots printed
    assert.doesNotMatch(d7, /marker-end/);                                // no arrowheads printed
    assert.doesNotMatch(d7, /class="fig-label fig-pt"/);                  // letters hidden
    assert.doesNotMatch(render(D5, {}), /fig-pt-dot/);
    assert.match(render(D5, {}), /marker-end/);
    assert.equal((render(D5, {}).match(/class="fig-arc"/g) || []).length, 2);
    assert.equal((render(AH, {}).match(/class="fig-arc"/g) || []).length, 0);
  });

  test('nested arcs 22 + 10k: the two halves of a bisected angle never share a radius', () => {
    const L = layout(resolve(D5, {}));
    assert.deepEqual(L.arcs.map(a => a.r).sort((a, b) => a - b), [22, 32]);
    const both = layout(resolve(F1, { labels: [{ angle: ['B', 'C'], text: 'a' }, { angle: ['B', 'D'], text: 'b' }, { angle: ['C', 'D'], text: 'c' }] }));
    assert.deepEqual(both.arcs.map(a => a.r).sort((a, b) => a - b), [22, 32, 42]);
  });

  test('memoised by (id, rename, labels, …): identical inputs return the identical string', () => {
    clearCache();
    const a = render(F1, { rename: { A: 'G' } }), b = render(F1, { rename: { A: 'G' } });
    assert.equal(a, b); assert.ok(Object.is(a, b));
    assert.notEqual(render(F1, {}), a);
    assert.equal(renderModel(resolve(F1, { rename: { A: 'G' } })), a);
  });

  test('the ang-10 label sits below AD left of F and the A letter flips above, as the sheet prints it', () => {
    const L = layout(resolve(F1, { labels: [{ angle: ['B', 'C'], text: '−x + 84' }, { angle: ['A', 'E'], text: '2x² − 4x + 3' }] }));
    const q = L.exprLabels.find(e => e.text.startsWith('2x²'));
    assert.ok(q.y > 150 && q.x < 200 && q.box.x0 >= 6, JSON.stringify(q.box));
    const a = L.pointLabels.find(p => p.n === 'A');
    assert.ok(a.flipped && a.y < 150);
    const g = layout(resolve(F1, { rename: { A: 'G' } })).pointLabels.find(p => p.n === 'G');
    assert.ok(!g.flipped && g.y > 150);                                    // warm-up: G below its dot
    assert.equal(VIEW.w, 400); assert.equal(VIEW.h, 260);
  });
});
