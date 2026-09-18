// fix5-gen.test.mjs — fix5 lane "gen" (bug 2: placement item 1 said "labelled in the figure" with no figure).
// See notes/FIX5-gen.md. T-notation (templateVersion 2) now carries a real mini-figure whenever its stem
// names one; `read` items and a plane named by one letter need no picture and no longer mention a figure.
// The figure engine changes are ADDITIVE (optional poly fields `arrows`, `labelDirs`, `outline`,
// `letterSize`): every shipped figure renders byte-for-byte as before (hashes pinned below).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generate, getTemplate, modelOf } from '../site/data/templates.js';
import { grade, ready } from '../site/js/grader/index.js';
import { validate, measure, accidentalSums, resolve } from '../site/js/figure/model.js';
import { lint, layout, renderModel, VIEW } from '../site/js/figure/svg.js';
import { figures } from '../site/data/figures.js';
import { cyrb53 } from '../site/js/rng.js';

const SEEDS = 2000;
const KINDS = ['ray', 'line', 'seg', 'len', 'ang', 'm', 'plane', 'cong', 'eq', 'read'];

const dist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** index of the drawn chain joining exactly {p, q}, or -1 */
function chainOf(spec, p, q) {
  return spec.segments.findIndex((ch) => ch.length === 2 && sameSet(ch, [p, q]));
}

/** The drawn strokes (arrow run-ons included) that belong to the named object. */
function objectStrokes(L, letters) {
  return L.strokes.filter((s) => s.chain.every((n) => letters.includes(n))).map((s) => [s.from, s.to]);
}

function inside(poly, [x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Every geometric promise the stem makes is true of the drawing; returns a list of problems. */
function geometryProblems(item) {
  const bad = [];
  const f = item.figure;
  const spec = f.spec;
  const m = modelOf(item);
  const L = layout(m);
  const ans = item.params.answer;
  const pts = item.params.points;
  if (!sameSet(Object.keys(spec.points), pts)) bad.push(`drawn points ${Object.keys(spec.points)} ≠ stem points ${pts}`);
  for (const p of pts) if (!item.stem.includes(p)) bad.push(`stem does not list ${p}`);

  const angleOk = ([x, v, y]) => {
    for (const end of [x, y]) {
      const i = spec.segments.findIndex((ch) => ch[0] === v && ch[1] === end && ch.length === 2);
      if (i < 0) bad.push(`no side from ${v} through ${end}`);
      else if (spec.arrows[i] !== 'end') bad.push(`side ${v}${end} is not drawn as a ray from ${v}`);
    }
    const deg = measure(m, x, y, v);
    if (!(deg > 20 && deg < 160)) bad.push(`∠${x}${v}${y} measures ${deg}`);
    return deg;
  };
  let named = [];
  switch (ans.kind) {
    case 'ray': {
      const [a, b] = ans.pts;
      const i = spec.segments.findIndex((ch) => ch.length === 2 && ch[0] === a && ch[1] === b);
      if (i < 0) bad.push(`ray ${a}${b}: no chain starting at ${a} through ${b}`);
      else if (spec.arrows[i] !== 'end') bad.push(`ray ${a}${b} drawn as ${spec.arrows[i]}`);
      named = [a, b];
      break;
    }
    case 'line': case 'seg': case 'len': {
      const [a, b] = ans.pts;
      const i = chainOf(spec, a, b);
      const want = ans.kind === 'line' ? 'both' : 'none';
      if (i < 0) bad.push(`${ans.kind} ${a}${b}: not drawn`);
      else if (spec.arrows[i] !== want) bad.push(`${ans.kind} ${a}${b} drawn with arrows ${spec.arrows[i]}`);
      named = [a, b];
      break;
    }
    case 'ang': case 'm':
      angleOk(ans.pts); named = ans.pts;
      break;
    case 'plane': {
      if (!Array.isArray(spec.outline)) { bad.push('plane item without an outline'); break; }
      for (const p of ans.pts) if (!inside(spec.outline, spec.points[p])) bad.push(`${p} is not inside the plane`);
      for (const p of pts.filter((q) => !ans.pts.includes(q))) if (inside(spec.outline, spec.points[p])) bad.push(`extra point ${p} sits inside the plane`);
      const [A, B, C] = ans.pts.map((p) => spec.points[p]);
      const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2;
      if (area < 1500) bad.push(`plane points nearly collinear (area ${area})`);
      named = ans.pts;
      break;
    }
    case 'cong': case 'eq': break;   // both angles checked below
    default: bad.push(`unexpected answer kind ${ans.kind}`);
  }
  if (item.params.kind === 'cong' || item.params.kind === 'eq') {
    const sides = item.parts[0].sides;
    const d1 = angleOk(sides[0].pts), d2 = angleOk(sides[1].pts);
    if (Math.abs(d1 - d2) > 0.5) bad.push(`the two angles differ: ${d1} vs ${d2}`);
    named = [...sides[0].pts, ...sides[1].pts];
  }
  // no OTHER letter lies on the named object's strokes — so it has no second name (ray AX for ray AB)
  if (ans.kind !== 'plane') {
    const strokes = objectStrokes(L, named);
    for (const p of pts.filter((q) => !named.includes(q))) {
      if (strokes.some(([a, b]) => dist(spec.points[p], a, b) < 20)) bad.push(`${p} lies on the named object`);
    }
  }
  // every stroke (arrowheads included) inside the viewBox
  for (const s of L.strokes) for (const q of [s.from, s.to]) {
    if (q[0] < 6 || q[1] < 6 || q[0] > VIEW.w - 6 || q[1] > VIEW.h - 6) bad.push(`stroke ${s.names.join('')} leaves the viewBox`);
  }
  return bad;
}

function checkItem(item, where) {
  assert.equal(item.templateVersion, 2, `${where}: T-notation templateVersion`);
  const mentions = /figure/i.test(item.stem) || /figure/i.test(item.prompt);
  if (!item.figure) {
    assert.ok(!/labelled in the figure/i.test(item.stem), `${where}: stem claims a figure but figure is null: ${item.stem}`);
    assert.ok(!mentions, `${where}: a figure-less stem mentions a figure: ${item.stem}`);
    const single = item.params.answer.kind === 'plane' && item.params.answer.pts?.length === 1;
    assert.ok(item.params.kind === 'read' || single, `${where}: only read items and one-letter planes go without a figure (got ${item.params.kind})`);
    return;
  }
  assert.match(item.stem, /labelled in the figure/, `${where}: a figure item names its figure`);
  const f = item.figure;
  assert.match(f.id, /^G-not-/, `${where}: generated figure id`);
  assert.equal(f.spec.id, f.id);
  assert.equal(f.spec.kind, 'poly');
  const m = modelOf(item);
  assert.deepEqual(validate(m), [], `${where}: validate()`);
  assert.deepEqual(lint(m, { widthPx: 343 }), [], `${where}: lint() at 343 px (375 phone)`);
  assert.deepEqual(accidentalSums(m), [], `${where}: accidental sums`);
  assert.deepEqual(geometryProblems(item), [], `${where}: geometry`);
  const letters = item.parts[0].letters;
  if (letters) for (const p of item.params.points) assert.ok(letters.includes(p), `${where}: builder offers ${p}`);
}

test('fix5:gen — T-notation: 2000 seeds, a figure exactly when the stem names one, clean and consistent', () => {
  let withFig = 0;
  for (let i = 0; i < SEEDS; i++) {
    const item = generate('T-notation', `fix5-${i}`);
    checkItem(item, `T-notation seed fix5-${i}`);
    if (item.figure) withFig++;
  }
  assert.ok(withFig > SEEDS * 0.7, `most items draw a figure (${withFig}/${SEEDS})`);
});

test('fix5:gen — T-notation: every kind forced, 250 seeds each', () => {
  for (const kind of KINDS) {
    let figs = 0;
    for (let i = 0; i < 250; i++) {
      const item = generate('T-notation', `fix5-${kind}-${i}`, { kind });
      assert.equal(item.params.kind, kind);
      checkItem(item, `T-notation ${kind} seed ${i}`);
      if (item.figure) figs++;
    }
    if (kind === 'read') assert.equal(figs, 0, 'a read item needs no figure');
    else if (kind === 'plane') assert.ok(figs > 50 && figs < 250, `planes: three-point ones draw, one-letter ones do not (${figs})`);
    else assert.equal(figs, 250, `${kind}: every item draws its figure`);
  }
});

test('fix5:gen — placement item 1 (kind ray) always shows the ray it asks about', () => {
  for (let i = 0; i < 400; i++) {
    const item = generate('T-notation', `p${i}-pl-notation`, { kind: 'ray' });
    assert.ok(item.figure, 'placement item 1 has a figure');
    checkItem(item, `placement seed ${i}`);
  }
});

test('fix5:gen — grading is unchanged with the figure present (own build correct, reversed ray wrong)', async () => {
  await ready;
  let rays = 0;
  for (let i = 0; i < 300; i++) {
    const item = generate('T-notation', `fix5-grade-${i}`);
    const p = item.parts[0];
    const ctx = { state: {}, model: item.figure ? modelOf(item) : null, figure: item.figure ?? null, card: item, misconceptions: item.misconceptions };
    const own = p.type === 'mc' ? p.answer : p.sides ? { kind: p.kind, sides: p.sides } : { kind: p.kind, pts: p.pts };
    assert.equal(grade(p, own, ctx).kind, 'correct', `seed ${i}: own answer`);
    if (p.type === 'notation' && p.kind === 'ray') {
      rays++;
      const r = grade(p, { kind: 'ray', pts: [p.pts[1], p.pts[0]] }, ctx);
      assert.equal(r.kind, 'wrong');
      assert.ok(r.tags.includes('ray-order'));
    }
  }
  assert.ok(rays > 20);
});

test('fix5:gen — a one-letter plane offers its letter on the builder even when it is not a point', () => {
  let seen = 0;
  for (let i = 0; i < 400 && seen < 30; i++) {
    const item = generate('T-notation', `fix5-plane1-${i}`, { kind: 'plane' });
    const p = item.parts[0];
    if (p.pts.length !== 1) continue;
    seen++;
    assert.ok(p.letters.includes(p.pts[0]), `plane ${p.pts[0]} is tappable`);
    assert.equal(item.figure, null);
    assert.equal(item.stem, `Write the name of the plane called ${p.pts[0]}.`);
  }
  assert.ok(seen >= 10);
});

test('fix5:gen — T-vocab: 2000 seeds, no stem or prompt mentions a figure (none is drawn)', () => {
  for (let i = 0; i < SEEDS; i++) {
    const item = generate('T-vocab', `fix5-v-${i}`);
    assert.equal(item.figure, null);
    for (const s of [item.stem, item.prompt, ...item.parts.map((p) => p.prompt ?? '')]) {
      assert.ok(!/in the figure|labelled/i.test(s), `T-vocab seed ${i}: ${s}`);
    }
  }
});

test('fix5:gen — registry: T-notation is templateVersion 2 (frozen v1 Variants are not re-rendered as v2)', () => {
  assert.equal(getTemplate('T-notation').version, 2);
});

test('fix5:gen — engine additions are additive: shipped figures render byte-identically', () => {
  // hashes of renderModel(resolve(fig)) taken from the pre-fix5 engine (git HEAD 2a6473d).
  // fix:B3 re-pinned PINNED on purpose: the wedge HIT path `d` is now solved per wedge (svg.js
  // hitRegion) so every angle clears 44 px at the narrowest width the app hosts a figure at. That is
  // the ONLY byte that moved — DRAWN below hashes the same render with every `.fig-wedge-hit` d
  // attribute deleted, and restoring the old chord-rule hit paths reproduces the old PINNED hashes
  // exactly (F1 3716098328355016, D5 6272278498943874, D7 129767291472064, AH 1607330075836753), so
  // DRAWN is unchanged across the two engines and still guards the drawing byte for byte.
  const PINNED = { F1: 2514740568436452, F2: 3189115956126985, D5: 8062558523076200, D7: 6895890701291192, AH: 5637006910134116 };
  const DRAWN = { F1: 5344008596219835, F2: 3189115956126985, D5: 5198328228572873, D7: 2445588097790338, AH: 1464030235533859 };
  // \s before d= on purpose: aria-pressed="false" ends in d="…" and a lazy match would eat that instead
  const strip = (svg) => svg.replace(/(<path class="fig-wedge-hit"[^>]*?)\sd="[^"]*"/g, '$1');
  for (const [k, f] of Object.entries(figures)) {
    const svg = renderModel(resolve(f, {}));
    assert.equal(cyrb53(strip(svg)), DRAWN[k], `${k} DRAWING changed (not just the wedge hit path)`);
    assert.equal(cyrb53(svg), PINNED[k], `${k} render changed`);
  }
});

test('fix5:gen — poly optional fields: validate catches bad values; arrows draw rays and lines', () => {
  const base = { id: 'X', kind: 'poly', points: { A: [100, 100], B: [250, 110], C: [120, 200], D: [300, 210] }, segments: [['A', 'B'], ['C', 'D']] };
  assert.deepEqual(validate(resolve({ ...base, arrows: ['end', 'both'], labelDirs: { A: 90 }, letterSize: 21 })), []);
  assert.ok(validate(resolve({ ...base, arrows: ['sideways'] })).length > 0);
  assert.ok(validate(resolve({ ...base, labelDirs: { Z: 90 } })).length > 0);
  assert.ok(validate(resolve({ ...base, letterSize: 99 })).length > 0);
  assert.ok(validate(resolve({ ...base, outline: [[1, 2]] })).length > 0);
  const L = layout(resolve({ ...base, arrows: ['end', 'both'] }));
  assert.equal(L.strokes[0].kind, 'ray');
  assert.equal(L.strokes[0].arrows, 'end');
  assert.deepEqual(L.strokes[0].from, [100, 100], 'a ray starts AT its endpoint');
  assert.ok(L.strokes[0].to[0] > 250, 'and runs past the point it passes through');
  assert.equal(L.strokes[1].kind, 'line');
  assert.ok(L.strokes[1].from[0] < 120 && L.strokes[1].to[0] > 300, 'a line runs past both points');
  const svg = renderModel(resolve({ ...base, arrows: ['end', 'both'], outline: [[20, 20], [380, 20], [380, 240], [20, 240]], letterSize: 21 }));
  assert.match(svg, /class="fig-plane"/);
  assert.match(svg, /marker-end="url\(#fig-X-arrow\)"/);
  assert.match(svg, /style="font-size:21px"/);
});
