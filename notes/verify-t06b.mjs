// notes/verify-t06b.mjs — T06b acceptance check (dev-only, NOT served; delete if unwanted, like notes/check-m1.mjs).
// Recomputes every numeric answer of ang-02..11 / doc-05..07 from the card's own expressions with site/js/grader/poly.js
// (linear + quadratic solves, exact rationals), checks the warm-up teacher pairs through the real pairs grader, validates
// figures (model + lint), strips (validate + a full clear), stems/srcFile byte-equal to content/transcript.md, tags against
// the catalogue, the S1 HP-pip counts. Prints "FLAG: …" on any disagreement and exits 1. Run: node notes/verify-t06b.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');   // repo root (this file lives in notes/)
const P = await import(path.join(ROOT, 'site/js/grader/poly.js'));
const N = await import(path.join(ROOT, 'site/js/grader/normalize.js'));
const M = await import(path.join(ROOT, 'site/js/figure/model.js'));
const S = await import(path.join(ROOT, 'site/js/figure/svg.js'));
const PAIRS = await import(path.join(ROOT, 'site/js/grader/pairs.js'));
const STRIP = await import(path.join(ROOT, 'site/js/grader/strip.js'));
const MF = await import(path.join(ROOT, 'site/js/mathfmt.js'));
const { getFigure } = await import(path.join(ROOT, 'site/data/figures.js'));
const { isKnownTag } = await import(path.join(ROOT, 'site/data/misconceptions.js'));
const { cards: angles } = await import(path.join(ROOT, 'site/data/cards/angles.js'));
const { cards: doc } = await import(path.join(ROOT, 'site/data/cards/doc.js'));
const { cards: all, byId: allById } = await import(path.join(ROOT, 'site/data/cards.js'));
const { skillById } = await import(path.join(ROOT, 'site/data/skills.js'));
const { moduleOf } = await import(path.join(ROOT, 'site/data/modules.js'));
const { sheetOf } = await import(path.join(ROOT, 'site/data/sheets.js'));

const cards = [...angles, ...doc];
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
let flags = 0, checks = 0;
const FLAG = (m) => { flags++; console.log('FLAG: ' + m); };
const ok = (cond, m) => { checks++; if (!cond) FLAG(m); };

// ---------- helpers over poly.js ----------
const R = P.rat;
const num = (s) => N.parseNumber(String(s)).value;                 // Rat | float
const eqv = (a, b) => N.numEquals(a, b, 0.01);
const poly = (expr, v = 'x') => { const r = P.parsePoly(expr, { var: v }); if (!r.ok) throw new Error(`parsePoly(${expr}): ${r.err} ${r.msg}`); return r.poly; };
const ratfun = (expr, v = 'x') => { const r = P.parseRational(expr, { var: v }); if (!r.ok) throw new Error(`parseRational(${expr}): ${r.err}`); return r; };
const evalAt = (expr, x, v = 'x') => P.polyEvalRat(poly(expr, v), x);
const rootsOf = (expr, v = 'x') => {
  const rf = ratfun(expr, v);                       // LHS − RHS as a rational function; roots of its numerator
  const p = rf.num;
  const q = P.solveQuadratic(p);
  if (q.kind === 'two' || q.kind === 'double') return q.roots;
  if (q.kind === 'linear') { const r = P.solveLinear(p); return [r]; }
  throw new Error(`no roots for ${expr}: ${q.kind}`);
};
const sameSet = (got, want) => got.length === want.length && want.every((w) => got.some((g) => eqv(g, w)));
const str = (r) => P.ratToString(r);

// ---------- transcript ----------
const transcript = fs.readFileSync(path.join(ROOT, 'content/transcript.md'), 'utf8');
function block(id) {
  const m = transcript.match(new RegExp(`^### ${id}\\n([\\s\\S]*?)(?=^### |^## |\\n---)`, 'm'));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) { const mm = line.match(/^- ([a-zA-Z]+): (.*)$/); if (mm) out[mm[1]] = mm[2]; }
  return out;
}

// ---------- 1. structure ----------
const S2 = {
  'ang-wu-1': ['pairs'], 'ang-wu-2': ['pairs'], 'ang-wu-3': ['pairs'], 'ang-wu-4': ['pairs'], 'ang-wu-5': ['pairs'],
  'ang-02': ['equation', 'multi'], 'ang-03': ['equation', 'num'], 'ang-04': ['equation', 'roots', 'reject', 'multi'],
  'ang-05': ['equation', 'roots', 'cases', 'strip'], 'ang-06': ['equation', 'multi'], 'ang-07': ['equation', 'multi'],
  'ang-08': ['equation', 'num'], 'ang-09': ['equation', 'roots', 'reject', 'num'], 'ang-10': ['equation', 'roots', 'reject', 'cases'],
  'ang-11': ['equation', 'num'], 'doc-05': ['strip'], 'doc-06': ['equation', 'multi'], 'doc-07': ['equation', 'multi'],
};
const pips = (c) => c.parts.filter((p) => !p.optional).reduce((n, p) => n + (p.type === 'multi' ? p.fields.length : p.type === 'cases' ? p.rows.length : 1), 0);
ok(cards.length === 18, `18 cards, got ${cards.length}`);
ok(new Set(cards.map((c) => c.id)).size === 18, 'ids unique');
for (const c of cards) {
  const b = block(c.id);
  ok(b, `${c.id}: transcript block`);
  if (b) {
    ok(c.stem === b.stem, `${c.id}: stem differs from transcript\n  card: ${c.stem}\n  T00 : ${b.stem}`);
    ok(c.srcFile === b.srcFile, `${c.id}: srcFile differs from transcript (${c.srcFile} vs ${b.srcFile})`);
    ok(c.sheet === b.sheet, `${c.id}: sheet ${c.sheet} vs transcript ${b.sheet}`);
  }
  ok(moduleOf(c.id) === c.module, `${c.id}: module ${c.module} vs modules.js ${moduleOf(c.id)}`);
  ok(sheetOf(c.id) === c.sheet, `${c.id}: sheet ${c.sheet} vs sheets.js ${sheetOf(c.id)}`);
  ok(Array.isArray(c.skills) && c.skills.length && c.skills.every((s) => skillById[s]), `${c.id}: skills ${c.skills}`);
  ok(Array.isArray(c.needs) && c.needs.every((s) => skillById[s]), `${c.id}: needs`);
  ok([1, 2, 3, 4].includes(c.tier) && Number.isInteger(c.par) && c.par > 0, `${c.id}: tier/par`);
  ok(c.hints.length === 3 && c.hints.every((h) => typeof h === 'string' && h.length > 20), `${c.id}: hints[3]`);
  ok(c.solution.length >= 2 && c.solution.every((s) => s.say && s.math), `${c.id}: solution steps`);
  ok(c.verified === true, `${c.id}: verified`);
  ok(c.parts.map((p) => p.type).join(',') === S2[c.id].join(','), `${c.id}: part chain ${c.parts.map((p) => p.type)} ≠ S2 ${S2[c.id]}`);
  ok(new Set(c.parts.map((p) => p.id)).size === c.parts.length, `${c.id}: part ids unique`);
  for (const m of c.misconceptions) {
    ok(isKnownTag(m.tag), `${c.id}: misconception tag ${m.tag} not catalogued`);
    ok(c.parts.some((p) => p.id === m.part), `${c.id}: misconception part ${m.part} unknown`);
    ok(typeof m.msg === 'string' && m.msg.length > 10, `${c.id}: misconception msg`);
  }
  for (const s of [c.stem, ...c.hints, ...c.solution.flatMap((s) => [s.say, s.math]), ...c.misconceptions.map((m) => m.msg)]) {
    ok(!/\{[^}]*\}/.test(MF.stripMarkup(s)), `${c.id}: stray brace after stripMarkup in "${s}"`);
    ok(!/TODO|placeholder|lorem/i.test(s), `${c.id}: placeholder text in "${s}"`);
  }
  const src = fs.readFileSync(path.join(ROOT, c.id.startsWith('doc') ? 'site/data/cards/doc.js' : 'site/data/cards/angles.js'), 'utf8');
  ok(!/teacherKey|\borig\s*:|\bcrop\b/.test(src), `${c.id}: scan identifier in data file`);
  // figures
  if (c.figure) {
    const fig = getFigure(c.figure.id);
    ok(fig, `${c.id}: figure ${c.figure.id} missing`);
    if (fig) {
      const m = M.resolve(fig, c.figure);
      const v = M.validate(m), l = S.lint(m, { widthPx: 343 });
      ok(v.length === 0, `${c.id}: figure validate ${v}`);
      ok(l.length === 0, `${c.id}: figure lint ${l}`);
      const L = S.layout(m);
      ok(L.exprLabels.every((e) => e.fits), `${c.id}: an expression label does not fit`);
      // every wedge referenced by a field / column exists
      const wedges = c.parts.flatMap((p) => [...(p.fields ?? []), ...(p.cols ?? []), ...(p.slots ?? []).flatMap((s) => s.fields ?? [])]).map((f) => f.wedge).filter(Boolean);
      for (const w of wedges) ok(M.getAngle(m, w), `${c.id}: wedge ${w} not an angle of ${c.figure.id}`);
      if (c.id === 'ang-04') ok(L.segLabels.length === 4 && !L.segLabels.some((s) => /19/.test(s.text)), 'ang-04: F2 prints 4 labels and never 19');
    }
  }
}
// pips per S1
ok(pips(byId['ang-10']) === 4, `ang-10 pips ${pips(byId['ang-10'])} ≠ 4`);
ok(pips(byId['ang-05']) === 4, `ang-05 pips ${pips(byId['ang-05'])} ≠ 4`);
ok(pips(byId['doc-07']) === 6, `doc-07 pips ${pips(byId['doc-07'])} ≠ 6`);
// cards.js integration
ok(all.length === new Set(all.map((c) => c.id)).size, 'cards.js: duplicate ids');
for (const c of cards) ok(allById[c.id] === c, `${c.id}: not reachable through data/cards.js`);

// ---------- 2. warm-ups: teacher pairs through the real grader ----------
for (const c of angles.slice(0, 5)) {
  const part = c.parts[0];
  const r = PAIRS.grade(part, c.teacherPairs.map((p) => p.map((n) => '∠' + n)), { figure: c.figure });
  ok(r.ok && r.kind === 'correct', `${c.id}: teacher pairs ${JSON.stringify(c.teacherPairs)} not accepted: ${r.msg}`);
  for (const m of c.misconceptions) {
    const pair = m.answer.split('+').map((s) => s.trim());
    const w = PAIRS.grade(part, [pair], { figure: c.figure });
    ok(!w.ok && w.results[0].kind === 'wrong', `${c.id}: misconception pair ${m.answer} should be wrong (got ${w.results[0]?.kind})`);
  }
  // S2: "3 supp, 1 comp, 1 vertical, 2 linear pairs, 2 non-adjacent" — enough valid pairs exist
  const model = M.resolve(getFigure('F1'), c.figure);
  ok(M.pairs(model, part.relation).length >= part.count, `${c.id}: only ${M.pairs(model, part.relation).length} ${part.relation} pairs`);
}

// ---------- 3. numeric recomputation ----------
const setupOf = (c) => c.parts.find((p) => p.type === 'equation');
const partOf = (c, id) => c.parts.find((p) => p.id === id);
const fieldAns = (c, pid, key) => partOf(c, pid).fields.find((f) => f.key === key).answer;

{ // ang-02
  const c = byId['ang-02']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(30)), `ang-02 x = ${str(x)}`);
  const want = [x, P.ratMul(x, R(2))];
  ok(sameSet(partOf(c, 'm').fields.map((f) => num(f.answer)), want), 'ang-02 multi ≠ {30, 60}');
  ok(eqv(rootsOf(setupOf(c).alternates[0])[0], R(60)), 'ang-02 alternate setup root ≠ 60');
}
{ // ang-03
  const c = byId['ang-03']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(55)), `ang-03 x = ${str(x)}`);
  const larger = P.ratAdd(x, R(70));
  ok(eqv(num(partOf(c, 'larger').answer), larger), 'ang-03 larger');
  ok(eqv(num(partOf(c, 'larger').distractors.smaller), x), 'ang-03 distractor smaller');
  ok(eqv(rootsOf(setupOf(c).alternates[0])[0], R(125)), 'ang-03 alternate root ≠ 125');
}
{ // ang-04: CB = 3m + 4, BA = n − 1, DE = m² − 6, AE = 8; CB = BA = CD = DE
  const c = byId['ang-04'];
  const roots = rootsOf('m^2-6-(3m+4)', 'm');
  ok(sameSet(roots, partOf(c, 'm').answer.map(num)), `ang-04 roots ${roots.map(str)}`);
  const keep = roots.filter((r) => P.ratSign(evalAt('3m+4', r, 'm')) > 0 && P.ratSign(evalAt('m^2-6', r, 'm')) > 0);
  const rej = roots.filter((r) => !keep.includes(r));
  ok(sameSet(keep, partOf(c, 'keep').valid.map(num)) && sameSet(rej, partOf(c, 'keep').rejected.map(num)), 'ang-04 keep/reject');
  ok(partOf(c, 'keep').reasonKey === 'negative-length', 'ang-04 reject reason');
  const CB = evalAt('3m+4', keep[0], 'm');                  // 19
  const n = P.ratAdd(CB, R(1));                              // n − 1 = CB
  const perimeter = P.ratAdd(P.ratMul(CB, R(4)), R(8));      // AC = CE = 2·CB, AE = 8
  ok(eqv(num(fieldAns(c, 'rest', 'n')), n), `ang-04 n = ${str(n)}`);
  ok(eqv(num(fieldAns(c, 'rest', 'P')), perimeter), `ang-04 P = ${str(perimeter)}`);
  ok(eqv(num(c.misconceptions.find((m) => m.tag === 'half-side-perimeter').answer), P.ratAdd(P.ratMul(CB, R(2)), R(8))), 'ang-04 half-side distractor = 46');
}
{ // ang-05
  const c = byId['ang-05'];
  const roots = rootsOf(setupOf(c).canonical);
  ok(sameSet(roots, partOf(c, 'x').answer.map(num)), `ang-05 roots ${roots.map(str)}`);
  const rows = partOf(c, 'cases').rows;
  for (const r of roots) {
    const MAH = evalAt('x^2+3', r), HAC = evalAt('11-7x', r), MAC = evalAt('6-16x', r);
    ok(P.ratEq(P.ratAdd(MAH, HAC), MAC), `ang-05 x=${str(r)} halves do not add to the whole`);
    ok(P.ratSign(MAH) > 0 && P.ratSign(HAC) > 0, `ang-05 x=${str(r)} negative measure`);
    const row = rows.find((w) => eqv(num(w.x), r));
    ok(row, `ang-05 no row for x=${str(r)}`);
    if (row) {
      ok(eqv(num(row.MAH), MAH) && eqv(num(row.HAC), HAC), `ang-05 row x=${str(r)}: ${row.MAH}, ${row.HAC} vs ${str(MAH)}, ${str(HAC)}`);
      ok(row.verdict === (P.ratEq(MAH, HAC) ? 'YES' : 'NO'), `ang-05 verdict x=${str(r)}`);
    }
  }
  const strip = partOf(c, 'explain');
  ok(STRIP.validate(strip).length === 0, `ang-05 strip: ${STRIP.validate(strip)}`);
  const r = STRIP.grade(strip, { c1: [0], c2: [0], end: 0 });
  ok(r.ok, 'ang-05 strip: required chips + conclusion clear');
  ok(/bisects only when x = −8 — both cases stated/.test(STRIP.prose(strip).text), 'ang-05 prose conclusion');
}
{ // ang-06
  const c = byId['ang-06']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(60)), `ang-06 x = ${str(x)}`);
  ok(eqv(num(fieldAns(c, 'm', 'angle')), x) && eqv(num(fieldAns(c, 'm', 'comp')), P.ratSub(R(90), x)) && eqv(num(fieldAns(c, 'm', 'supp')), P.ratSub(R(180), x)), 'ang-06 fields');
  ok(partOf(c, 'm').fields.filter((f) => !f.bonus).length === 1, 'ang-06: only the angle is required');
}
{ // ang-07
  const c = byId['ang-07']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(20)), `ang-07 part = ${str(x)}`);
  ok(sameSet(partOf(c, 'm').fields.map((f) => num(f.answer)), [P.ratMul(x, R(7)), P.ratMul(x, R(2))]), 'ang-07 multi ≠ {140, 40}');
}
{ // ang-08
  const c = byId['ang-08']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(30)), `ang-08 x = ${str(x)}`);
  const d = partOf(c, 'supp').distractors;
  ok(eqv(num(partOf(c, 'supp').answer), P.ratSub(R(180), x)), 'ang-08 supp');
  ok(eqv(num(d.angle), x) && eqv(num(d.comp), P.ratSub(R(90), x)) && eqv(num(d.supp), P.ratSub(R(180), x)), 'ang-08 distractors');
  // ratio check: supp/comp = 5/2
  ok(P.ratEq(P.ratDiv(P.ratSub(R(180), x), P.ratSub(R(90), x)), R(5, 2)), 'ang-08 ratio 5:2');
}
{ // ang-09
  const c = byId['ang-09'];
  const roots = rootsOf(setupOf(c).canonical);
  ok(sameSet(roots, partOf(c, 'x').answer.map(num)), `ang-09 roots ${roots.map(str)}`);
  const keep = roots.filter((r) => P.ratSign(r) > 0 && P.ratCmp(r, R(90)) < 0);
  const rej = roots.filter((r) => !keep.includes(r));
  ok(sameSet(keep, partOf(c, 'keep').valid.map(num)) && sameSet(rej, partOf(c, 'keep').rejected.map(num)), 'ang-09 keep/reject');
  ok(partOf(c, 'keep').reasonKey === 'zero-angle' && rej.length === 1 && P.ratIsZero(rej[0]), 'ang-09 rejects 0 as a zero angle');
  const x = keep[0];
  ok(P.ratEq(P.ratDiv(P.ratMul(x, P.ratSub(R(180), x)), P.ratMul(x, P.ratSub(R(90), x))), R(13, 4)), 'ang-09 ratio 13:4');
  const p = partOf(c, 'angle');
  ok(eqv(num(p.answer), x) && eqv(num(p.distractors.comp), P.ratSub(R(90), x)) && eqv(num(p.distractors.supp), P.ratSub(R(180), x)), 'ang-09 angle/distractors');
  ok(eqv(num(p.bonus[0].answer), P.ratSub(R(90), x)) && eqv(num(p.bonus[1].answer), P.ratSub(R(180), x)), 'ang-09 bonus comp/supp');
}
{ // ang-10 — from the figure expressions: ∠BFC = −x + 84, ∠AFE = 2x² − 4x + 3 = ∠CFD (vertical), ∠BFC + ∠CFD = 90, ∠DFE = 180 − ∠CFD
  const c = byId['ang-10'];
  const lab = Object.fromEntries(c.figure.labels.map((l) => [l.angle.join(''), l.text]));
  const BFC = lab.BC, AFE = lab.AE;
  ok(BFC && AFE, 'ang-10 figure labels present');
  const eq = `(${BFC})+(${AFE})-90`;
  const roots = rootsOf(eq);
  ok(sameSet(roots, partOf(c, 'x').answer.map(num)), `ang-10 roots ${roots.map(str)}`);
  ok(sameSet(rootsOf(setupOf(c).canonical), roots), 'ang-10 setup canonical roots');
  const rows = partOf(c, 'cases').rows;
  const keep = [];
  for (const r of roots) {
    const CFD = evalAt(AFE, r), DFE = P.ratSub(R(180), CFD), bfc = evalAt(BFC, r);
    if (P.ratSign(CFD) > 0 && P.ratSign(bfc) > 0 && P.ratSign(DFE) > 0) keep.push(r);
    const row = rows.find((w) => eqv(num(w.x), r));
    ok(row, `ang-10 no row for x=${str(r)}`);
    if (row) ok(eqv(num(row.CFD), CFD) && eqv(num(row.DFE), DFE), `ang-10 row x=${str(r)}: ${row.CFD}, ${row.DFE} vs ${str(CFD)}, ${str(DFE)}`);
  }
  ok(keep.length === 2 && sameSet(keep, partOf(c, 'keep').valid.map(num)) && partOf(c, 'keep').rejected.length === 0, 'ang-10 keeps both roots');
  ok(partOf(c, 'keep').reasonKey === 'both-valid', 'ang-10 reason both-valid');
  ok(partOf(c, 'keep').distractors.includes('−1/2 is negative so reject it'), 'ang-10 S3 distractor present');
}
{ // ang-11
  const c = byId['ang-11']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(42)), `ang-11 x = ${str(x)}`);
  const p = partOf(c, 'angle');
  ok(eqv(num(p.answer), x) && eqv(num(p.distractors.comp), P.ratSub(R(90), x)) && eqv(num(p.distractors.supp), P.ratSub(R(180), x)), 'ang-11 angle/distractors');
  ok(eqv(num(p.bonus[0].answer), P.ratSub(R(90), x)) && eqv(num(p.bonus[1].answer), P.ratSub(R(180), x)), 'ang-11 bonus');
}
{ // doc-05 — from the figure labels: ∠ABD = 5x + 16, ∠DBC = 8x − 23, whole 11x + 19
  const c = byId['doc-05'];
  const fig = getFigure('D5');
  const lab = Object.fromEntries(fig.labels.map((l) => [l.angle.join(''), l.text]));
  const x = rootsOf(`(${lab.AD})+(${lab.DC})-(11x+19)`)[0];
  ok(eqv(x, R(13)), `doc-05 x = ${str(x)}`);
  const strip = partOf(c, 'explain');
  ok(STRIP.validate(strip).length === 0, `doc-05 strip: ${STRIP.validate(strip)}`);
  const sx = strip.slots.find((s) => s.id === 'x'), halves = strip.slots.find((s) => s.id === 'halves'), verdict = strip.slots.find((s) => s.id === 'verdict');
  ok(eqv(num(sx.answer), x), 'doc-05 x slot');
  const ABD = evalAt(lab.AD, x), DBC = evalAt(lab.DC, x);
  ok(eqv(num(halves.fields[0].answer), ABD) && eqv(num(halves.fields[1].answer), DBC), 'doc-05 halves');
  ok(verdict.answer === (P.ratEq(ABD, DBC) ? 'YES' : 'NO'), 'doc-05 verdict');
  const r = STRIP.grade(strip, { eq: strip.slots[0].answer, x: '13', halves: { ABD: '81', DBC: '81' }, verdict: 'YES', why: [0] });
  ok(r.ok && r.complete, 'doc-05 strip full clear');
  ok(/x = 13, so m∠ABD = 81° = m∠DBC/.test(STRIP.prose(strip).text), `doc-05 prose: ${STRIP.prose(strip).text}`);
  const chips = strip.slots.find((s) => s.id === 'why').chips;
  ok(chips.filter((ch) => ch.role === 'required').length === 1 && chips.some((ch) => ch.role === 'forbidden') && chips.filter((ch) => ch.role === 'neutral').length >= 3, 'doc-05 chip roles');
}
{ // doc-06
  const c = byId['doc-06']; const x = rootsOf(setupOf(c).canonical)[0];
  ok(eqv(x, R(60)), `doc-06 x = ${str(x)}`);
  ok(eqv(num(fieldAns(c, 'm', 'angle')), x) && eqv(num(fieldAns(c, 'm', 'supp')), P.ratSub(R(180), x)) && eqv(num(fieldAns(c, 'm', 'comp')), P.ratSub(R(90), x)), 'doc-06 fields');
}
{ // doc-07 — the 2×2 system from the figure labels: vertical UL = LR, linear pair UL + UR = 180
  const c = byId['doc-07'];
  const fig = getFigure('D7');
  const lab = Object.fromEntries(fig.labels.map((l) => [l.angle.join(''), l.text]));
  const UL = lab.LQ, UR = lab.QR, LR = lab.RS;
  const e1 = P.parseLinear(`${UL}-(${LR})`), e2 = P.parseLinear(`(${UL})+(${UR})-180`);
  ok(e1.ok && e2.ok, 'doc-07 linear parse');
  // a1 x + b1 y = k1, a2 x + b2 y = k2  (parseLinear: coef·vars + k = 0 → move k)
  const Z = R(0);
  const a1 = e1.coef.x ?? Z, b1 = e1.coef.y ?? Z, k1 = P.ratNeg(e1.k), a2 = e2.coef.x ?? Z, b2 = e2.coef.y ?? Z, k2 = P.ratNeg(e2.k);
  const det = P.ratSub(P.ratMul(a1, b2), P.ratMul(a2, b1));
  ok(!P.ratIsZero(det), 'doc-07 det ≠ 0');
  const x = P.ratDiv(P.ratSub(P.ratMul(k1, b2), P.ratMul(k2, b1)), det);
  const y = P.ratDiv(P.ratSub(P.ratMul(a1, k2), P.ratMul(a2, k1)), det);
  ok(eqv(x, R(-10)) && eqv(y, R(45)), `doc-07 x=${str(x)} y=${str(y)}`);
  const at = (expr) => { const l = P.parseLinear(expr); return P.ratAdd(P.ratAdd(P.ratMul(l.coef.x ?? Z, x), P.ratMul(l.coef.y ?? Z, y)), l.k); };
  const vUL = at(UL), vUR = at(UR), vLR = at(LR), vLL = vUR;   // LL is vertical to UR
  ok(P.ratEq(vUL, vLR) && P.ratEq(P.ratAdd(vUL, vUR), R(180)) && P.ratEq(P.ratAdd(vUL, vLL), R(180)), 'doc-07 geometry consistent');
  const f = (k) => num(fieldAns(c, 'all', k));
  ok(eqv(f('x'), x) && eqv(f('y'), y) && eqv(f('UL'), vUL) && eqv(f('UR'), vUR) && eqv(f('LR'), vLR) && eqv(f('LL'), vLL), `doc-07 fields vs ${[vUL, vUR, vLR, vLL].map(str)}`);
  for (const s of setupOf(c).system) ok(P.parseLinear(s).ok, `doc-07 system equation ${s} parses`);
}

// ---------- 4. every equation setup: canonical parses as a rational function and mentions its mustMention numbers ----------
for (const c of cards) {
  const s = setupOf(c);
  if (!s) continue;
  ok(s.optional === true, `${c.id}: setup must be optional on Cards`);
  if (s.system && s.vars) {
    ok(s.canonical === null, `${c.id}: a system setup carries canonical null`);
    for (const e of s.system) ok(P.parseLinear(e, { vars: s.vars }).ok, `${c.id}: system equation "${e}" does not parse`);
    for (const n of s.mustMention) ok(s.system.some((e) => e.includes(String(n))), `${c.id}: system does not mention ${n}`);
  } else {
    const rf = P.parseRational(s.canonical, { var: s.var });
    ok(rf.ok, `${c.id}: canonical "${s.canonical}" does not parse (${rf.err})`);
    for (const n of s.mustMention) ok(s.canonical.includes(String(n)), `${c.id}: canonical does not mention ${n}`);
  }
  for (const a of s.alternates ?? []) ok(P.parseRational(a, { var: s.var }).ok, `${c.id}: alternate ${a} parses`);
}
// every roots/num/multi/cases answer parses as a number
for (const c of cards) for (const p of c.parts) {
  const vals = [];
  if (p.type === 'num') vals.push(p.answer, ...Object.values(p.distractors ?? {}), ...(p.bonus ?? []).map((b) => b.answer));
  if (p.type === 'multi') vals.push(...p.fields.map((f) => f.answer));
  if (p.type === 'roots') vals.push(...p.answer);
  if (p.type === 'reject') vals.push(...p.valid, ...p.rejected);
  if (p.type === 'cases') for (const r of p.rows) for (const col of p.cols) if (col.type !== 'verdict') vals.push(r[col.key]);
  for (const v of vals) ok(N.parseNumber(String(v)).ok, `${c.id}/${p.id}: answer "${v}" does not parse`);
}
// hints never contain the final answer string as a standalone number (H3 is one step from the end)
const finals = { 'ang-02': ['60'], 'ang-03': ['125'], 'ang-04': ['84'], 'ang-06': ['60'], 'ang-07': ['140'], 'ang-08': ['150'], 'ang-09': ['50'], 'ang-11': ['42'], 'doc-06': ['60'], 'doc-07': ['45'] };
for (const [id, vals] of Object.entries(finals)) for (const h of byId[id].hints) for (const v of vals) ok(!new RegExp(`(^|[^\\d.])${v}(?![\\d])`).test(h), `${id}: hint reveals ${v}: "${h}"`);

console.log(`${checks} checks, ${flags} FLAG line(s)`);
process.exit(flags ? 1 : 0);
