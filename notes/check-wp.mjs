// T06c verifier (dev-only, not served): solves every wp-* canonical equation with site/js/grader/poly.js
// and matches the stored answers against content/SOURCE.md §3 and content/transcript.md. Prints
// `FLAG: …` on any teacher-vs-solver disagreement (never edited away — COMPOSED Global rule 5) and
// `ERR: …` on any structural defect. Exit 0 only when both lists are empty.
//   node /Users/oliver/Projects/unit1a-quest/notes/check-wp.mjs
// tests/teacher-flag.test.mjs (T06f) can lift the `solveCanonical` / `derive` / `chain` helpers verbatim.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = (p) => `${ROOT}/site/${p}`;

const { cards, WP_INSTRUCTION } = await import(site('data/cards/wp.js'));
const { byId: allById } = await import(site('data/cards.js'));
const { moduleById, moduleOf } = await import(site('data/modules.js'));
const { sheetById, sheetOf } = await import(site('data/sheets.js'));
const { skillById } = await import(site('data/skills.js'));
const { isKnownTag } = await import(site('data/misconceptions.js'));
const P = await import(site('js/grader/poly.js'));
const N = await import(site('js/grader/normalize.js'));

const flags = [];
const errs = [];
const FLAG = (m) => flags.push(`FLAG: ${m}`);
const ERR = (m) => errs.push(`ERR: ${m}`);
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) ERR(msg); };

// ---------------------------------------------------------------------------------------------
// Oracles: SOURCE.md §3 re-typed (teacher's answers, never altered) + transcript blocks (wording).
const TEACHER = {
  'wp-01': ['17', '73'], 'wp-02': ['52', '128'], 'wp-03': ['12', '78'], 'wp-04': ['62'], 'wp-05': ['15'],
  'wp-06': ['154'], 'wp-07': ['111.5'], 'wp-08': ['93.5'], 'wp-09': ['33', '57'], 'wp-10': ['3:2'],
  'wp-11': ['144'], 'wp-12': ['176'], 'wp-13': ['143'], 'wp-14': ['134'], 'wp-15': ['62'], 'wp-16': ['76'],
};
const TEACHER_X = { // the x the teacher's key reaches (SOURCE §3 brackets / the key pages)
  'wp-01': ['17'], 'wp-02': ['52'], 'wp-03': ['12'], 'wp-04': ['62'], 'wp-05': ['75'], 'wp-06': ['26'],
  'wp-07': ['21.5'], 'wp-08': ['86.5'], 'wp-09': ['33'], 'wp-10': ['54'], 'wp-11': ['54'], 'wp-12': ['86', '4'],
  'wp-13': ['37'], 'wp-14': ['44'], 'wp-15': ['28'], 'wp-16': ['14'],
};
// What the two angles of the pair are, in terms of the canonical's x (for smaller / larger).
const PAIR = { 'wp-04': 'comp', 'wp-05': 'supp', 'wp-06': 'comp', 'wp-08': 'supp', 'wp-09': 'comp', 'wp-12': 'roots' };

const transcript = readFileSync(`${ROOT}/content/transcript.md`, 'utf8');
const blocks = {};
for (const m of transcript.matchAll(/^### (wp-\d\d)\n([\s\S]*?)(?=\n### |\n---)/gm)) {
  const fields = {};
  for (const line of m[2].split('\n')) {
    const f = /^- (\w+): (.*)$/.exec(line);
    if (f) fields[f[1]] = f[2];
  }
  blocks[m[1]] = fields;
}
const instrLine = /Instruction printed above the list \(two paragraphs\): "(.*?)" \/ "(.*?)" \(no final period/.exec(transcript);

// ---------------------------------------------------------------------------------------------
// Solver helpers over poly.js
const num = (s) => { const r = N.parseNumber(String(s)); if (!r.ok) throw new Error(`bad number ${s}: ${r.msg}`); return N.toNumber(r.value); };
const fmt = (v) => (typeof v === 'number' ? String(+v.toFixed(6)) : P.ratToString(v));
const same = (a, b) => N.numEquals(a, b, 1e-9);

/** roots of LHS − RHS = 0 for a canonical string (or "LHS = RHS" text) → number[] (sorted), or null if unsolvable */
function solveCanonical(text) {
  const sides = String(text).split('=');
  if (sides.length > 2) throw new Error(`too many = in ${text}`);
  const parse = (s) => { const r = P.parseRational(s, { var: 'x' }); if (!r.ok) throw new Error(`${s}: ${r.err} ${r.msg}`); return r; };
  let rf = parse(sides[0]);
  if (sides.length === 2) rf = P.ratFunSub(rf, parse(sides[1]));
  const n = rf.num;
  const deg = P.polyDegree(n);
  if (deg === 1) return [P.ratToNumber(P.solveLinear(n))];
  if (deg === 2) { const s = P.solveQuadratic(n); return s.roots.map((r) => (typeof r === 'number' ? r : P.ratToNumber(r))).sort((a, b) => a - b); }
  return null; // degenerate (deg 0 / −1 / > 2)
}
function canonicalPoly(text) {
  const sides = String(text).split('=');
  const parse = (s) => P.parseRational(s, { var: 'x' });
  let rf = parse(sides[0]);
  if (!rf.ok) return null;
  if (sides.length === 2) { const r = parse(sides[1]); if (!r.ok) return null; rf = P.ratFunSub(rf, r); }
  return P.polyIsZero(rf.num) ? rf.num : P.polyCanonical(rf.num);
}

/** named quantities for a card given its solved x (numbers) */
function derive(id, roots) {
  const x = roots[0];
  const q = { angle: x, comp: 90 - x, supp: 180 - x };
  const pair = PAIR[id];
  if (pair === 'comp') [q.smaller, q.larger] = [Math.min(x, 90 - x), Math.max(x, 90 - x)];
  else if (pair === 'supp') [q.smaller, q.larger] = [Math.min(x, 180 - x), Math.max(x, 180 - x)];
  else if (pair === 'roots') [q.smaller, q.larger] = [Math.min(...roots), Math.max(...roots)];
  return q;
}
function chain(q, asks) {
  let v = q[asks[0]];
  if (v === undefined) throw new Error(`asks[0] "${asks[0]}" not derivable`);
  for (const step of asks.slice(1)) {
    if (step === 'comp') v = 90 - v;
    else if (step === 'supp') v = 180 - v;
    else throw new Error(`unknown chain step ${step}`);
  }
  return v;
}
const reduceRatio = (a, b) => { const g = N.gcd(a, b); return `${a / g}:${b / g}`; };

// ---------------------------------------------------------------------------------------------
ok(Array.isArray(cards) && cards.length === 16, `expected 16 cards, got ${cards?.length}`);
ok(JSON.stringify(cards.map((c) => c.id)) === JSON.stringify(sheetById.WP.ids), 'ids ≠ sheets.js WP order');
ok(instrLine && WP_INSTRUCTION === `${instrLine[1]}\n${instrLine[2]}`, 'WP_INSTRUCTION ≠ transcript instruction');

const numToken = (s, v) => new RegExp(`(^|[^\\d.])${String(v).replace('.', '\\.')}(?![\\d])`).test(s);

for (const c of cards) {
  const id = c.id;
  const t = blocks[id];
  ok(t, `${id}: no transcript block`);
  if (t) {
    ok(c.stem === t.stem, `${id}: stem ≠ transcript`);
    ok(c.srcFile === t.srcFile, `${id}: srcFile ≠ transcript (${c.srcFile})`);
    const ta = t.teacherAnswer.replace(/°/g, '').split(/,\s*/);
    ok(JSON.stringify(ta) === JSON.stringify(TEACHER[id]), `${id}: transcript teacherAnswer ${t.teacherAnswer} ≠ SOURCE oracle ${TEACHER[id]}`);
  }
  // structure
  for (const k of ['id', 'module', 'sheet', 'src', 'srcFile', 'tier', 'par', 'skills', 'needs', 'stem', 'parts', 'hints', 'solution', 'misconceptions', 'instruction', 'setupKey'])
    ok(c[k] !== undefined, `${id}: missing ${k}`);
  ok(c.sheet === 'WP' && sheetOf(id) === 'WP', `${id}: sheet`);
  ok(moduleOf(id) === c.module, `${id}: module ${c.module} ≠ modules.js ${moduleOf(id)}`);
  ok(moduleById[c.module].originals.includes(id), `${id}: not in ${c.module}.originals`);
  if (c.module === 'M4') {
    const room = moduleById.M4.rooms.find((r) => r.ids.includes(id));
    ok(room && room.id === c.room, `${id}: room ${c.room} ≠ modules.js ${room?.id}`);
    ok(c.skills[0] === (c.room === 'ratio' ? 'CS-RATIO' : 'CS-LIN'), `${id}: skill ${c.skills[0]} for room ${c.room}`);
  } else {
    ok(c.module === 'M5' && c.room === null && c.skills[0] === 'CS-QUAD' && c.tier === 3 && c.needs.includes('QUAD-SOLVE'), `${id}: M5 shape`);
  }
  for (const s of c.skills) ok(skillById[s], `${id}: unknown skill ${s}`);
  ok(id === 'wp-12' ? c.tier === 3 : c.tier === 2, `${id}: tier ${c.tier}`);
  ok(c.par > 0, `${id}: par`);
  ok(c.figure === null, `${id}: figure must be null`);
  ok(c.verified === true, `${id}: verified`);
  ok(!('teacherKey' in c) && !('orig' in c) && !('crop' in c), `${id}: scan field present (BUILD-POLICY §1)`);
  ok(c.hints.length === 3 && c.hints.every((h) => typeof h === 'string' && h.length > 20), `${id}: hints[3]`);
  ok(c.solution.length >= 5 && c.solution.every((s) => typeof s.say === 'string' && typeof s.math === 'string' && s.say && s.math), `${id}: solution shape`);
  ok(allById[id] === c, `${id}: cards.js byId does not resolve to this card`);
  for (const s of [c.stem, ...c.hints, ...c.solution.flatMap((x) => [x.say, x.math])]) ok(!/[{}]/.test(s), `${id}: stray brace in "${s}"`);
  ok(!/TODO|TBD|FIXME|lorem|placeholder/i.test(JSON.stringify(c)), `${id}: placeholder text`);

  // parts
  const partIds = new Set();
  const setup = c.parts[0];
  ok(setup && setup.type === 'equation' && setup.id === 'setup', `${id}: parts[0] must be the equation`);
  for (const p of c.parts) { ok(!partIds.has(p.id), `${id}: duplicate part id ${p.id}`); partIds.add(p.id); }
  const answerParts = c.parts.slice(1);
  ok(answerParts.length >= 1, `${id}: no answer part`);

  // --- the canonical equation, solved with poly.js
  ok(setup.var === 'x' && Array.isArray(setup.mustMention) && setup.mustMention.length && Array.isArray(setup.roots) && setup.roots.length, `${id}: equation shape`);
  for (const m of setup.mustMention) ok(new RegExp(`(^|[^\\d])${m}(?![\\d])`).test(setup.canonical), `${id}: canonical does not mention ${m}`);
  ok(typeof setup.text === 'string' && setup.text.includes('='), `${id}: equation.text`);
  let roots;
  try { roots = solveCanonical(setup.canonical); } catch (e) { ERR(`${id}: canonical does not parse: ${e.message}`); continue; }
  ok(roots && roots.length === setup.roots.length, `${id}: canonical solved to ${roots} vs stored roots ${setup.roots}`);
  if (roots) {
    const stored = setup.roots.map(num).sort((a, b) => a - b);
    ok(stored.every((r, i) => same(r, roots[i])), `${id}: stored roots ${setup.roots} ≠ solver ${roots.map(fmt)}`);
    const tx = TEACHER_X[id].map(num).sort((a, b) => a - b);
    if (!(tx.length === roots.length && tx.every((r, i) => same(r, roots[i])))) FLAG(`${id} x: teacher=${TEACHER_X[id]} solver=${roots.map(fmt)}`);
  }
  const canonPoly = canonicalPoly(setup.canonical);
  for (const a of setup.alternates ?? []) {
    let ar;
    try { ar = solveCanonical(a.canonical); } catch (e) { ERR(`${id}: alternate ${a.canonical} does not parse: ${e.message}`); continue; }
    const st = a.roots.map(num).sort((x, y) => x - y);
    ok(ar && ar.length === st.length && st.every((r, i) => same(r, ar[i])), `${id}: alternate ${a.canonical} solves to ${ar?.map(fmt)} ≠ ${a.roots}`);
    for (const m of a.mustMention) ok(new RegExp(`(^|[^\\d])${m}(?![\\d])`).test(a.canonical), `${id}: alternate ${a.canonical} does not mention ${m}`);
    ok(typeof a.means === 'string' && a.means.length > 5 && typeof a.text === 'string', `${id}: alternate ${a.canonical} needs means/text`);
  }

  // --- derived quantities → answer parts
  if (!roots) continue;
  const q = derive(id, roots);
  const finals = [];   // the teacher's final answers (num / multi / ratio parts)
  const guarded = []; // every graded value (finals + roots) that hints must never state
  const finalsOf = {};
  const addFinal = (pid, v, final = true) => { if (final) finals.push(v); guarded.push(v); (finalsOf[pid] ??= []).push(v); };
  for (const p of answerParts) {
    if (p.type === 'num') {
      ok(Array.isArray(p.asks) && p.asks.length >= 1, `${id}/${p.id}: asks`);
      ok(p.distractors && typeof p.distractors === 'object', `${id}/${p.id}: distractors object`);
      let v;
      try { v = chain(q, p.asks); } catch (e) { ERR(`${id}/${p.id}: ${e.message}`); continue; }
      ok(same(num(p.answer), v), `${id}/${p.id}: stored answer ${p.answer} ≠ solver ${fmt(v)} via ${p.asks}`);
      addFinal(p.id, p.answer);
      // every chain intermediate must be a named distractor (S8 #6c acceptance)
      let cur = q[p.asks[0]];
      const inter = [[p.asks[0], cur]];
      for (const step of p.asks.slice(1)) { cur = step === 'comp' ? 90 - cur : 180 - cur; inter.push([step, cur]); }
      inter.pop(); // the last one is the answer itself
      for (const [name, val] of inter) {
        const hit = Object.entries(p.distractors).find(([, d]) => same(num(d), val));
        ok(hit, `${id}/${p.id}: intermediate ${name}=${fmt(val)} missing from distractors`);
      }
      for (const [k, d] of Object.entries(p.distractors)) {
        ok(q[k] !== undefined, `${id}/${p.id}: distractor key ${k} is not a derivable quantity`);
        if (q[k] !== undefined) ok(same(num(d), q[k]), `${id}/${p.id}: distractor ${k}=${d} ≠ solver ${fmt(q[k])}`);
        ok(!same(num(d), num(p.answer)), `${id}/${p.id}: distractor ${k} equals the answer`);
      }
      if (p.of) ok(c.parts.some((x) => x.id === p.of && x.type === 'roots'), `${id}/${p.id}: of=${p.of} is not a roots part`);
    } else if (p.type === 'multi') {
      ok(Array.isArray(p.fields) && p.fields.length === 2, `${id}/${p.id}: fields`);
      const want = p.orderFree ? [q.smaller, q.larger] : p.fields.map((f) => q[f.key]);
      const got = p.fields.map((f) => num(f.answer));
      if (p.orderFree) got.sort((a, b) => a - b);
      ok(want.every((w, i) => w !== undefined && same(w, got[i])), `${id}/${p.id}: fields ${p.fields.map((f) => f.answer)} ≠ solver ${want.map(fmt)}`);
      for (const f of p.fields) {
        ok(f.key && f.label && typeof f.answer === 'string', `${id}/${p.id}: field shape`);
        addFinal(p.id, f.answer);
        if (!p.orderFree) {
          ok(Array.isArray(f.asks) && f.asks.length === 1 && f.asks[0] === f.key, `${id}/${p.id}/${f.key}: asks should be ['${f.key}']`);
          ok(f.distractors && typeof f.distractors === 'object', `${id}/${p.id}/${f.key}: distractors`);
          for (const [k, d] of Object.entries(f.distractors ?? {})) {
            ok(q[k] !== undefined && same(num(d), q[k]), `${id}/${p.id}/${f.key}: distractor ${k}=${d} ≠ solver ${fmt(q[k])}`);
            ok(!same(num(d), num(f.answer)), `${id}/${p.id}/${f.key}: distractor ${k} equals the field answer`);
          }
          // every other field's answer is a named distractor here (field-swap diagnosis has a name)
          for (const g of p.fields) if (g.key !== f.key) ok(Object.values(f.distractors ?? {}).some((d) => same(num(d), num(g.answer))), `${id}/${p.id}/${f.key}: sibling ${g.key}'s answer is not a named distractor`);
        }
      }
    } else if (p.type === 'ratio') {
      const want = reduceRatio(q.angle, q.comp);
      ok(p.answer === want, `${id}/${p.id}: ratio ${p.answer} ≠ solver ${want}`);
      addFinal(p.id, p.answer);
    } else if (p.type === 'roots') {
      ok(p.var === 'x' && Array.isArray(p.answer) && p.answer.length === roots.length, `${id}/${p.id}: roots shape`);
      const st = p.answer.map(num).sort((a, b) => a - b);
      ok(st.every((r, i) => same(r, roots[i])), `${id}/${p.id}: roots ${p.answer} ≠ solver ${roots.map(fmt)}`);
      for (const r of p.answer) addFinal(p.id, r, false);
      const posAngles = roots.every((r) => r > 0 && 90 - r > 0);
      ok(posAngles, `${id}/${p.id}: a root gives a non-positive angle — needs a reject stage`);
    } else ERR(`${id}/${p.id}: unexpected part type ${p.type}`);
  }
  // teacher vs solver on the final answers
  const teacher = TEACHER[id];
  const mine = finals.slice();
  const eqAns = (a, b) => (a.includes(':') ? a === b : same(num(a), num(b)));
  const sortedT = teacher.slice().sort();
  const sortedM = mine.slice().sort();
  if (!(sortedT.length === sortedM.length && sortedT.every((v, i) => eqAns(v, sortedM[i])))) FLAG(`${id} teacher=${teacher} solver=${mine}`);

  // --- hints never contain a final answer as a number token (H3 is one step from the end, never the answer)
  for (const h of c.hints) for (const f of guarded) if (!f.includes(':')) ok(!numToken(h, f), `${id}: hint contains a graded answer ${f}: "${h}"`);
  // the last solution step must land on the teacher's answer
  const last = c.solution[c.solution.length - 1].math;
  ok(finals.every((f) => last.includes(f.includes(':') ? f : f)), `${id}: last solution step "${last}" does not state ${finals}`);

  // --- misconceptions
  ok(c.misconceptions.length >= 4, `${id}: fewer than 4 misconceptions`);
  for (const m of c.misconceptions) {
    ok(m.part && partIds.has(m.part), `${id}: misconception part ${m.part} unknown`);
    ok(typeof m.msg === 'string' && m.msg.length > 20 && m.msg.length <= 200, `${id}: misconception msg length (${m.answer})`);
    for (const f of finalsOf[m.part] ?? []) if (!f.includes(':')) ok(!numToken(m.msg, f), `${id}: misconception msg states its part's answer ${f}: "${m.msg}"`);
    ok(typeof m.answer === 'string' && m.answer, `${id}: misconception answer`);
    if (m.tag !== undefined) ok(isKnownTag(m.tag), `${id}: uncatalogued tag ${m.tag}`);
    else ok(typeof m.requestedTag === 'string', `${id}: misconception ${m.answer} has neither tag nor requestedTag`);
    const part = c.parts.find((p) => p.id === m.part);
    if (part.type === 'equation') {
      ok('gives' in m, `${id}: equation misconception ${m.answer} lacks gives`);
      let r;
      try { r = solveCanonical(m.answer); } catch (e) { ERR(`${id}: misconception equation "${m.answer}" does not parse: ${e.message}`); continue; }
      if (m.gives === null) ok(r === null || r.length === 0 || r.length > 1, `${id}: "${m.answer}" gives ${r?.map(fmt)} but data says null`);
      else ok(r && r.length === 1 && same(r[0], num(m.gives)), `${id}: "${m.answer}" gives ${r?.map(fmt)} ≠ ${m.gives}`);
      // must not be equivalent to the canonical or any alternate (it would tag a correct setup)
      const mp = canonicalPoly(m.answer);
      const equivs = [setup.canonical, ...(setup.alternates ?? []).map((a) => a.canonical)].map(canonicalPoly);
      ok(mp && !equivs.some((e) => e && P.polyEquals(e, mp)), `${id}: misconception equation "${m.answer}" is equivalent to a correct setup`);
    } else if (part.type === 'multi') {
      // multi.js (T03) today: orderFree matches only field-scoped entries, non-orderFree only part-level ones (see notes/T06c.md)
      if (part.orderFree) ok(m.field && part.fields.some((f) => f.key === m.field), `${id}: orderFree multi misconception ${m.answer} needs a known field`);
      else ok(m.field === undefined, `${id}: non-orderFree multi misconception ${m.answer} must be part-level (no field)`);
      const f = m.field ? part.fields.find((x) => x.key === m.field) : null;
      if (f) ok(!same(num(m.answer), num(f.answer)), `${id}: misconception ${m.answer} equals the field answer`);
      else ok(!part.fields.some((x) => same(num(x.answer), num(m.answer))), `${id}: misconception ${m.answer} equals a field answer`);
    } else if (part.type === 'num') {
      ok(!same(num(m.answer), num(part.answer)), `${id}: misconception ${m.answer} equals the answer`);
    } else if (part.type === 'roots') {
      ERR(`${id}: no misconceptions on a roots part — the roots grader's subset path is a free almost and never reveals the other root (S3)`);
    } else if (part.type === 'ratio') {
      ok(m.answer !== part.answer, `${id}: misconception ${m.answer} equals the answer`);
    }
  }
}

// no duplicate ids across the whole deck, every wp id resolves
for (const c of cards) ok(allById[c.id]?.id === c.id, `${c.id}: not in cards.js byId`);
const dupes = Object.values(allById).length;
ok(dupes >= 16, 'cards.js byId lost cards');

// file-level guards
const src = readFileSync(site('data/cards/wp.js'), 'utf8');
ok(!/Math\.random/.test(src), 'Math.random in wp.js');
ok(!/^import /m.test(src), 'wp.js must import nothing');
ok(!/\.png|teacherKey|orig:|crop/.test(src), 'scan reference in wp.js');
ok(!/\btag\s*[:=]\s*(['"`])[^'"`]*\1/.test(src.replace(/tag: '[a-z0-9-]+'/g, '')), 'unexpected tag literal form');

console.log(`${checks} checks; ${errs.length} errors; ${flags.length} flags`);
for (const l of [...flags, ...errs]) console.log(l);
process.exitCode = flags.length || errs.length ? 1 : 0;
