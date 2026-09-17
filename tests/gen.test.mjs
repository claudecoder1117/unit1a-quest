// gen.test.mjs — the Variant generator harness (COMPOSED S6 test list: "5 000 seeds per
// template: invariants, determinism (`gen(s)` deep-equals `gen(s)`), answer round-trips
// through its grader, no NaN"; S2 "Generator contract"; S8 #7a/#7b/#7c).
//
// The harness below is shared by every generator ticket. A ticket appends ONE block at
// the bottom — `/* === T07x === */ … /* === /T07x === */` — calling `harness(id, …)`
// once per template it owns, plus whatever template-specific assertions it wants.
//
// What `harness(id)` checks, for `SEEDS` seeds (default 5 000; `GEN_SEEDS=200 node --test`
// to iterate faster while developing):
//   · the item shape (id / template / params / stem / parts / hints[3] / solution[] / misconceptions[])
//   · no `NaN`, `undefined`, `null` or `[object Object]` anywhere in a student-visible string
//   · every misconception tag exists in data/misconceptions.js (T06g catalogue)
//   · the figure (when there is one) resolves, `validate()`s clean and `lint()`s clean at 343 px
//     (= a 375 px phone with the standard 16 px gutters) — no clipped label, no sub-44 px wedge
//   · EVERY part round-trips: the item's own answer, fed back through `js/grader/index.js`,
//     grades `correct` with credit 1 — a fixture and a Variant graded by identical code (S3)
//   · determinism: a second `generate(id, seed)` is deep-equal to the first
//   · an optional per-template `invariant(item)` callback
//
// Zero dependencies, DOM-free: the generators, the figure model, the SVG layout and every
// grader import as plain ES modules under Node.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { templateIds, getTemplate, generate, modelOf, templatesFor, templatesForCard, templatesForModule, tagFor } from '../site/data/templates.js';
import { grade, ready } from '../site/js/grader/index.js';
import { validate as validateFigure } from '../site/js/figure/model.js';
import { lint } from '../site/js/figure/svg.js';
import { isKnownTag } from '../site/data/misconceptions.js';

await ready;                                     // the lazily-imported graders (pairs, strip, …)

/** Seeds per template. 5 000 is the spec; override while iterating with GEN_SEEDS=200. */
export const SEEDS = Math.max(1, Number(process.env.GEN_SEEDS) || 5000);

/** The seed strings the harness walks (stable, so a failure is always reproducible). */
export function seedKeys(n = SEEDS) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = `s${i}`;
  return out;
}

// ---------------------------------------------------------------------------------------------
// the item's own answer, in the shape each widget submits
// ---------------------------------------------------------------------------------------------

function slotAnswer(slot) {
  switch (slot.type) {
    case 'multi': return Object.fromEntries((slot.fields ?? []).map((f) => [f.key, f.answer]));
    case 'chips': return (slot.chips ?? []).filter((c) => c.role === 'required').map((c) => c.text);
    default: return slot.answer;
  }
}

/**
 * answerFor(part) — the correct submission for one part, built from the part itself
 * (never from a private field of the generator), so the round-trip really does test the
 * data the app will hand the grader.
 */
export function answerFor(part) {
  switch (part.type) {
    case 'equation':
      return Array.isArray(part.system)
        ? part.system.map((f) => `${f} = 0`).join(', ')
        : `${part.canonical} = 0`;
    case 'num': return Array.isArray(part.answer) ? part.answer[0] : part.answer;
    case 'multi': return Object.fromEntries((part.fields ?? []).map((f) => [f.key, f.answer]));
    case 'roots': return part.answer.join(', ');
    case 'reject': return { keep: part.valid ?? [], reject: part.rejected ?? [], reason: part.reasonKey };
    case 'cases': return part.rows;
    case 'pairs': return part.answer;
    case 'strip': return Object.fromEntries((part.slots ?? []).map((s) => [s.id, slotAnswer(s)]));
    case 'ratio': return part.answer;
    case 'factored': return Array.isArray(part.answer) ? part.answer[0] : part.answer;
    default: return part.answer ?? null;
  }
}

/** gradeItem(item) → [{ id, type, ok, kind, credit, msg }] — every part through the real dispatcher. */
export function gradeItem(item) {
  const model = item.figure ? modelOf(item) : null;
  return (item.parts ?? []).map((part) => {
    const ctx = {
      state: {},
      model, figure: model,
      card: item,
      misconceptions: (item.misconceptions ?? []).filter((m) => !m.part || m.part === part.id),
    };
    const r = grade(part, answerFor(part), ctx);
    return { id: part.id, type: part.type, ok: r.ok, kind: r.kind, credit: r.credit, msg: r.msg };
  });
}

// ---------------------------------------------------------------------------------------------
// shape + hygiene
// ---------------------------------------------------------------------------------------------

const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b/;

/** Every string reachable from `value` (strings inside arrays/objects included). */
function walkStrings(value, out = [], depth = 0) {
  if (depth > 12 || value == null) return out;
  if (typeof value === 'string') { out.push(value); return out; }
  if (Array.isArray(value)) { for (const v of value) walkStrings(v, out, depth + 1); return out; }
  if (typeof value === 'object') { for (const v of Object.values(value)) walkStrings(v, out, depth + 1); return out; }
  return out;
}

/** checkShape(item, id) — throws (via assert) on anything a card screen could not render. */
export function checkShape(item, id) {
  const where = `${id} (${item && item.id})`;
  assert.ok(item && typeof item === 'object', `${where}: no item`);
  assert.equal(item.template, id, `${where}: template mismatch`);
  assert.match(item.id, /^T-[\w-]+#[0-9a-f]{6}$/, `${where}: id must be T-<template>#<seed>`);
  assert.ok(Number.isInteger(item.templateVersion) && item.templateVersion >= 1, `${where}: templateVersion`);
  assert.ok(item.params && typeof item.params === 'object', `${where}: params`);
  assert.ok(typeof item.stem === 'string' && item.stem.trim().length > 10, `${where}: stem`);
  assert.equal(item.prompt, item.stem, `${where}: prompt mirrors stem`);
  assert.ok(Array.isArray(item.parts) && item.parts.length >= 1, `${where}: parts`);
  for (const p of item.parts) {
    assert.ok(typeof p.id === 'string' && p.id, `${where}: a part has no id`);
    assert.ok(typeof p.type === 'string' && p.type, `${where}: part ${p.id} has no type`);
  }
  assert.ok(Array.isArray(item.hints) && item.hints.length === 3, `${where}: hints[3]`);
  for (const h of item.hints) assert.ok(typeof h === 'string' && h.length > 20, `${where}: a hint is empty`);
  assert.ok(Array.isArray(item.solution) && item.solution.length >= 2, `${where}: solution[]`);
  for (const s of item.solution) {
    assert.ok(typeof s.say === 'string' && s.say.length > 4, `${where}: a solution step has no say`);
    assert.ok(typeof s.math === 'string' && s.math.length > 0, `${where}: a solution step has no math`);
  }
  assert.ok(Array.isArray(item.misconceptions), `${where}: misconceptions[]`);
  for (const m of item.misconceptions) {
    assert.ok(isKnownTag(m.tag), `${where}: misconception tag "${m.tag}" is not in data/misconceptions.js`);
    assert.ok(typeof m.msg === 'string' && m.msg.length > 10, `${where}: misconception ${m.tag} has no msg`);
  }
  assert.ok(Array.isArray(item.skills), `${where}: skills[]`);
  assert.ok(Number.isInteger(item.tier) && item.tier >= 1 && item.tier <= 4, `${where}: tier`);

  // nothing a student could read may contain a stringified nothing
  for (const key of ['stem', 'note']) {
    if (item[key] != null) assert.ok(!BAD_TEXT.test(item[key]), `${where}: "${item[key]}" in ${key}`);
  }
  for (const s of walkStrings([item.hints, item.solution, item.parts, item.misconceptions, item.figure?.labels])) {
    assert.ok(!BAD_TEXT.test(s), `${where}: bad text "${s}"`);
  }
}

/** checkFigure(item, id) — the figure resolves, validates and lints clean at phone width. */
export function checkFigure(item, id) {
  if (!item.figure) return null;
  const where = `${id} (${item.id})`;
  assert.ok(item.figure.spec && (item.figure.spec.kind === 'fan' || item.figure.spec.kind === 'poly'),
    `${where}: figure.spec must be a fan or poly`);
  const model = modelOf(item);
  assert.deepEqual(validateFigure(model), [], `${where}: figure validate()`);
  assert.deepEqual(lint(model, { widthPx: 343 }), [], `${where}: figure lint() at 343 px`);
  return model;
}

// ---------------------------------------------------------------------------------------------
// the harness
// ---------------------------------------------------------------------------------------------

/**
 * harness(id, opts) — registers the standard test block for one template.
 * @param {string} id
 * @param {{seeds?:number, invariant?:(item:object, model:object|null)=>void}} [opts]
 */
export function harness(id, opts = {}) {
  const seeds = opts.seeds ?? SEEDS;
  const def = getTemplate(id);

  describe(`${id} — ${seeds} seeds`, () => {
    test('registered', () => {
      assert.ok(def, `${id} is not in data/templates.js`);
      assert.equal(typeof def.gen, 'function');
    });

    test('shape, figure, invariants and no NaN', () => {
      for (const key of seedKeys(seeds)) {
        const item = generate(id, key);
        checkShape(item, id);
        const model = checkFigure(item, id);
        if (opts.invariant) opts.invariant(item, model);
      }
    });

    test('every part round-trips through its own grader', () => {
      for (const key of seedKeys(seeds)) {
        const item = generate(id, key);
        for (const r of gradeItem(item)) {
          assert.ok(r.ok, `${id}#${key} part ${r.id} (${r.type}) graded ${r.kind}: ${r.msg}`);
          assert.equal(r.credit, 1, `${id}#${key} part ${r.id} credit ${r.credit}`);
        }
      }
    });

    test('deterministic: the same seed rebuilds the same item', () => {
      for (const key of seedKeys(seeds)) {
        assert.deepEqual(generate(id, key), generate(id, key), `${id}#${key} is not deterministic`);
      }
    });
  });
}

// ---------------------------------------------------------------------------------------------
// registry-wide checks (every ticket's templates, whatever is registered)
// ---------------------------------------------------------------------------------------------

describe('template registry', () => {
  test('ids are unique, well-formed and carry a generator', () => {
    const ids = templateIds();
    assert.equal(new Set(ids).size, ids.length, 'duplicate template id');
    for (const id of ids) {
      assert.match(id, /^T-[a-z0-9-]+$/i, `${id}: template ids look like T-<name>`);
      const def = getTemplate(id);
      assert.equal(typeof def.gen, 'function', `${id}: no gen()`);
      assert.ok(Number.isInteger(def.version) && def.version >= 1, `${id}: version`);
    }
  });

  test('an unknown id throws rather than returning junk', () => {
    assert.throws(() => generate('T-does-not-exist', 'x'), /unknown template/);
  });

  test('the seed tag is the S3 rule and shows in the item id', () => {
    const item = generate(templateIds()[0], 'a91f2c');
    assert.ok(item.id.endsWith(`#${item.seedTag}`));
    assert.equal(item.seed, 'a91f2c');
    assert.equal(item.seedKey, `${item.template}|a91f2c`);
  });
});

/* === T07b === */
// Figure generators: T-fig-xlines-L/Q · T-fig-system · T-fig-bisect-L/Q · T-seg-mid · T-fig-pairs.
// Spec: COMPOSED S2 "§7 diagram variants" + the per-template bullet list, S8 #7b.

import { angles, pairs as validPairs, isPair, accidentalSums, GENERIC_ANGLE_SET } from '../site/js/figure/model.js';

/** every measure a case claims must be a positive half-integer under 180 (S2 invariant) */
function assertMeasure(text, where) {
  const v = Number(String(text).replace(/−/g, '-'));
  assert.ok(Number.isFinite(v), `${where}: "${text}" is not a number`);
  assert.ok(v > 0 && v < 180, `${where}: measure ${v} is outside (0, 180)`);
  assert.ok(Math.abs(v * 2 - Math.round(v * 2)) < 1e-9, `${where}: measure ${v} is not an integer or .5`);
}

const T07B_SEEDS = Math.max(1, Number(process.env.GEN_SEEDS) || 5000);

harness('T-fig-xlines-L', {
  seeds: T07B_SEEDS,
  invariant(item) {
    const where = item.id;
    assert.ok(['right', 'linearpair', 'vertical'].includes(item.params.frame), `${where}: frame`);
    assert.equal(item.params.roots.length, 1, `${where}: the linear variant has one root`);
    const multi = item.parts.find((p) => p.id === 'all');
    assert.ok(multi && multi.type === 'multi', `${where}: the linear variant asks x and two measures`);
    assert.equal(multi.fields.length, 3);
    for (const f of multi.fields.slice(1)) assertMeasure(f.answer, `${where} ${f.key}`);
    const setup = item.parts.find((p) => p.type === 'equation');
    assert.ok(setup.optional, `${where}: the setup slot is skippable on Cards`);
    assert.ok(setup.mustMention.length >= 1, `${where}: a linear setup needs a structural guard`);
  },
});

harness('T-fig-xlines-Q', {
  seeds: T07B_SEEDS,
  invariant(item) {
    const where = item.id;
    const roots = item.parts.find((p) => p.type === 'roots');
    assert.equal(roots.answer.length, 2, `${where}: two roots`);
    assert.notEqual(roots.answer[0], roots.answer[1], `${where}: distinct roots`);
    for (const r of roots.answer) assert.match(r, /^-?\d+(\/2)?$/, `${where}: root "${r}" is an integer or a half`);
    const rej = item.parts.find((p) => p.type === 'reject');
    assert.ok(rej, `${where}: the reject stage is always offered`);
    assert.equal(rej.valid.length + rej.rejected.length, 2, `${where}: every root gets a verdict`);
    assert.ok(rej.distractors.length >= 3, `${where}: three reason distractors`);
    const cases = item.parts.find((p) => p.type === 'cases');
    if (cases) {
      assert.equal(cases.rows.length, rej.valid.length);
      for (const row of cases.rows) {
        for (const [k, v] of Object.entries(row)) if (k !== 'x') assertMeasure(v, `${where} ${k}`);
      }
    } else {
      assert.equal(rej.valid.length, 1, `${where}: only a single surviving root replaces the cases tab`);
    }
    assert.deepEqual(item.needs, ['QUAD-SOLVE']);
  },
});

harness('T-fig-system', {
  seeds: T07B_SEEDS,
  invariant(item) {
    const where = item.id;
    const { x, y, measures } = item.params;
    assert.ok(Number.isInteger(x) && x >= -12 && x <= 12, `${where}: x ∈ [−12, 12]`);
    assert.ok(Number.isInteger(y) && y >= -12 && y <= 12, `${where}: y ∈ [−12, 12]`);
    for (const k of ['UL', 'UR', 'LR', 'LL']) assertMeasure(measures[k], `${where} ${k}`);
    assert.equal(measures.UL, measures.LR, `${where}: the vertical pair is congruent`);
    assert.equal(measures.UR, measures.LL, `${where}: the other vertical pair is congruent`);
    assert.equal(measures.UL + measures.UR, 180, `${where}: neighbours are supplementary`);
    const setup = item.parts.find((p) => p.type === 'equation');
    assert.equal(setup.system.length, 2, `${where}: two equations`);
    assert.ok(setup.vars.includes('x') && setup.vars.includes('y'));
    // the two equations are independent (det ≠ 0): solving them must pin (x, y) down
    assert.ok(Object.keys(item.params.labels).length === 3, `${where}: exactly three labelled angles`);
  },
});

harness('T-fig-bisect-L', {
  seeds: T07B_SEEDS,
  invariant(item) {
    const where = item.id;
    const [h1, h2] = item.params.halves;
    assertMeasure(h1, `${where} half A`);
    assertMeasure(h2, `${where} half B`);
    assert.ok(item.params.whole < 180 && item.params.whole === h1 + h2, `${where}: the halves fill the whole`);
    if (item.params.verdict === 'YES') assert.equal(h1, h2, `${where}: a YES has congruent halves`);
    else assert.ok(Math.abs(h1 - h2) >= 4, `${where}: a NO differs by at least 4°`);
    const strip = item.parts.find((p) => p.type === 'strip');
    assert.ok(strip, `${where}: the L variant is one Proof Strip`);
    assert.deepEqual(strip.slots.map((s) => s.type), ['pick', 'num', 'multi', 'verdict', 'chips']);
    const chips = strip.slots[4].chips;
    assert.equal(chips.filter((c) => c.role === 'required').length, 1, `${where}: exactly one required chip`);
    assert.ok(chips.some((c) => c.role === 'forbidden'), `${where}: at least one forbidden chip`);
  },
});

harness('T-fig-bisect-Q', {
  seeds: T07B_SEEDS,
  invariant(item) {
    const where = item.id;
    const [r1, r2] = item.params.roots;
    assert.ok(Number.isInteger(r1) && Number.isInteger(r2) && r1 !== r2, `${where}: two distinct integer roots`);
    const cases = item.parts.find((p) => p.type === 'cases');
    assert.equal(cases.rows.length, 2, `${where}: one case per root`);
    assert.ok(cases.cols.some((c) => c.type === 'verdict'), `${where}: a YES/NO column`);
    for (const row of cases.rows) {
      for (const [k, v] of Object.entries(row)) {
        if (k === 'x' || k === 'verdict') continue;
        assertMeasure(v, `${where} ${k}`);
      }
      assert.ok(row.verdict === 'YES' || row.verdict === 'NO');
    }
    item.params.halves.forEach(([a, b], i) => {
      const yes = cases.rows[i].verdict === 'YES';
      if (yes) assert.equal(a, b, `${where}: a YES case has congruent halves`);
      else assert.ok(Math.abs(a - b) >= 4, `${where}: a NO case differs by at least 4°`);
      assert.ok(a + b < 180, `${where}: the whole angle stays under 180°`);
    });
    const strip = item.parts.find((p) => p.type === 'strip');
    assert.deepEqual(strip.slots.map((s) => s.type), ['chips', 'chips', 'pick']);
  },
});

harness('T-seg-mid', {
  seeds: T07B_SEEDS,
  invariant(item) {
    const where = item.id;
    const { roots, half, n, k, base, perimeter } = item.params;
    assert.equal(roots.length, 2, `${where}: two roots`);
    assert.ok(roots.filter((r) => r > 0).length === 1, `${where}: exactly one positive root`);
    assert.ok(half > 0 && n > 0 && base > 0, `${where}: every length positive`);
    assert.equal(n + k, half, `${where}: the n label evaluates to the half-leg`);
    assert.equal(perimeter, 4 * half + base, `${where}: perimeter = four halves + the base`);
    const rej = item.parts.find((p) => p.type === 'reject');
    assert.equal(rej.reasonKey, 'negative-length', `${where}: the rejected root makes a length negative`);
    assert.deepEqual(rej.valid, [String(roots[0])]);
    assert.deepEqual(rej.rejected, [String(roots[1])]);
    assert.equal(item.figure.spec.kind, 'poly', `${where}: the midpoint figure is a polygon`);
  },
});

harness('T-fig-pairs', {
  seeds: T07B_SEEDS,
  invariant(item, model) {
    const where = item.id;
    const part = item.parts[0];
    assert.equal(part.type, 'pairs');
    assert.ok(part.count >= 1 && part.answer.length === part.count, `${where}: one answer per requested pair`);
    // the enumeration gate: no 90°/180° sum the structure does not justify (S2)
    assert.deepEqual(accidentalSums(model), [], `${where}: accidental sums`);
    // every emitted pair really holds, and the answer is a subset of the full valid set
    const all = validPairs(model, part.relation).map((p) => p.join('|'));
    for (const [a, b] of part.answer) {
      assert.ok(isPair(model, a, b, part.relation), `${where}: ${a} + ${b} is not ${part.relation}`);
      assert.ok(all.includes([a, b].join('|')), `${where}: ${a} + ${b} missing from pairs()`);
    }
    // letters: shuffled, never I or O
    for (const l of item.params.letters) assert.ok(/^[A-HJ-NP-Z]$/.test(l), `${where}: letter ${l}`);
    // drawn measures come from the generic set (or are the 90° / supplementary partners of one)
    const atomic = angles(model).filter((a) => a.atomic).map((a) => a.deg);
    for (const d of atomic) {
      assert.ok(d > 0 && d < 180, `${where}: atomic measure ${d}`);
      assert.ok(
        GENERIC_ANGLE_SET.includes(d) || d === 90 || GENERIC_ANGLE_SET.includes(180 - d) || d === 180 - 90
          || GENERIC_ANGLE_SET.some((g) => d === 90 - g) || GENERIC_ANGLE_SET.some((g) => GENERIC_ANGLE_SET.some((h) => d === 180 - g - h)),
        `${where}: atomic measure ${d} is not built from the generic set`,
      );
    }
    assert.ok(item.params.rotate % 15 === 0, `${where}: rotation is a multiple of 15°`);
  },
});

describe('T07b — shared expectations', () => {
  const IDS = ['T-fig-xlines-L', 'T-fig-xlines-Q', 'T-fig-system', 'T-fig-bisect-L', 'T-fig-bisect-Q', 'T-seg-mid', 'T-fig-pairs'];

  test('all seven templates are registered and point at the original they vary', () => {
    for (const id of IDS) {
      const def = getTemplate(id);
      assert.ok(def, `${id} missing from data/templates.js`);
      assert.ok(def.forCard, `${id}: forCard`);
    }
    // (other tickets may add more templates for the same originals — these are the T07b ones)
    assert.ok(templatesFor('ang-10').some((t) => t.id === 'T-fig-xlines-Q'));
    assert.ok(templatesFor('ang-04').some((t) => t.id === 'T-seg-mid'));
    assert.ok(templatesFor('ang-05').some((t) => t.id === 'T-fig-bisect-Q'));
    assert.ok(templatesFor('doc-05').some((t) => t.id === 'T-fig-bisect-L'));
  });

  test('every figure Variant carries a self-contained figure spec (nothing from data/figures.js)', () => {
    for (const id of IDS) {
      const item = generate(id, 'shape');
      assert.ok(item.figure && item.figure.spec, `${id}: no figure spec`);
      assert.match(item.figure.id, /^G-/, `${id}: generated figure ids are prefixed G-`);
      assert.equal(item.figure.spec.id, item.figure.id);
    }
  });

  test('both-valid and one-invalid both occur for T-fig-xlines-Q (the rejection is never automatic)', () => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      const item = generate('T-fig-xlines-Q', `c${i}`);
      seen.add(item.parts.find((p) => p.type === 'reject').rejected.length === 0 ? 'both' : 'one');
      if (seen.size === 2) break;
    }
    assert.deepEqual([...seen].sort(), ['both', 'one']);
  });

  test('T-fig-bisect-Q reaches yes/yes, yes/no and no/no', () => {
    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const item = generate('T-fig-bisect-Q', `c${i}`);
      const v = item.parts.find((p) => p.type === 'cases').rows.map((r) => r.verdict).join('');
      seen.add(v === 'NOYES' ? 'YESNO' : v);
      if (seen.size === 3) break;
    }
    assert.deepEqual([...seen].sort(), ['NONO', 'YESNO', 'YESYES']);
  });

  test('T-fig-bisect-L reaches both verdicts', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(generate('T-fig-bisect-L', `c${i}`).params.verdict);
    assert.deepEqual([...seen].sort(), ['NO', 'YES']);
  });

  test('T-fig-pairs asks every relation the warm-up asks, on all three fan shapes', () => {
    const rel = new Set();
    const shape = new Set();
    for (let i = 0; i < 600; i++) {
      const item = generate('T-fig-pairs', `c${i}`);
      rel.add(item.params.relation);
      shape.add(item.params.shape);
    }
    for (const r of ['supplementary', 'complementary', 'vertical', 'linearPair', 'adjacent', 'nonAdjacent']) {
      assert.ok(rel.has(r), `T-fig-pairs never asked for ${r}`);
    }
    assert.deepEqual([...shape].sort(), ['lines', 'perp', 'ray']);
  });

  test('T-fig-xlines-Q uses every frame and sometimes prints an unsimplified label', () => {
    const frames = new Set();
    let scrambled = 0;
    for (let i = 0; i < 300; i++) {
      const item = generate('T-fig-xlines-Q', `f${i}`);
      frames.add(item.params.frame);
      // a label that does not open with its highest power was written unsimplified
      if (item.figure.labels.some((l) => /^\s*\d+\s*[+−-]/.test(l.text))) scrambled++;
    }
    assert.deepEqual([...frames].sort(), ['linearpair', 'right', 'vertical']);
    assert.ok(scrambled > 0, 'no unsimplified label was ever printed');
  });

  test('a frozen seed replays byte-identical after a reload of the module graph', async () => {
    const before = generate('T-seg-mid', 'frozen-1');
    const mod = await import('../site/data/templates.js');
    const after = mod.generate('T-seg-mid', 'frozen-1');
    assert.deepEqual(after, before);
    assert.equal(after.templateVersion, before.templateVersion);
  });
});
/* === /T07b === */

/* === T07c === */
// Algebra + M1 generators: T-factor-a1/a2/gcf/neg · T-quad-solve · T-quad-ctx · T-sys ·
// T-notation · T-vocab · T-classify.  Spec: COMPOSED S2 "Generator contract" bullets, S8 #7c.
//
// The block is self-contained (its own helpers, `t07c*`-prefixed so it never collides with the
// shared harness above) because the registry API changed twice during the parallel build; it talks
// to `site/data/templates.js` through `generate(id, seed, params)` / `getTemplate(id)` only.
//
// Named acceptance checks (S8 #7c):
//   · no prime trinomials ever        — poly.js's `isReducible` re-decides for every emitted target
//   · det ≠ 0                         — every T-sys system, plus Cramer agreeing with the answer key
//   · `ray AB ≠ ray BA` traps present — T-notation ray items; the reversed build is wrong/ray-order
//   · typed coefficient vectors grade identically to string fixtures
//   · T-quad-ctx keep/reject stories  — every frame and reason reachable, both-valid a coin flip

import { MISCONCEPTIONS as T07C_TAGS } from '../site/data/misconceptions.js';
import { SKILL_IDS as T07C_SKILL_IDS } from '../site/data/skills.js';
import {
  polyFromDescending as t07cPolyDesc,
  isReducible as t07cIsReducible,
  polyPrimitive as t07cPrimitive,
  polyDegree as t07cDegree,
} from '../site/js/grader/poly.js';

/** Seeds per template for this block. S6 says 5 000; `GEN_SEEDS=5000 node --test tests/` runs it. */
const T07C_SEEDS = Math.max(1, Number(process.env.GEN_SEEDS) || 600);

const T07C_FACTOR_IDS = ['T-factor-a1', 'T-factor-a2', 'T-factor-gcf', 'T-factor-neg'];
const T07C_IDS = [...T07C_FACTOR_IDS, 'T-quad-solve', 'T-quad-ctx', 'T-sys', 'T-notation', 'T-vocab', 'T-classify'];

/** Stable, reproducible seed strings — no Math.random in the tests either. */
function t07cSeeds(n = T07C_SEEDS, prefix = 's') {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = `${prefix}${i}`;
  return out;
}

/** Deep structural equality via a stable JSON encoding. */
function t07cStable(v) {
  return JSON.stringify(v, (k, val) => (typeof val === 'function' ? '[fn]' : val));
}

const T07C_BAD = /\b(NaN|undefined|null|Infinity|\[object Object\])\b/;

/** Every string the student can actually see. */
function t07cVisible(item) {
  const out = [String(item.prompt ?? ''), String(item.stem ?? ''), String(item.answer ?? '')];
  for (const h of item.hints ?? []) out.push(String(h));
  for (const s of item.solution ?? []) out.push(String(s.say ?? ''), String(s.math ?? ''));
  for (const m of item.misconceptions ?? []) out.push(String(m.msg ?? ''));
  for (const p of item.parts ?? []) {
    out.push(String(p.prompt ?? ''), String(p.label ?? ''));
    for (const f of p.fields ?? []) out.push(String(f.label ?? ''));
    for (const c of p.cols ?? []) out.push(String(c.label ?? ''));
    for (const d of p.distractors ?? []) out.push(typeof d === 'string' ? d : String(d.text ?? ''));
  }
  return out;
}

/** Walk every value and fail on NaN / Infinity / undefined leaves. */
function t07cScan(v, path, errs, depth = 0) {
  if (depth > 12) return;
  if (v === undefined) { errs.push(`${path} is undefined`); return; }
  if (typeof v === 'number' && !Number.isFinite(v)) { errs.push(`${path} is ${v}`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => t07cScan(x, `${path}[${i}]`, errs, depth + 1)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) t07cScan(x, `${path}.${k}`, errs, depth + 1);
}

/** The structural contract every generated item must satisfy (S2 "Generator contract"). */
function t07cCheckItem(item, id) {
  const e = [];
  if (!item || typeof item !== 'object') return ['item is not an object'];
  if (typeof item.id !== 'string' || !item.id.startsWith(`${id}#`)) e.push(`id "${item.id}" is not ${id}#<seed>`);
  if (item.template !== id) e.push(`template is ${item.template}, expected ${id}`);
  if (!Number.isInteger(item.templateVersion) || item.templateVersion < 1) e.push('templateVersion missing');
  if (!item.prompt || !String(item.prompt).trim()) e.push('empty prompt');
  if (item.stem !== item.prompt) e.push('stem must alias prompt');
  if (!Array.isArray(item.parts) || item.parts.length === 0) e.push('no parts');
  if (!Array.isArray(item.hints) || item.hints.length !== 3) e.push(`hints must be 3, got ${item.hints?.length}`);
  if (!Array.isArray(item.solution) || item.solution.length < 2) e.push('solution needs at least 2 steps');
  if (!Array.isArray(item.skills) || item.skills.length === 0) e.push('no skills');
  for (const s of item.skills ?? []) if (!T07C_SKILL_IDS.includes(s)) e.push(`unknown skill ${s}`);
  if (!Number.isInteger(item.tier) || item.tier < 1 || item.tier > 4) e.push(`tier ${item.tier}`);
  if (!Number.isFinite(item.par) || item.par <= 0) e.push(`par ${item.par}`);

  const ids = new Set();
  for (const p of item.parts ?? []) {
    if (!p.id) e.push('part without an id');
    if (ids.has(p.id)) e.push(`duplicate part id ${p.id}`);
    ids.add(p.id);
    if (!p.type) e.push(`part ${p.id} has no type`);
  }
  for (const m of item.misconceptions ?? []) {
    if (m.tag && !Object.prototype.hasOwnProperty.call(T07C_TAGS, m.tag)) e.push(`uncatalogued tag ${m.tag}`);
    if (!m.msg || !String(m.msg).trim()) e.push('misconception without a message');
    if (m.part && !ids.has(m.part)) e.push(`misconception scoped to unknown part ${m.part}`);
  }
  for (const s of item.solution ?? []) {
    if (typeof s.say !== 'string') e.push('solution step without `say`');
    if (s.math !== undefined && typeof s.math !== 'string') e.push('solution step `math` is not a string');
  }
  for (const s of t07cVisible(item)) {
    if (T07C_BAD.test(s)) e.push(`visible text contains a placeholder: ${JSON.stringify(s.slice(0, 90))}`);
  }
  t07cScan({ params: item.params, parts: item.parts }, 'item', e);
  return e;
}

/** The generic sweep: determinism + the structural contract + per-template assertions. */
function t07cSweep(id, each, cfg = {}) {
  assert.ok(getTemplate(id), `template ${id} is not registered in site/data/templates.js`);
  const list = t07cSeeds(cfg.n ?? T07C_SEEDS, cfg.prefix ?? id);
  let checked = 0;
  for (const s of list) {
    const item = generate(id, s, cfg.params);
    const errs = t07cCheckItem(item, id);
    assert.deepEqual(errs, [], `${id} seed ${s}: ${errs.join(' · ')}`);
    if (checked < 60) {                           // deep-equal is the expensive half
      assert.equal(t07cStable(generate(id, s, cfg.params)), t07cStable(item), `${id} seed ${s} is not deterministic`);
      checked++;
    }
    if (each) each(item, s);
  }
  return list.length;
}

/** Grade through the dispatcher with a fresh per-part state (T03: one ctx per part). */
function t07cGrade(part, raw, ctx = {}) {
  return grade(part, raw, { state: {}, ...ctx });
}

/** Every listed part's own answer key must grade `correct`. */
function t07cRoundTrip(item, answers, label) {
  for (const p of item.parts) {
    if (!(p.id in answers)) continue;
    const r = t07cGrade(p, answers[p.id]);
    assert.equal(r.kind, 'correct', `${label} part ${p.id} (${p.type}) graded ${r.kind}: ${r.msg}`);
    assert.equal(r.ok, true, `${label} part ${p.id} not ok`);
  }
}

function t07cGcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }

// ---- registry ------------------------------------------------------------------------------------

test('T07c registry: all ten templates are registered and well formed', () => {
  for (const id of T07C_IDS) {
    const t = getTemplate(id);
    assert.ok(t, `${id} is missing from site/data/templates.js (the T07c block)`);
    assert.equal(typeof t.gen, 'function');
    assert.ok(Number.isInteger(t.version) && t.version >= 1, `${id}: version`);
    assert.ok(t.module, `${id}: no module`);
    assert.ok(Array.isArray(t.skills) && t.skills.length, `${id}: no skills`);
    for (const k of t.skills) assert.ok(T07C_SKILL_IDS.includes(k), `${id}: unknown skill ${k}`);
    assert.ok(Number.isInteger(t.tier) && t.tier >= 1 && t.tier <= 4, `${id}: tier ${t.tier}`);
    assert.ok(Number.isFinite(t.par) && t.par > 0, `${id}: par ${t.par}`);
    assert.ok(templateIds().includes(id), `${id} is missing from templateIds`);   // templateIds() is a function (T07a converged the registry API)
  }
  // the four factoring templates cover M10, and every fac-* original has an Infinite template.
  // (the lookup helpers have returned ids in one draft of the registry and descriptors in another —
  // normalise so this block pins the CONTENT, not the shape T07a settles on)
  const idsOf = (list) => list.map((x) => (typeof x === 'string' ? x : x.id));
  assert.deepEqual(idsOf(templatesForModule('M10')).sort(), T07C_FACTOR_IDS.slice().sort());
  for (const card of ['fac-01', 'fac-08', 'fac-16', 'quad-02', 'not-04', 'cls-01']) {
    assert.ok(templatesForCard(card).length >= 1, `${card} has no Infinite template`);
  }
});

test('T07c registry: (template, seed) is the whole identity; a frozen Variant replays', () => {
  assert.throws(() => generate('T-does-not-exist', 1), /unknown template/);   // the registry throws rather than returning junk (T07a converged the registry API)
  for (const id of T07C_IDS) {
    const a = generate(id, 'frozen');
    const b = generate(id, 'frozen');
    assert.equal(t07cStable(a), t07cStable(b), `${id} is not deterministic`);
    assert.notEqual(t07cStable(a), t07cStable(generate(id, 'frozen2')));
    assert.match(a.id, new RegExp(`^${id}#[0-9a-f]{6}$`));
    assert.equal(a.templateVersion, getTemplate(id).version);
    // S6 `frozen`: (seed, templateVersion) is all the save stores — replaying it is byte-identical.
    // The registry seeds from the seed STRING (`cyrb53('<template>|<seed>')`), so that is what freezes.
    assert.equal(a.seedKey, `${id}|frozen`);
    assert.equal(t07cStable(generate(id, a.seed)), t07cStable(a), `${id} does not replay from its stored seed`);
  }
});

// ---- factoring -------------------------------------------------------------------------------------

for (const id of T07C_FACTOR_IDS) {
  test(`${id}: invariants, NO PRIME TRINOMIALS, answer round-trips`, () => {
    t07cSweep(id, (item, seed) => {
      const p = item.parts[0];
      assert.equal(item.parts.length, 1);
      assert.equal(p.type, 'factored');
      assert.ok(['a', 'b', 'k', 'n', 'p', 'v', 'x'].includes(p.var), `variable ${p.var} is outside the S2 set`);

      const [A, B, C] = p.target;
      assert.equal(p.target.length, 3, `${seed}: target is not a quadratic`);
      for (const k of p.target) assert.ok(Number.isInteger(k) && Math.abs(k) <= 120, `${seed}: coefficient ${k}`);
      assert.notEqual(A, 0); assert.notEqual(B, 0); assert.notEqual(C, 0);

      // *** no prime trinomials, ever *** — poly.js decides, not the generator
      const poly = t07cPolyDesc(p.target);
      assert.equal(t07cDegree(poly), 2, `${seed}: not degree 2`);
      assert.ok(t07cIsReducible(t07cPrimitive(poly)), `${seed}: ${p.target} is PRIME over ℤ`);

      const { c, factors } = p.answerTyped;
      assert.equal(factors.length, 2);
      for (const [a, b] of factors) {
        assert.ok(Number.isInteger(a) && a >= 1, `${seed}: factor lead ${a} must be a positive integer`);
        assert.ok(Number.isInteger(b) && b !== 0 && Math.abs(b) <= 9, `${seed}: |b| = ${Math.abs(b)} > 9`);
        assert.equal(t07cGcd(a, b), 1, `${seed}: gcd(${a}, ${b}) ≠ 1`);
      }
      const lead = factors[0][0] * factors[1][0];
      assert.ok(lead >= 1 && lead <= 9, `${seed}: a₁a₂ = ${lead} outside 1..9`);
      if (id === 'T-factor-a1') assert.equal(lead, 1);
      if (id === 'T-factor-a2') assert.ok(lead >= 2, `${seed}: the a > 1 template drew lead ${lead}`);
      if (id === 'T-factor-gcf') assert.ok([2, 3, 4, 5].includes(Math.abs(c)), `${seed}: GCF ${c} outside {2,3,4,5}`);
      if (id === 'T-factor-neg') assert.ok(c < 0, `${seed}: the negative-lead template drew c = ${c}`);
      if (c !== 1 && c !== -1) assert.ok([2, 3, 4, 5].includes(Math.abs(c)), `${seed}: constant factor ${c}`);

      // the pulled-out constant really is the GREATEST common factor
      const inner = p.target.map((k) => k / c);
      assert.equal(t07cGcd(t07cGcd(inner[0], inner[1]), inner[2]), 1, `${seed}: ${p.target} still has a common factor inside`);

      assert.equal(t07cGrade(p, p.answer).kind, 'correct', `${seed}: display answer ${p.answer} rejected`);
      assert.equal(t07cGrade(p, p.answerTyped).kind, 'correct', `${seed}: typed answer rejected`);
    });
  });
}

test('T07c: typed coefficient vectors grade identically to string fixtures', () => {
  const sign = (n) => (n < 0 ? `- ${Math.abs(n)}` : `+ ${n}`);
  for (const id of T07C_FACTOR_IDS) {
    for (const s of t07cSeeds(60, `${id}-typed`)) {
      const item = generate(id, s);
      const typedPart = item.parts[0];
      const v = typedPart.var;
      const [[a1, b1], [a2, b2]] = typedPart.answerTyped.factors;
      const c = typedPart.answerTyped.c;
      const head = c === 1 ? '' : String(c);
      const [A, B, C] = item.params.target;

      // the SAME target written three ways: typed vector, Poly object, and a plain string
      const asPoly = { ...typedPart, target: t07cPolyDesc(typedPart.target) };
      const asString = { ...typedPart, target: `${A}*${v}^2 ${B < 0 ? '-' : '+'} ${Math.abs(B)}*${v} ${C < 0 ? '-' : '+'} ${Math.abs(C)}` };

      const probes = [
        typedPart.answer,                                                   // the display form
        typedPart.answerTyped,                                              // the typed factors
        `${head}(${a1}${v} ${sign(b1)})(${a2}${v} ${sign(b2)})`,             // explicit coefficients
        `${head}(${a2}${v} ${sign(b2)})(${a1}${v} ${sign(b1)})`,             // factor order swapped
        `(${a1}${v} ${sign(-b1)})(${a2}${v} ${sign(b2)})`,                   // a sign slip
        `${A}${v}^2`,                                                        // nonsense
        `${v} = 3 or ${v} = -1`,                                              // roots typed into `factored`
        '',                                                                  // empty
      ];
      for (const raw of probes) {
        const a = t07cGrade(typedPart, raw);
        for (const [label, part] of [['Poly', asPoly], ['string', asString]]) {
          const b = t07cGrade(part, raw);
          assert.equal(b.kind, a.kind, `${id} ${s}: the ${label} target graded ${JSON.stringify(raw)} as ${b.kind}, the typed vector said ${a.kind}`);
          assert.equal(b.credit, a.credit, `${id} ${s}: ${label} credit differs`);
          assert.deepEqual(b.tags, a.tags, `${id} ${s}: ${label} tags differ`);
          assert.equal(b.msg, a.msg, `${id} ${s}: ${label} message differs`);
        }
      }
    }
  }
});

test('T07c factoring: every generated misconception grades wrong with its own tag and line', () => {
  for (const id of T07C_FACTOR_IDS) {
    for (const s of t07cSeeds(60, `${id}-misc`)) {
      const item = generate(id, s);
      const p = item.parts[0];
      for (const m of item.misconceptions) {
        const r = t07cGrade(p, m.answer, { card: item });   // T09 passes the generated item as ctx.card
        assert.equal(r.kind, 'wrong', `${id} ${s}: "${m.answer}" graded ${r.kind}`);
        assert.ok(r.tags.includes(m.tag), `${id} ${s}: tags ${r.tags} missing ${m.tag}`);
        assert.equal(r.msg, m.msg, `${id} ${s}: the item's own line was not used`);
      }
    }
  }
});

test('T07c factoring: a GCF left inside a factor is `almost` on a Card, `wrong` under strictGCF', () => {
  let seen = 0;
  for (const s of t07cSeeds(80, 'gcf-incomplete')) {
    const item = generate('T-factor-gcf', s);
    const p = item.parts[0];
    const { c, factors } = p.answerTyped;
    const [[a1, b1], [a2, b2]] = factors;
    const distributed = `(${a1 * c}${p.var} ${b1 * c < 0 ? '-' : '+'} ${Math.abs(b1 * c)})(${a2}${p.var} ${b2 < 0 ? '-' : '+'} ${Math.abs(b2)})`;
    const card = t07cGrade(p, distributed);
    if (card.kind !== 'almost') continue;
    seen++;
    assert.ok(card.tags.includes('gcf-incomplete'));
    assert.equal(t07cGrade(p, distributed, { mock: true }).kind, 'wrong',
      'strict mode must return wrong, never charge for an almost (Global rule 2)');
  }
  assert.ok(seen > 10, `expected the GCF-incomplete path to be reachable, saw ${seen}`);
});

// ---- T-quad-solve ----------------------------------------------------------------------------------

test('T-quad-solve: integer/half roots, both required, every spelling round-trips', () => {
  const modes = new Set();
  t07cSweep('T-quad-solve', (item, seed) => {
    const p = item.parts[0];
    assert.equal(p.type, 'roots');
    assert.equal(p.answer.length, 2, `${seed}: a quadratic has two roots`);
    modes.add(item.params.mode);
    for (const r of p.answer) {
      assert.ok(Number.isInteger(r.n) && [1, 2].includes(r.d), `${seed}: root ${r.n}/${r.d} is not an integer or a half`);
    }
    const [r1, r2] = p.answer;
    assert.notEqual(r1.n * r2.d, r2.n * r1.d, `${seed}: the two roots are equal`);

    for (const raw of [p.answer, p.answerText, p.answerText.split(', ').map((x) => `${p.var} = ${x}`).join(' or ')]) {
      const r = t07cGrade(p, raw);
      assert.equal(r.kind, 'correct', `${seed}: ${JSON.stringify(raw)} → ${r.msg}`);
    }
    // S3: a proper subset is `almost` (free) on the first submit and `wrong` on the second
    const ctx = { state: {} };
    const one = p.answerText.split(', ')[0];
    const first = grade(p, one, ctx);
    assert.equal(first.kind, 'almost', `${seed}: a subset must be almost first`);
    assert.ok(first.tags.includes('forgot-second-root'));
    assert.equal(grade(p, one, ctx).kind, 'wrong', `${seed}: the second subset submit must be wrong`);
  }, { n: Math.min(T07C_SEEDS, 300) });
  assert.deepEqual([...modes].sort(), ['a1', 'a2'], 'both a = 1 and a > 1 items are drawn');
});

// ---- T-quad-ctx ------------------------------------------------------------------------------------

test('T-quad-ctx: keep/reject stories — every frame, every reason, both-valid is a coin flip', () => {
  const frames = new Set();
  const reasons = new Set();
  let both = 0, single = 0;

  t07cSweep('T-quad-ctx', (item, seed) => {
    frames.add(item.params.frame);
    reasons.add(item.params.reasonKey);
    if (item.params.bothValid) both++; else single++;

    const byId = Object.fromEntries(item.parts.map((p) => [p.id, p]));
    assert.equal(byId.setup?.type, 'equation', `${seed}: no setup slot`);
    assert.equal(byId.x?.type, 'roots');
    assert.equal(byId.keep?.type, 'reject');
    assert.ok(byId.cases || byId.measures, `${seed}: no final quantity part`);

    const roots = byId.x.answer.map((r) => r.n / r.d);
    assert.equal(roots.length, 2);
    assert.ok(roots.every(Number.isInteger), `${seed}: ${roots} are not integers`);
    assert.notEqual(roots[0], roots[1]);

    const keep = byId.keep;
    const named = [...keep.valid, ...keep.rejected].map(Number).sort((a, b) => a - b);
    assert.deepEqual(named, roots.slice().sort((a, b) => a - b), `${seed}: the reject stage does not cover the roots`);
    assert.ok(['negative-length', 'negative-angle', 'angle-over-180', 'zero-angle', 'not-a-solution', 'both-valid', 'neither']
      .includes(keep.reasonKey), `${seed}: reason ${keep.reasonKey} is not in the S3 menu`);
    assert.equal(keep.distractors.length, 3, `${seed}: a reject stage needs its distractors`);
    assert.equal(new Set(keep.distractors).size, 3, `${seed}: duplicate distractors`);
    assert.ok(!keep.distractors.includes(keep.reason), `${seed}: the right reason is also a distractor`);

    if (item.params.bothValid) {
      assert.equal(keep.reasonKey, 'both-valid');
      assert.equal(keep.rejected.length, 0);
      // S3: the "… is negative so reject it" distractor is ALWAYS present on a both-valid item
      assert.ok(keep.distractors.some((d) => /reject it$/.test(d)), `${seed}: the "reject it" distractor is missing`);
      assert.equal(byId.cases.rows.length, 2, `${seed}: a both-valid item needs both case rows`);
    } else {
      assert.equal(keep.valid.length, 1);
      assert.equal(keep.rejected.length, 1);
      for (const f of byId.measures.fields) assert.ok(Number.isFinite(f.answer) && f.answer > 0, `${seed}: field ${f.key} = ${f.answer}`);
    }

    if (item.params.frame !== 'rect') {
      const measures = byId.cases
        ? byId.cases.rows.flatMap((r) => [Number(r.a1), Number(r.a2)])
        : byId.measures.fields.map((f) => Number(f.answer));
      for (const m of measures) assert.ok(m > 0 && m <= 180, `${seed}: angle measure ${m} outside (0, 180]`);
    }

    t07cRoundTrip(item, {
      setup: `${byId.setup.canonical} = 0`,
      x: byId.x.answerText,
      keep: { keep: keep.valid, reject: keep.rejected, reason: keep.reason },
      ...(byId.cases ? { cases: byId.cases.rows } : {}),
      ...(byId.measures ? { measures: Object.fromEntries(byId.measures.fields.map((f) => [f.key, String(f.answer)])) } : {}),
    }, `T-quad-ctx ${seed}`);
  }, { n: Math.min(T07C_SEEDS, 250) });

  assert.deepEqual([...frames].sort(), ['angles', 'rect', 'zero'], 'all three stories are drawn');
  for (const r of ['negative-length', 'zero-angle', 'both-valid']) assert.ok(reasons.has(r), `reason ${r} never appeared`);
  assert.ok(both > 10 && single > 10, `both-valid ${both} / one-rejected ${single} — rejection must not be automatic`);
});

test('T-quad-ctx: rejecting a valid root, or keeping an invalid one, is caught', () => {
  for (const s of t07cSeeds(60, 'ctx-reject')) {
    const item = generate('T-quad-ctx', s);
    const keep = item.parts.find((p) => p.id === 'keep');
    const all = [...keep.valid, ...keep.rejected];
    if (keep.rejected.length === 0) {
      const r = t07cGrade(keep, { keep: [all[0]], reject: [all[1]], reason: 'negative angle' });
      assert.equal(r.kind, 'wrong');
      assert.ok(r.tags.includes('rejected-valid-root'), `tags ${r.tags}`);
    } else {
      const r = t07cGrade(keep, { keep: keep.rejected, reject: keep.valid, reason: keep.reason });
      assert.equal(r.kind, 'wrong', `${s}: swapping keep/reject must be wrong`);
      assert.ok(r.tags.includes('rejected-valid-root') || r.tags.includes('kept-invalid-root'), `tags ${r.tags}`);
    }
  }
});

// ---- T-sys -----------------------------------------------------------------------------------------

test('T-sys: DET ≠ 0, coefficients in range, and Cramer agrees with the answer key', () => {
  const modes = new Set();
  t07cSweep('T-sys', (item, seed) => {
    const { x, y, a1, b1, c1, a2, b2, c2, det, mode } = item.params;
    modes.add(mode);

    assert.equal(det, a1 * b2 - a2 * b1, `${seed}: det is not a₁b₂ − a₂b₁`);
    assert.notEqual(det, 0, `${seed}: singular system`);
    for (const k of [a1, b1, a2, b2]) {
      assert.ok(Number.isInteger(k) && k !== 0 && Math.abs(k) <= 6, `${seed}: coefficient ${k} outside [−6, 6]\\{0}`);
    }
    for (const v of [x, y]) assert.ok(Number.isInteger(v) && Math.abs(v) <= 9, `${seed}: solution ${v} outside [−9, 9]`);

    assert.equal(a1 * x + b1 * y, c1, `${seed}: equation 1 does not hold`);
    assert.equal(a2 * x + b2 * y, c2, `${seed}: equation 2 does not hold`);
    assert.equal((c1 * b2 - c2 * b1) / det + 0, x + 0, `${seed}: Cramer x`);
    assert.equal((a1 * c2 - a2 * c1) / det + 0, y + 0, `${seed}: Cramer y`);

    const p = item.parts[0];
    assert.equal(p.type, 'multi');
    assert.deepEqual(p.fields.map((f) => f.key), ['x', 'y']);
    assert.equal(t07cGrade(p, { x: String(x), y: String(y) }).kind, 'correct', `${seed}: field answers rejected`);
    assert.equal(t07cGrade(p, item.answer).kind, 'correct', `${seed}: the "(x, y)" form was rejected`);
    if (x !== y) {
      const swapped = t07cGrade(p, { x: String(y), y: String(x) });
      assert.equal(swapped.kind, 'wrong', `${seed}: swapped fields accepted`);
      assert.ok(swapped.tags.includes('swapped-fields'), `${seed}: tags ${swapped.tags}`);
    }
  }, { n: Math.min(T07C_SEEDS, 400) });
  assert.deepEqual([...modes].sort(), ['elim', 'general', 'sub'], 'all three methods are drawn');
});

// ---- T-notation ------------------------------------------------------------------------------------

test('T-notation: RAY AB ≠ RAY BA traps are present and graded', () => {
  let rays = 0;
  t07cSweep('T-notation', (item, seed) => {
    const p = item.parts[0];
    assert.ok(['notation', 'mc'].includes(p.type));
    const pts = item.params.points;
    assert.ok(Array.isArray(pts) && pts.length >= 4 && pts.length <= 6, `${seed}: a 4–6 point figure, got ${pts?.length}`);
    for (const L of pts) assert.ok(!'IO'.includes(L), `${seed}: letter ${L} is ambiguous`);
    assert.equal(new Set(pts).size, pts.length, `${seed}: repeated letters`);

    if (p.type === 'notation') {
      const own = p.sides ? { kind: p.kind, sides: p.sides } : { kind: p.kind, pts: p.pts };
      assert.equal(t07cGrade(p, own).kind, 'correct', `${seed}: the item's own build was rejected`);
      if (p.kind === 'ray') {
        rays++;
        const reversed = t07cGrade(p, { kind: 'ray', pts: [p.pts[1], p.pts[0]] });
        assert.equal(reversed.kind, 'wrong', `${seed}: ray ${p.pts[1]}${p.pts[0]} was accepted for ray ${p.pts.join('')}`);
        assert.ok(reversed.tags.includes('ray-order'), `${seed}: tags ${reversed.tags}`);
        assert.ok(item.misconceptions.some((m) => m.tag === 'ray-order'), `${seed}: no ray-order trap on the item`);
        // the typed build and the string spelling must agree exactly
        const asString = t07cGrade(p, `ray ${p.pts[1]}${p.pts[0]}`);
        assert.equal(asString.kind, reversed.kind);
        assert.deepEqual(asString.tags, reversed.tags);
      }
      if (p.kind === 'len') {
        assert.equal(t07cGrade(p, { kind: 'seg', pts: p.pts }).kind, 'wrong', `${seed}: a bar on a length was accepted`);
      }
      if (p.kind === 'ang') {
        const [a, b, c] = p.pts;
        assert.equal(t07cGrade(p, { kind: 'ang', pts: [b, a, c] }).kind, 'wrong', `${seed}: the vertex was not required in the middle`);
        assert.equal(t07cGrade(p, { kind: 'ang', pts: [c, b, a] }).kind, 'correct', `${seed}: the outer letters must be swappable`);
      }
    } else {
      assert.equal(t07cGrade(p, p.answer).kind, 'correct', `${seed}: the mc answer was rejected`);
      assert.equal(p.distractors.length, 3, `${seed}: an mc needs three distractors`);
      assert.equal(new Set([p.answer, ...p.distractors.map((d) => d.text)]).size, 4, `${seed}: duplicate options`);
      for (const d of p.distractors) assert.equal(t07cGrade(p, d.text).kind, 'wrong');
    }
  }, { n: Math.min(T07C_SEEDS, 400) });
  assert.ok(rays >= 20, `expected plenty of ray items, saw ${rays}`);
});

test('T-notation: every kind is reachable, and a kind can be forced', () => {
  const kinds = new Set();
  for (const s of t07cSeeds(300, 'not-kinds')) kinds.add(generate('T-notation', s).params.kind);
  for (const k of ['ray', 'line', 'seg', 'len', 'ang', 'm', 'plane', 'cong', 'eq', 'read']) {
    assert.ok(kinds.has(k), `notation kind ${k} was never drawn`);
  }
  for (const k of ['ray', 'len', 'ang', 'read']) {
    assert.equal(generate('T-notation', 'forced', { kind: k }).params.kind, k);
  }
});

// ---- T-vocab ---------------------------------------------------------------------------------------

test('T-vocab: confusable-group distractors, every mode round-trips', () => {
  const modes = new Set();
  t07cSweep('T-vocab', (item, seed) => {
    const p = item.parts[0];
    modes.add(item.params.mode);
    assert.ok(['mc', 'term', 'termmatch'].includes(p.type));

    if (p.type === 'mc') {
      assert.equal(p.distractors.length, 3, `${seed}: an mc needs three distractors`);
      assert.equal(new Set([p.answer, ...p.distractors.map((d) => d.text)]).size, 4, `${seed}: duplicate options`);
      for (const d of p.distractors) {
        assert.ok(d.why && d.term, `${seed}: a distractor with no explanation`);
        const r = t07cGrade(p, d.text);
        assert.equal(r.kind, 'wrong');
        assert.ok(r.msg && r.msg.length > 10, `${seed}: a bare "wrong" on a distractor`);
      }
      assert.equal(t07cGrade(p, p.answer).kind, 'correct');
    } else if (p.type === 'term') {
      assert.ok(p.answers.length >= 1);
      for (const a of p.answers) assert.equal(t07cGrade(p, a).kind, 'correct', `${seed}: alias "${a}" rejected`);
      assert.equal(t07cGrade(p, p.answers[0].toUpperCase()).kind, 'correct', `${seed}: case sensitivity`);
    } else {
      assert.equal(p.pairs.length, 6, `${seed}: a termmatch set is 6↔6`);
      assert.equal(new Set(p.pairs.map((x) => x.term)).size, 6);
      assert.equal(t07cGrade(p, Object.fromEntries(p.pairs.map((x) => [x.term, x.def]))).kind, 'correct',
        `${seed}: the set's own matching was rejected`);
    }
  }, { n: Math.min(T07C_SEEDS, 300) });
  assert.deepEqual([...modes].sort(), ['match', 'mc-def', 'mc-term', 'type'], 'all four modes are drawn');
});

// ---- T-classify ------------------------------------------------------------------------------------

test('T-classify: six measures with EXACTLY ONE 90 and EXACTLY ONE 180', () => {
  t07cSweep('T-classify', (item, seed) => {
    assert.equal(item.parts.length, 6, `${seed}: a set is six measures`);
    const ms = item.parts.map((p) => p.measure);
    assert.equal(new Set(ms).size, 6, `${seed}: repeated measures ${ms}`);
    assert.equal(ms.filter((m) => m === 90).length, 1, `${seed}: exactly one 90 — got ${ms}`);
    assert.equal(ms.filter((m) => m === 180).length, 1, `${seed}: exactly one 180 — got ${ms}`);
    assert.ok(ms.some((m) => m < 90), `${seed}: no acute angle`);
    assert.ok(ms.some((m) => m > 90 && m < 180), `${seed}: no obtuse angle`);
    for (const m of ms) assert.ok(Number.isInteger(m) && m > 0 && m <= 180, `${seed}: measure ${m}`);

    for (const p of item.parts) {
      assert.equal(p.type, 'classify');
      assert.deepEqual(p.options, ['acute', 'right', 'obtuse', 'straight']);
      const want = p.measure < 90 ? 'acute' : p.measure === 90 ? 'right' : p.measure < 180 ? 'obtuse' : 'straight';
      assert.equal(p.answer, want, `${seed}: ${p.measure}° labelled ${p.answer}`);
      assert.equal(t07cGrade(p, p.answer).kind, 'correct');
      assert.equal(t07cGrade(p, p.answer[0]).kind, 'correct', `${seed}: the letter shortcut`);
      const r = t07cGrade(p, p.options.find((o) => o !== p.answer));
      assert.equal(r.kind, 'wrong');
      assert.ok(!r.msg.includes(p.answer), `${seed}: the feedback gave the answer away`);
    }
    for (const m of item.misconceptions) {
      assert.ok(['boundary-90', 'boundary-180'].includes(m.tag), `${seed}: tag ${m.tag}`);
    }
  }, { n: Math.min(T07C_SEEDS, 300) });
});

// ---- cross-cutting ---------------------------------------------------------------------------------

test('T07c: every emitted tag is catalogued and every part type has a grader', () => {
  const tags = new Set();
  const types = new Set();
  for (const id of T07C_IDS) {
    for (const s of t07cSeeds(40, `${id}-tags`)) {
      const item = generate(id, s);
      for (const m of item.misconceptions ?? []) if (m.tag) tags.add(m.tag);
      for (const p of item.parts) types.add(p.type);
    }
  }
  for (const t of tags) assert.ok(Object.prototype.hasOwnProperty.call(T07C_TAGS, t), `uncatalogued tag ${t}`);
  for (const ty of types) {
    assert.notEqual(grade({ id: 'probe', type: ty }, '', { state: {} }).err, 'no-grader', `no grader for part type ${ty}`);
  }
  assert.ok(tags.size >= 6, `expected a spread of tags, got ${[...tags].join(',')}`);
  for (const ty of ['factored', 'roots', 'reject', 'cases', 'multi', 'equation', 'notation', 'mc', 'term', 'termmatch', 'classify']) {
    assert.ok(types.has(ty), `part type ${ty} was never generated`);
  }
});

test('T07c: hostile input never throws and never grades correct', () => {
  const junk = ['', '   ', '???', '((((', '1e3', '5,5', 'NaN', '-', '=', 'x'.repeat(3000), String.fromCharCode(0), '👍'];
  for (const id of T07C_IDS) {
    const item = generate(id, 'hostile');
    for (const p of item.parts) {
      for (const raw of junk) {
        const r = t07cGrade(p, raw);
        assert.ok(['wrong', 'almost', 'malformed'].includes(r.kind), `${id}/${p.id} graded ${JSON.stringify(raw)} as ${r.kind}`);
        assert.equal(typeof r.msg, 'string');
      }
      for (const raw of [null, undefined, {}, [], 42, true]) {
        const r = t07cGrade(p, raw);
        assert.ok(r && typeof r.kind === 'string', `${id}/${p.id} returned no result for ${String(raw)}`);
        assert.notEqual(r.kind, 'correct', `${id}/${p.id} accepted ${String(raw)}`);
      }
    }
  }
});
/* === /T07c === */

/* === T07a === */
// Comp/supp generators: T-csarith · T-cs-lin · T-cs-ratio · T-cs-quad.
// Spec: COMPOSED S2 "Generator contract" + the four `T-cs*` bullets, S3 (the parts they emit), S8 #7a.
// Acceptance (S8 #7a): invariants · determinism · answers round-trip through the graders ·
// comp-of-supp never emitted · the both-valid coin flip is observed for T-cs-quad · every Variant
// carries its distractors.

import { templates as REGISTRY } from '../site/data/templates.js';
import { byId as CARDS } from '../site/data/cards.js';
import {
  makeGen as t07aMakeGen, validateItem as t07aValidate, solveEmitted as t07aSolve,
  MAX_ATTEMPTS as T07A_MAX_ATTEMPTS, fmt as t07aFmt,
} from '../site/js/gen/contract.js';
import { gen as t07aCsarith } from '../site/js/gen/csarith.js';
import { gen as t07aCslin, frames as T07A_FRAMES } from '../site/js/gen/cslin.js';
import { gen as t07aCsratio, PART_SUMS as T07A_PART_SUMS } from '../site/js/gen/csratio.js';
import { gen as t07aCsquad } from '../site/js/gen/csquad.js';

const T07A_IDS = ['T-csarith', 'T-cs-lin', 'T-cs-ratio', 'T-cs-quad'];
const T07A_GENS = { 'T-csarith': t07aCsarith, 'T-cs-lin': t07aCslin, 'T-cs-ratio': t07aCsratio, 'T-cs-quad': t07aCsquad };
const T07A_SEEDS = Math.max(1, Number(process.env.GEN_SEEDS) || 5000);
/** the statistical checks (coverage of frames / asks / shapes) run over this many seeds */
const T07A_SPREAD = Math.min(600, T07A_SEEDS);
/**
 * The cheap invariants (measures, chain, distractors, shape) run on EVERY one of the 5 000 seeds; the
 * two deep checks — re-solving every alternate setup with poly.js and grading every misconception —
 * run on every 4th item (≈ 1 250 per template), which keeps this file inside a minute.
 */
let t07aDeepCounter = 0;
function t07aDeep(item) {
  if ((t07aDeepCounter++ & 3) !== 0) return;
  t07aEquationSolves(item);
  t07aMisconceptions(item);
}

/** a measure a student may see: strictly inside (0, 180) and an integer or a half (S2 invariants) */
function t07aMeasure(v, where) {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[−°]/g, (c) => (c === '−' ? '-' : '')));
  assert.ok(Number.isFinite(n), `${where}: "${v}" is not a number`);
  assert.ok(n > 0 && n < 180, `${where}: ${n} is outside (0, 180)`);
  assert.ok(Math.abs(n * 2 - Math.round(n * 2)) < 1e-9, `${where}: ${n} is neither an integer nor a half`);
  return n;
}

/** S8 #7a: "every Variant carries its distractors" — on the num parts and on at least one part. */
function t07aDistractors(item) {
  let any = false;
  for (const p of item.parts) {
    const map = p.distractors;
    const has = Array.isArray(map) ? map.length > 0 : !!map && Object.keys(map).length > 0;
    if (has) any = true;
    if (p.type === 'num') {
      assert.ok(has, `${item.id}: num part ${p.id} carries no distractors`);
      for (const [k, v] of Object.entries(map)) t07aMeasure(v, `${item.id} distractor ${k}`);
      assert.ok(!Object.values(map).some((v) => String(v) === String(p.answer)),
        `${item.id}: a distractor repeats the answer`);
    }
    if (p.type === 'multi') for (const f of p.fields) {
      if (f.distractors && Object.keys(f.distractors).length) any = true;
    }
  }
  assert.ok(any, `${item.id}: no part carries distractors`);
}

/** the emitted equation must solve, with the site's own solver, to exactly the roots the item claims */
function t07aEquationSolves(item) {
  for (const p of item.parts) {
    if (p.type !== 'equation') continue;
    assert.ok(p.optional === true, `${item.id}: the setup slot is skippable on a Card (S3)`);
    assert.ok(Array.isArray(p.mustMention) && p.mustMention.length, `${item.id}: the setup needs a mustMention guard`);
    const claimed = p.roots.map(Number).sort((a, b) => a - b);
    const got = t07aSolve(p.canonical, p.var);
    assert.ok(got, `${item.id}: ${p.canonical} does not solve`);
    for (const c of claimed) {
      assert.ok(got.some((g) => Math.abs(g - c) < 1e-9), `${item.id}: solver [${got.map(t07aFmt)}] misses claimed root ${c}`);
    }
    for (const alt of p.alternates ?? []) {
      const a = t07aSolve(alt.canonical, p.var);
      assert.ok(a && a.length === 1 && Math.abs(a[0] - Number(alt.roots[0])) < 1e-9,
        `${item.id}: alternate ${alt.canonical} does not solve to ${alt.roots[0]}`);
    }
  }
}

/** every misconception the item ships must grade `wrong` and carry its own tag and line (S3) */
function t07aMisconceptions(item) {
  const entries = [
    ...(item.misconceptions ?? []).map((m) => ({ m, partId: m.part })),
    ...item.parts.flatMap((p) => (p.misconceptions ?? []).map((m) => ({ m, partId: m.part ?? p.id }))),
  ];
  for (const { m, partId } of entries) {
    const part = item.parts.find((p) => p.id === partId) ?? item.parts[item.parts.length - 1];
    if (!part) continue;
    if (part.type === 'reject' || part.type === 'roots') continue;      // those raws are not a bare value
    const raw = part.type === 'multi'
      ? Object.fromEntries(part.fields.map((f) => [f.key, f.key === (m.field ?? part.fields[0].key) ? m.answer : f.answer]))
      : m.answer;
    const r = grade(part, raw, { state: {}, card: item, misconceptions: item.misconceptions });
    assert.equal(r.kind, 'wrong', `${item.id}: misconception ${JSON.stringify(m.answer)} on ${part.id} graded ${r.kind}`);
    if (m.tag) assert.ok(r.tags.includes(m.tag), `${item.id}: ${m.answer} lost its tag ${m.tag} (got ${r.tags.join(',')})`);
    assert.ok(r.msg && r.msg.length > 10, `${item.id}: ${m.answer} has no message`);
  }
}

// ---- T-csarith ---------------------------------------------------------------------------------

harness('T-csarith', {
  seeds: T07A_SEEDS,
  invariant(item) {
    const { base, ops, depth, value } = item.meta;
    assert.ok(depth >= 1 && depth <= 3, `${item.id}: depth ${depth} is outside 1–3`);
    assert.equal(ops.length, depth);
    t07aMeasure(base, `${item.id} base`);
    // the chain, recomputed from the EMITTED ops
    let v = base;
    for (let i = 0; i < ops.length; i++) {
      assert.ok(ops[i] === 'comp' || ops[i] === 'supp', `${item.id}: unknown step ${ops[i]}`);
      if (ops[i] === 'comp') assert.ok(v > 0 && v < 90, `${item.id}: the complement is taken of ${v}, which is not below 90`);
      // *** comp-of-supp is never generated (S2 / S8 #7a) ***
      if (ops[i] === 'comp' && i > 0) assert.notEqual(ops[i - 1], 'supp', `${item.id}: a complement follows a supplement`);
      v = ops[i] === 'comp' ? 90 - v : 180 - v;
      t07aMeasure(v, `${item.id} intermediate ${i}`);
    }
    assert.equal(v, value, `${item.id}: the chain recomputes to ${v}, not ${value}`);
    assert.equal(String(item.parts[0].answer), t07aFmt(value));
    assert.deepEqual(item.parts[0].asks, ops, `${item.id}: asks must be the chain itself`);
    assert.ok(!/complement of the supplement/i.test(item.stem), `${item.id}: the stem asks for a comp of a supp`);
    assert.equal(item.parts.length, 1, `${item.id}: arithmetic items are one num part`);
    assert.equal(item.tier, depth === 1 ? 1 : 2);
    t07aDistractors(item);
    t07aDeep(item);
  },
});

test('T-csarith: depths 1–3 all occur, and no chain ever takes a complement of a supplement', () => {
  const depths = new Map();
  const shapes = new Set();
  for (let i = 0; i < T07A_SPREAD; i++) {
    const item = generate('T-csarith', `d${i}`);
    depths.set(item.meta.depth, (depths.get(item.meta.depth) ?? 0) + 1);
    shapes.add(item.meta.ops.join(','));
    assert.ok(!item.meta.ops.some((o, j) => o === 'comp' && item.meta.ops[j - 1] === 'supp'));
  }
  assert.deepEqual([...depths.keys()].sort(), [1, 2, 3], 'every depth 1–3 must occur');
  for (const [d, n] of depths) assert.ok(n >= T07A_SPREAD * 0.05, `depth ${d} appeared only ${n} times`);
  assert.ok(shapes.has('comp'), 'no bare complement');
  assert.ok(shapes.has('supp'), 'no bare supplement');
  assert.ok(shapes.has('comp,supp'), 'no "supplement of the complement"');
  assert.ok(!shapes.has('supp,comp'), 'a "complement of the supplement" was emitted');
});

test('T-csarith: the S3 chain diagnosis names the stage a wrong answer stopped at', () => {
  const item = generate('T-csarith', 'diagnosis');
  const part = item.parts[0];
  for (const [name, value] of Object.entries(part.distractors)) {
    const r = grade(part, value, { state: {}, card: item, misconceptions: item.misconceptions });
    assert.equal(r.kind, 'wrong', `${name} should be wrong`);
    assert.ok(r.msg.length > 10, `${name} has no diagnosis`);
    assert.ok(!r.msg.includes(String(part.answer)), 'a miss message must never contain the answer');
  }
});

// ---- T-cs-lin ----------------------------------------------------------------------------------

const T07A_LIN_ASKS = new Set(['angle', 'comp', 'supp', 'supp-of-comp', 'angle+comp', 'angle+supp',
  'pair', 'larger', 'smaller', 'supp-of-smaller', 'comp-of-smaller', 'supp-of-larger']);

harness('T-cs-lin', {
  seeds: T07A_SEEDS,
  invariant(item) {
    const { a, values, frame, ask } = item.meta;
    assert.ok(T07A_FRAMES.includes(frame), `${item.id}: unknown frame ${frame}`);
    assert.ok(T07A_LIN_ASKS.has(ask), `${item.id}: unknown ask ${ask}`);
    // S2: x ∈ (0, 90) for comp/supp
    assert.ok(a > 0 && a < 90, `${item.id}: x = ${a} is outside (0, 90)`);
    t07aMeasure(a, `${item.id} angle`);
    for (const [k, v] of Object.entries(values)) t07aMeasure(v, `${item.id} ${k}`);
    assert.equal(values.comp, 90 - a);
    assert.equal(values.supp, 180 - a);
    const [setup, answer] = item.parts;
    assert.equal(item.parts.length, 2);
    assert.equal(setup.type, 'equation');
    assert.equal(setup.roots[0], t07aFmt(a));
    if (answer.type === 'num') t07aMeasure(answer.answer, `${item.id} answer`);
    else for (const f of answer.fields) t07aMeasure(f.answer, `${item.id} field ${f.key}`);
    t07aDistractors(item);
    t07aDeep(item);
  },
});

test('T-cs-lin: all nine of the teacher’s sentence frames and every ask are reachable', () => {
  const frames = new Set();
  const asks = new Set();
  for (let i = 0; i < T07A_SPREAD * 2; i++) {
    const item = generate('T-cs-lin', `f${i}`);
    frames.add(item.meta.frame);
    asks.add(item.meta.ask);
  }
  assert.deepEqual([...frames].sort(), [...T07A_FRAMES].sort(), 'a frame was never drawn');
  for (const ask of ['angle', 'comp', 'supp', 'supp-of-comp', 'angle+comp', 'pair', 'larger']) {
    assert.ok(asks.has(ask), `the ask "${ask}" was never drawn`);
  }
});

test('T-cs-lin: a student who names x differently is still correct (the alternates are equivalent)', () => {
  for (let i = 0; i < 120; i++) {
    const item = generate('T-cs-lin', `alt${i}`);
    const setup = item.parts[0];
    for (const alt of setup.alternates) {
      const r = grade(setup, `${alt.canonical} = 0`, { state: {}, card: item });
      assert.equal(r.kind, 'correct', `${item.id}: alternate "${alt.text}" graded ${r.kind}: ${r.msg}`);
    }
  }
});

test('T-cs-lin: the setup traps are wrong equations, and they say what they give', () => {
  let seen = 0;
  for (let i = 0; i < 200; i++) {
    const item = generate('T-cs-lin', `trap${i}`);
    const setup = item.parts[0];
    for (const m of setup.misconceptions ?? []) {
      seen++;
      const r = grade(setup, m.answer, { state: {}, card: item });
      assert.equal(r.kind, 'wrong', `${item.id}: the trap "${m.answer}" graded ${r.kind}`);
      assert.ok(r.tags.includes(m.tag), `${item.id}: trap lost its tag ${m.tag}`);
      assert.ok(m.gives != null && m.gives !== '', `${item.id}: a trap does not say what x it gives`);
    }
  }
  assert.ok(seen > 100, `only ${seen} setup traps in 200 items`);
});

// ---- T-cs-ratio --------------------------------------------------------------------------------

harness('T-cs-ratio', {
  seeds: T07A_SEEDS,
  invariant(item) {
    const { form, p, q, values, total } = item.meta;
    assert.ok(['parts', 'supp-comp', 'angle-supp'].includes(form), `${item.id}: unknown form ${form}`);
    assert.ok(Number.isInteger(p) && Number.isInteger(q) && p > 0 && q > 0, `${item.id}: ratio ${p}:${q}`);
    for (const [k, v] of Object.entries(values)) t07aMeasure(v, `${item.id} ${k}`);
    if (form === 'parts') {
      assert.ok(T07A_PART_SUMS.includes(p + q), `${item.id}: p + q = ${p + q} is not one of the S2 sums`);
      assert.equal(total % (p + q), 0, `${item.id}: ${p + q} parts do not divide ${total}`);
      assert.equal(values.smaller + values.larger, total);
    } else {
      assert.ok(values.angle > 0 && values.angle < 90, `${item.id}: the angle is not acute`);
      if (form === 'supp-comp') assert.ok(p > 2 * q, `${item.id}: supp:comp needs p > 2q, got ${p}:${q}`);
      if (form === 'angle-supp') assert.ok(p < q, `${item.id}: angle:supp needs p < q, got ${p}:${q}`);
    }
    const answer = item.parts[1];
    if (answer.type === 'ratio') {
      const [ra, rb] = String(answer.answer).split(':').map(Number);
      assert.ok(Number.isInteger(ra) && Number.isInteger(rb) && ra > 0 && rb > 0, `${item.id}: ratio ${answer.answer}`);
      let x = ra; let y = rb;
      while (y) { const t = x % y; x = y; y = t; }
      assert.equal(x, 1, `${item.id}: ${answer.answer} is not in simplest form`);
    }
    t07aDistractors(item);
    t07aDeep(item);
  },
});

test('T-cs-ratio: all three shapes occur, including the one that answers with a ratio', () => {
  const forms = new Map();
  let ratioAnswers = 0;
  for (let i = 0; i < T07A_SPREAD; i++) {
    const item = generate('T-cs-ratio', `r${i}`);
    forms.set(item.meta.form, (forms.get(item.meta.form) ?? 0) + 1);
    if (item.parts[1].type === 'ratio') ratioAnswers++;
  }
  assert.deepEqual([...forms.keys()].sort(), ['angle-supp', 'parts', 'supp-comp']);
  for (const [f, n] of forms) assert.ok(n >= T07A_SPREAD * 0.08, `form ${f} appeared only ${n} times`);
  assert.ok(ratioAnswers > 0, 'no item ever asked for a ratio');
});

test('T-cs-ratio: an unreduced ratio is still correct, with the S3 nudge', () => {
  let checked = 0;
  for (let i = 0; i < 400 && checked < 5; i++) {
    const item = generate('T-cs-ratio', `n${i}`);
    const part = item.parts[1];
    if (part.type !== 'ratio') continue;
    checked++;
    const [ra, rb] = String(part.answer).split(':').map(Number);
    const r = grade(part, `${ra * 2}:${rb * 2}`, { state: {}, card: item });
    assert.equal(r.kind, 'correct', `${item.id}: an unreduced ratio must still be correct`);
    assert.ok(r.nudge, `${item.id}: no "simplest form" nudge`);
  }
  assert.ok(checked > 0, 'no ratio item was drawn');
});

// ---- T-cs-quad ---------------------------------------------------------------------------------

harness('T-cs-quad', {
  seeds: T07A_SEEDS,
  invariant(item) {
    const { shape, bothValid, values, roots } = item.meta;
    assert.ok(['product', 'ratio'].includes(shape), `${item.id}: unknown shape ${shape}`);
    assert.equal(item.parts.map((p) => p.type).join(','), 'equation,roots,reject,num',
      `${item.id}: the S3 rootcase chain must be equation → roots → reject → num`);
    for (const [k, v] of Object.entries(values)) t07aMeasure(v, `${item.id} ${k}`);

    const [, rootsPart, rejectPart, answer] = item.parts;
    assert.equal(rootsPart.answer.length, 2, `${item.id}: two roots`);
    assert.notEqual(rootsPart.answer[0], rootsPart.answer[1], `${item.id}: distinct roots`);
    assert.equal(rejectPart.valid.length + rejectPart.rejected.length, 2, `${item.id}: every root gets a verdict`);
    assert.ok(rejectPart.distractors.length >= 2, `${item.id}: reason distractors`);
    assert.equal(bothValid, rejectPart.rejected.length === 0);
    for (const r of rejectPart.valid) assert.ok(Number(r) > 0 && Number(r) < 90, `${item.id}: kept root ${r} is not an angle`);
    for (const r of rejectPart.rejected) assert.ok(!(Number(r) > 0 && Number(r) < 90), `${item.id}: rejected root ${r} IS an angle`);
    if (bothValid) {
      assert.equal(rejectPart.reasonKey, 'both-valid');
      assert.equal(Number(roots[0]) + Number(roots[1]), 90, `${item.id}: the two roots are complements`);
      assert.equal(Number(roots[0]) * Number(roots[1]), item.meta.P);
    } else {
      assert.equal(rejectPart.reasonKey, 'zero-angle');
      assert.ok(rejectPart.rejected.map(Number).includes(0), `${item.id}: the rejected root is 0`);
    }
    t07aMeasure(answer.answer, `${item.id} answer`);
    t07aDistractors(item);
    t07aDeep(item);
  },
});

test('T-cs-quad: both-valid vs one-invalid is a COIN FLIP — rejection is never automatic', () => {
  let both = 0;
  let one = 0;
  for (let i = 0; i < T07A_SPREAD; i++) {
    const item = generate('T-cs-quad', `c${i}`);
    if (item.meta.bothValid) both++; else one++;
    // the reject stage is offered either way, so "always reject" is wrong half the time
    assert.ok(item.parts.some((p) => p.type === 'reject'), `${item.id}: no reject stage`);
  }
  assert.ok(both > 0 && one > 0, `both-valid ${both} / one-invalid ${one}`);
  const share = both / (both + one);
  assert.ok(share > 0.35 && share < 0.65, `the coin flip is biased: both-valid ${both} of ${both + one}`);
});

test('T-cs-quad: keeping the invalid root, or rejecting a valid one, is caught', () => {
  for (let i = 0; i < 60; i++) {
    const item = generate('T-cs-quad', `v${i}`);
    const rejectPart = item.parts[2];
    const swapped = { keep: rejectPart.rejected, reject: rejectPart.valid, reason: rejectPart.reasonKey };
    if (!rejectPart.rejected.length) {
      const one = { keep: [rejectPart.valid[0]], reject: [rejectPart.valid[1]], reason: 'negative-angle' };
      const r = grade(rejectPart, one, { state: {}, card: item });
      assert.equal(r.kind, 'wrong', `${item.id}: rejecting a valid root must be wrong`);
      assert.ok(r.tags.includes('rejected-valid-root'), `${item.id}: tags ${r.tags.join(',')}`);
    } else {
      const r = grade(rejectPart, swapped, { state: {}, card: item });
      assert.equal(r.kind, 'wrong', `${item.id}: keeping the invalid root must be wrong`);
    }
  }
});

test('T-cs-quad: one root alone is `almost` first and `wrong` on the second submit (S3)', () => {
  const item = generate('T-cs-quad', 'subset', { shape: 'product' });   // both roots are real angles here
  const rootsPart = item.parts[1];
  const ctx = { state: {}, card: item };
  const first = grade(rootsPart, rootsPart.answer[0], ctx);
  assert.equal(first.kind, 'almost', 'the first subset submit is free');
  const missing = new RegExp(`(^|[^0-9.])${rootsPart.answer[1]}([^0-9.]|$)`);
  assert.ok(!missing.test(first.msg), `the missing root is named: "${first.msg}"`);
  const second = grade(rootsPart, rootsPart.answer[0], ctx);
  assert.equal(second.kind, 'wrong', 'the second subset submit consumes the attempt');
});

// ---- the shared contract -----------------------------------------------------------------------

describe('T07a — the generator contract (js/gen/contract.js)', () => {
  test('the four templates are registered with the S8 #7a shape', () => {
    for (const id of T07A_IDS) {
      const t = getTemplate(id);
      assert.ok(t, `${id} is not registered`);
      assert.equal(typeof t.gen, 'function');
      assert.equal(t.version, T07A_GENS[id].version);
      assert.ok(Array.isArray(t.skills) && t.skills.length, `${id}: skills`);
      assert.ok(Number.isInteger(t.tier) && t.tier >= 1 && t.tier <= 4, `${id}: tier`);
      assert.ok(Array.isArray(t.forCards), `${id}: forCards`);
      for (const card of t.forCards) assert.ok(CARDS[card], `${id}: forCards names ${card}, which is not a card`);
      assert.equal(REGISTRY[id], t);
    }
    // the templates data/modules.js names for M3/M4/M5 all exist here
    for (const id of ['T-csarith', 'T-cs-lin', 'T-cs-ratio', 'T-cs-quad']) assert.ok(templateIds().includes(id));
  });

  test('an item is stamped with its template, version and seed identity', () => {
    for (const id of T07A_IDS) {
      const item = generate(id, 'a91f2c');
      assert.equal(item.template, id);
      assert.equal(item.templateVersion, getTemplate(id).version);
      assert.equal(item.id, `${id}#${tagFor(id, 'a91f2c')}`);
      assert.equal(item.seedKey, `${id}|a91f2c`);
      assert.deepEqual(t07aValidate(item), [], `${id}: ${t07aValidate(item).join(' · ')}`);
    }
  });

  test('every seed rebuilds byte-identically after a reload of the module graph', async () => {
    const before = T07A_IDS.map((id) => generate(id, 'frozen-7a'));
    const mod = await import('../site/data/templates.js');
    for (const [i, id] of T07A_IDS.entries()) {
      assert.deepEqual(mod.generate(id, 'frozen-7a'), before[i], `${id} does not replay`);
    }
  });

  test('a draw that never succeeds falls back to the fixed exemplar after 200 attempts', () => {
    let calls = 0;
    const gen = t07aMakeGen('T-never', (rng, params, api) => { calls++; rng.next(); return api.reject(); }, {
      version: 3,
      skills: ['CSARITH'],
      exemplar: () => ({
        prompt: 'Find the supplement of the complement of 21.5°.',
        parts: [{ id: 'answer', type: 'num', label: 'x =', answer: '111.5', asks: ['comp', 'supp'], distractors: { angle: '21.5', comp: '68.5' } }],
        answer: '111.5°',
        hints: ['a hint long enough to be useful', 'a second hint, also long enough', 'a third hint, one step from the end'],
        solution: [{ say: 'first step', math: '90 − 21.5 = 68.5' }, { say: 'second step', math: '180 − 68.5 = 111.5' }],
        misconceptions: [],
      }),
    });
    const item = gen('anything');
    assert.equal(calls, T07A_MAX_ATTEMPTS, 'the re-roll loop is capped at 200 draws');
    assert.equal(item.fallback, true);
    assert.equal(item.templateVersion, 3);
    assert.match(item.id, /^T-never#[0-9a-f]{6}$/);
    assert.deepEqual(t07aValidate(item), []);
  });

  test('each template’s own exemplar is a valid item that grades itself correct', () => {
    for (const id of T07A_IDS) {
      const item = T07A_GENS[id].exemplar();
      assert.deepEqual(T07A_GENS[id].check(item), [], `${id} exemplar: ${T07A_GENS[id].check(item).join(' · ')}`);
      for (const r of gradeItem(item)) assert.ok(r.ok, `${id} exemplar part ${r.id} graded ${r.kind}: ${r.msg}`);
    }
  });

  test('validateItem rejects the things a card screen cannot render', () => {
    const good = generate('T-csarith', 'validate');
    assert.deepEqual(t07aValidate(good), []);
    assert.ok(t07aValidate({ ...good, hints: good.hints.slice(0, 2) }).some((p) => /hints/.test(p)));
    assert.ok(t07aValidate({ ...good, stem: '', prompt: '' }).some((p) => /stem|prompt/.test(p)));
    assert.ok(t07aValidate({ ...good, id: 'nope' }).some((p) => /id/.test(p)));
    assert.ok(t07aValidate({ ...good, solution: [] }).some((p) => /solution/.test(p)));
    const nan = { ...good, parts: [{ ...good.parts[0], answer: String(Number.NaN) }] };
    assert.ok(t07aValidate(nan).some((p) => /bad value|NaN/.test(p)));
    const noDist = { ...good, parts: [{ ...good.parts[0], distractors: {} }] };
    assert.ok(t07aValidate(noDist).some((p) => /distractors/.test(p)));
  });

  test('params force a shape: the same seed gives a different item per knob', () => {
    const depth1 = generate('T-csarith', 'knob', { depth: 1 });
    const depth3 = generate('T-csarith', 'knob', { depth: 3 });
    assert.equal(depth1.meta.depth, 1);
    assert.equal(depth3.meta.depth, 3);
    const product = generate('T-cs-quad', 'knob', { shape: 'product' });
    const ratio = generate('T-cs-quad', 'knob', { shape: 'ratio' });
    assert.equal(product.meta.bothValid, true);
    assert.equal(ratio.meta.bothValid, false);
    for (const frame of T07A_FRAMES) {
      assert.equal(generate('T-cs-lin', 'knob', { frame }).meta.frame, frame, `frame ${frame} cannot be forced`);
    }
  });
});
/* === /T07a === */
