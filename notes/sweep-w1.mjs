// notes/sweep-w1.mjs — Wave-1 integration sweep (dev-only, NOT served; same convention as
// notes/check-wp.mjs and notes/verify-t06b.mjs). Run:  node notes/sweep-w1.mjs
//
// Covers the one gap the per-ticket suites leave: T05's word graders × T06a/T06b/T06d/T06e content.
// tests/golden.test.mjs already round-trips every NUMERIC part of every card; nothing round-tripped
// the 193 asn / mc / term / termmatch / cloze / classify / notation parts, so a content ↔ grader
// contract drift there (a renamed field, a changed answer shape) would only surface in T09's screens.
// T06f: lift this into coverage.test.mjs; T17: fold it into the consolidated suite.
import * as I from '../site/js/grader/index.js';
import { cards } from '../site/data/cards.js';
import { layout } from '../site/js/grader/termmatch.js';
import { resolve, validate } from '../site/js/figure/model.js';
import { lint, renderModel } from '../site/js/figure/svg.js';
import { figures } from '../site/data/figures.js';

await I.ready;
let fails = 0;
const FAIL = (...a) => { fails++; console.log('FAIL:', ...a); };

// ---- 1. every word-grader part grades its own authored answer as `correct` ----------------------
const correctRaw = (part) => {
  switch (part.type) {
    case 'mc':       return part.answer;
    case 'term':     return (part.answers ?? [part.answer])[0];
    case 'asn':      return part.answer;
    case 'classify': return part.answer;
    case 'notation': return part.sides ? { kind: part.kind, sides: part.sides } : { kind: part.kind, pts: part.pts };
    case 'cloze':    return part.blanks.map((b) => (b.answers ? b.answers[0] : b.answer));
    case 'termmatch': { const o = {}; for (const p of part.pairs) o[p.term] = p.def; return o; }
    default: return undefined;
  }
};
let swept = 0;
for (const c of cards) for (const part of c.parts) {
  const raw = correctRaw(part);
  if (raw === undefined) continue;
  swept++;
  let r;
  try { r = I.grade(part, raw, { card: c, seed: part.id ?? c.id }); }
  catch (e) { FAIL(c.id, part.type, part.id, 'threw', e.message); continue; }
  if (r.kind !== 'correct' || r.ok !== true) FAIL(c.id, part.type, part.id, r.kind, '|', (r.msg || '').slice(0, 90));
}
console.log(`word-grader parts swept: ${swept}`);

// ---- 2. every part type in the content has a registered grader ----------------------------------
const types = new Set(cards.flatMap((c) => c.parts.map((p) => p.type)));
for (const t of types) if (!I.has(t)) FAIL('no grader registered for part type', t);
if (I.missing.length) FAIL('dispatcher could not load', JSON.stringify(I.missing));
console.log(`part types in content: ${[...types].sort().join(' ')}`);

// ---- 3. termmatch layouts are deterministic per seed (no Math.random anywhere) -------------------
for (const c of cards) for (const p of c.parts.filter((x) => x.type === 'termmatch')) {
  const seed = p.id ?? c.id;
  if (JSON.stringify(layout(p, seed)) !== JSON.stringify(layout(p, seed))) FAIL('termmatch layout not deterministic', c.id);
}

// ---- 4. every card figure resolves, validates, lints clean at 343 px and renders -----------------
let figs = 0;
for (const c of cards) {
  if (!c.figure) continue;
  figs++;
  const spec = typeof c.figure === 'string' ? { id: c.figure } : c.figure;
  const base = figures[spec.id];
  if (!base) { FAIL(c.id, 'unknown figure id', spec.id); continue; }
  const m = resolve(base, spec);
  const v = validate(m), l = lint(m, { width: 343 });
  if (v.length) FAIL(c.id, spec.id, 'validate', JSON.stringify(v));
  if (l.length) FAIL(c.id, spec.id, 'lint', JSON.stringify(l));
  const svg = renderModel(m, { width: 343 });
  if (typeof svg !== 'string' || !svg.startsWith('<svg')) FAIL(c.id, spec.id, 'renderModel produced no svg');
}
console.log(`figure cards checked: ${figs}`);

// ---- 5. deck integrity --------------------------------------------------------------------------
const ids = cards.map((c) => c.id);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) FAIL('duplicate card ids', dup.join(' '));
for (const c of cards) if (!Array.isArray(c.parts) || !c.parts.length) FAIL(c.id, 'has no parts');

console.log(fails ? `\n${fails} FAILURE(S)` : `\nall clean — ${cards.length} cards`);
process.exit(fails ? 1 : 0);
