// coverage.test.mjs — T06f: the data is checked AGAINST site/data/source-manifest.js (COMPOSED S2 manifest
// paragraph, S6 test list, S8 #6f; BUILD-POLICY §1 — keys.test is dropped, no scan fields may exist).
//
//   · every manifest id exists exactly once in data/cards.js and every card has a manifest row (a bijection)
//   · every id sits in exactly one module pool, with skills[0] / sheet / src / module equal to its row
//   · every card has skills[] (bonus: []), sheet, hints[3], solution[], verified, a registered grader per part
//   · every `num` part (and multi field) with a chained `asks` names every chain intermediate in `distractors`
//   · every asn-*/qz-*/fact-* verdict part has a reason + exactly 2 distractors (from data/asn.js); bonus none;
//     the S2 letter strings are pinned; asn/qz stems are byte-equal to content/SOURCE.md §4/§5
//   · every non-bonus id is eligible for ≥ 1 Mock section and every section has ≥ 3 candidates (from the manifest;
//     checked against data/blueprint.js as well once that file exists — T13)
//   · every misconception tag in the data is catalogued (the T06g scan covers the graders' literals)
//   · the wave-1 sweep (notes/sweep-w1.mjs) lifted: figures resolve/validate/lint/render, termmatch is deterministic
//   · THE GOLDEN ROUND-TRIP: every part of every card grades its own stored answer `correct` through grade()
//   · BUILD-POLICY §1: no teacherKey / orig / crop / PNG anywhere under site/data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { manifest, MANIFEST_IDS, manifestById, FAMILY_TILES, MOCK_SECTIONS, SKILL_BY_PREFIX,
  expectedSkill, expectedSheet, isBonus, mockSections, manifestIds } from '../site/data/source-manifest.js';
import { cards, byId, getCard } from '../site/data/cards.js';
import { modules, moduleById, MODULE_IDS, families, familyById, bosses, moduleOf, allOriginalIds } from '../site/data/modules.js';
import { sheets, sheetById, SHEET_IDS, sheetOf } from '../site/data/sheets.js';
import { SKILL_IDS, skillById } from '../site/data/skills.js';
import { isKnownTag } from '../site/data/misconceptions.js';
import { REASONS, BONUS_REASONS, REASON_IDS, reasonFor, bonusReasonFor } from '../site/data/asn.js';
import { asnCards, qzCards, bonusCards } from '../site/data/cards/asn.js';
import { figures } from '../site/data/figures.js';
import * as I from '../site/js/grader/index.js';
import { chainOf } from '../site/js/grader/num.js';
import { parseNumber } from '../site/js/grader/normalize.js';
import { validate as validateStrip } from '../site/js/grader/strip.js';
import { validate as validateClassify } from '../site/js/grader/classify.js';
import { layout as termmatchLayout } from '../site/js/grader/termmatch.js';
import { resolve as resolveFigure, validate as validateFigure } from '../site/js/figure/model.js';
import { lint, renderModel } from '../site/js/figure/svg.js';
import { ROOT, correctRaw, CORRECT_RAW_TYPES } from './_helpers.mjs';   // T17: shared with mock.test.mjs

await I.ready;

const SOURCE = readFileSync(join(ROOT, 'content', 'SOURCE.md'), 'utf8');
const BLUEPRINT = join(ROOT, 'site', 'data', 'blueprint.js');

const count = (prefix) => MANIFEST_IDS.filter((id) => id.startsWith(prefix + '-')).length;
const nonBonus = manifestIds({ bonus: false });

// =====================================================================================
// 1. the manifest itself
// =====================================================================================

test('manifest: 197 literal rows, unique, frozen, well-typed, with the S2 family counts', () => {
  assert.equal(manifest.length, 197);
  assert.equal(new Set(MANIFEST_IDS).size, 197, 'duplicate manifest id');
  assert.ok(Object.isFrozen(manifest));
  for (const row of manifest) {
    assert.ok(Object.isFrozen(row), `${row.id} row frozen`);
    assert.match(row.id, /^[a-z]+-(wu-\d|\d\d)$/, `${row.id}: id shape`);
    assert.ok(SHEET_IDS.includes(row.sheet), `${row.id}: sheet ${row.sheet}`);
    assert.ok(MODULE_IDS.includes(row.module), `${row.id}: module ${row.module}`);
    assert.ok(typeof row.src === 'string' && row.src.startsWith('§'), `${row.id}: src ${row.src}`);
    if (row.bonus) {
      assert.equal(row.skill, null, `${row.id}: bonus rows carry no skill`);
      assert.equal(row.mock, null, `${row.id}: bonus rows are never in the Mock`);
      assert.equal(row.sheet, 'BONUS');
      assert.equal(row.module, 'M13');
    } else {
      assert.ok(SKILL_IDS.includes(row.skill), `${row.id}: skill ${row.skill} is not in skills.js`);
      assert.match(row.mock, /^[A-E]+$/, `${row.id}: mock letters ${row.mock}`);
    }
    const prefix = row.id.split('-')[0];
    if (prefix in SKILL_BY_PREFIX) assert.equal(row.skill, SKILL_BY_PREFIX[prefix], `${row.id}: S2 prefix rule`);
  }
  assert.deepEqual(
    { voc: count('voc'), not: count('not'), def: count('def'), fact: count('fact'), cls: count('cls'), wu: count('ang-wu'),
      ang: MANIFEST_IDS.filter((id) => /^ang-\d\d$/.test(id)).length, doc: count('doc'), wp: count('wp'), asn: count('asn'),
      qz: count('qz'), bonus: count('bonus'), fac: count('fac'), quad: count('quad') },
    { voc: 23, not: 9, def: 14, fact: 5, cls: 4, wu: 5, ang: 10, doc: 3, wp: 16, asn: 36, qz: 18, bonus: 33, fac: 18, quad: 3 },
  );
  assert.equal(nonBonus.length, 164);
  // S2's explicit lines: def-* → VOC, fact-* → ASN-PLP, cls-* → CLASS, voc-* → VOC, not-* → NOTE
  for (const id of MANIFEST_IDS) {
    if (id.startsWith('def-') || id.startsWith('voc-')) assert.equal(expectedSkill(id), 'VOC', id);
    if (id.startsWith('fact-')) assert.equal(expectedSkill(id), 'ASN-PLP', id);
    if (id.startsWith('cls-')) assert.equal(expectedSkill(id), 'CLASS', id);
    if (id.startsWith('not-')) assert.equal(expectedSkill(id), 'NOTE', id);
  }
  // helpers
  assert.equal(expectedSheet('ang-10'), 'AP-4');
  assert.equal(isBonus('bonus-01'), true);
  assert.equal(isBonus('asn-01'), false);
  assert.equal(isBonus('nope'), false);
  assert.deepEqual(mockSections('not-06'), ['A', 'B']);
  assert.deepEqual(mockSections('bonus-01'), []);
  assert.equal(expectedSkill('nope'), undefined);
  assert.deepEqual(Object.keys(MOCK_SECTIONS), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual([...FAMILY_TILES], ['fam-quad-a1', 'fam-quad-a2', 'fam-quad-ctx', 'fam-sys']);
});

// =====================================================================================
// 2. every id exists exactly once, sits in one module pool, on the right sheet, with the right skill
// =====================================================================================

test('coverage: every manifest id exists exactly once in data/cards.js, and every card has a manifest row', () => {
  const seen = new Map();
  for (const c of cards) seen.set(c.id, (seen.get(c.id) ?? 0) + 1);
  const missing = MANIFEST_IDS.filter((id) => !seen.has(id));
  const dupes = MANIFEST_IDS.filter((id) => seen.get(id) > 1);
  const extra = [...seen.keys()].filter((id) => !manifestById[id]);
  assert.deepEqual(missing, [], `missing from data: ${missing.join(', ')}`);
  assert.deepEqual(dupes, [], `duplicated in data: ${dupes.join(', ')}`);
  assert.deepEqual(extra, [], `in data but not in the manifest: ${extra.join(', ')}`);
  assert.equal(cards.length, manifest.length);
  for (const id of MANIFEST_IDS) {
    assert.equal(byId[id]?.id, id, `byId[${id}]`);
    assert.equal(getCard(id), byId[id]);
  }
  assert.equal(getCard('fam-sys'), null, 'family tiles are not cards');
});

test('coverage: every id sits in exactly one module pool, and module / sheet / src / skill agree with its row', () => {
  const poolCount = new Map();
  for (const m of modules) for (const id of m.originals) poolCount.set(id, (poolCount.get(id) ?? 0) + 1);
  for (const row of manifest) {
    const c = byId[row.id];
    assert.equal(poolCount.get(row.id), 1, `${row.id}: in ${poolCount.get(row.id) ?? 0} module pools (want exactly 1)`);
    assert.equal(moduleOf(row.id), row.module, `${row.id}: modules.js says ${moduleOf(row.id)}, manifest says ${row.module}`);
    assert.equal(c.module, row.module, `${row.id}: card.module`);
    assert.equal(c.sheet, row.sheet, `${row.id}: card.sheet ${c.sheet} ≠ manifest ${row.sheet}`);
    assert.equal(sheetOf(row.id), row.sheet, `${row.id}: sheets.js tab ${sheetOf(row.id)} ≠ manifest ${row.sheet}`);
    assert.equal(c.src, row.src, `${row.id}: card.src "${c.src}" ≠ manifest "${row.src}"`);
    assert.ok(Array.isArray(c.skills), `${row.id}: skills[]`);
    for (const s of c.skills) assert.ok(skillById[s], `${row.id}: unknown skill ${s}`);
    if (row.bonus) {
      assert.deepEqual(c.skills, [], `${row.id}: bonus cards carry no skill`);
      assert.equal(c.bonus, true, `${row.id}: bonus flag`);
      assert.equal(moduleById[c.module].bonus, true);
    } else {
      assert.ok(c.skills.length >= 1, `${row.id}: no skills`);
      assert.equal(c.skills[0], row.skill, `${row.id}: skills[0] ${c.skills[0]} ≠ manifest ${row.skill}`);
      assert.notEqual(c.bonus, true, `${row.id}: not bonus`);
      assert.ok(moduleById[c.module].skills.includes(row.skill) || row.id.startsWith('fact-'),
        `${row.id}: ${row.skill} is not one of ${c.module}'s skills (${moduleById[c.module].skills})`);
    }
  }
  // every module pool id is a manifest id, in sheet order inside its sheet
  for (const m of modules) for (const id of m.originals) assert.ok(manifestById[id], `${m.id} pool has unknown id ${id}`);
  assert.equal(allOriginalIds().length, 197);
  assert.equal(allOriginalIds({ bonus: false }).length, 164);
  for (const s of sheets) {
    const ids = s.ids.filter((id) => !id.startsWith('fam-'));
    const inManifest = MANIFEST_IDS.filter((id) => manifestById[id].sheet === s.id);
    assert.deepEqual(ids, inManifest, `sheet ${s.id}: tab order ≠ manifest order`);
  }
  // family tiles live on ALG in modules.families
  for (const f of FAMILY_TILES) {
    assert.ok(familyById[f], `family tile ${f} in modules.js`);
    assert.equal(familyById[f].sheet, 'ALG');
    assert.ok(sheetById.ALG.ids.includes(f), `${f} on the ALG tab`);
    assert.equal(moduleOf(f), familyById[f].module);
  }
  assert.equal(families.length, 4);
  // every Boss elite is a manifest id
  for (const b of bosses) assert.ok(manifestById[b.elite] && !isBonus(b.elite), `${b.id} elite ${b.elite}`);
});

// =====================================================================================
// 3. card shape
// =====================================================================================

const walkKeys = (v, hit, path = '') => {
  if (Array.isArray(v)) v.forEach((x, i) => walkKeys(x, hit, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { hit(k, `${path}.${k}`); walkKeys(x, hit, `${path}.${k}`); }
};

test('coverage: every card has skills[], sheet, tier, par, stem, hints[3], solution[], verified, unique part ids and a registered grader per part', () => {
  const types = new Set();
  for (const c of cards) {
    assert.ok(typeof c.stem === 'string' && c.stem.trim().length > 0, `${c.id}: stem`);
    assert.ok(typeof c.srcFile === 'string' && c.srcFile.length > 0, `${c.id}: srcFile`);
    assert.ok([1, 2, 3, 4].includes(c.tier), `${c.id}: tier ${c.tier}`);
    assert.ok(Number.isFinite(c.par) && c.par > 0, `${c.id}: par ${c.par}`);
    assert.ok(Array.isArray(c.hints) && c.hints.length === 3, `${c.id}: hints[3] (got ${c.hints?.length})`);
    for (const h of c.hints) assert.ok(typeof h === 'string' && h.trim().length >= 10, `${c.id}: hint "${h}"`);
    assert.ok(Array.isArray(c.solution) && c.solution.length >= 1, `${c.id}: solution[]`);
    for (const s of c.solution) {
      assert.ok(s && typeof s.say === 'string' && s.say.trim().length > 0, `${c.id}: solution step needs say`);
      if (s.math !== undefined) assert.equal(typeof s.math, 'string', `${c.id}: solution math must be a string`);
    }
    assert.equal(c.verified, true, `${c.id}: verified`);
    assert.ok(Array.isArray(c.parts) && c.parts.length >= 1, `${c.id}: parts`);
    const ids = new Set();
    for (const p of c.parts) {
      assert.ok(typeof p.id === 'string' && p.id, `${c.id}: part id`);
      assert.ok(!ids.has(p.id), `${c.id}: duplicate part id ${p.id}`);
      ids.add(p.id);
      assert.ok(I.has(p.type), `${c.id}/${p.id}: no grader registered for type ${p.type}`);
      types.add(p.type);
    }
    for (const n of c.needs ?? []) assert.ok(skillById[n], `${c.id}: needs ${n}`);
    if (c.pick !== undefined) assert.ok(c.pick === 'one' || c.pick === null, `${c.id}: pick ${c.pick}`);
    if (c.pick === 'one') assert.ok(c.parts.length >= 2, `${c.id}: pick:'one' needs ≥ 2 parts`);
    assert.ok(Array.isArray(c.misconceptions), `${c.id}: misconceptions[]`);
    for (const m of c.misconceptions) {
      assert.ok(typeof m.msg === 'string' && m.msg.length > 0, `${c.id}: misconception msg`);
      assert.ok(m.answer !== undefined && m.answer !== null && String(m.answer).length > 0, `${c.id}: misconception answer`);
      if (m.tag !== undefined) assert.ok(isKnownTag(m.tag), `${c.id}: misconception tag ${m.tag} not catalogued`);
      if (m.part !== undefined) assert.ok(ids.has(m.part), `${c.id}: misconception part ${m.part} unknown`);
    }
    // no scan fields anywhere in the card (BUILD-POLICY §1)
    walkKeys(c, (k, path) => assert.ok(!['teacherKey', 'orig', 'crop', 'img'].includes(k), `${c.id}: scan field ${path}`));
  }
  assert.deepEqual(I.missing, [], 'lazy graders failed to load');
  assert.ok(types.size >= 17, `${types.size} part types in the content`);
  for (const t of types) assert.ok(I.has(t), t);
});

test('coverage: figure cards resolve, validate, lint clean at 343 px and render SVG; strips and classify parts validate', () => {
  let figs = 0;
  for (const c of cards) {
    if (c.figure) {
      figs++;
      const spec = typeof c.figure === 'string' ? { id: c.figure } : c.figure;
      const base = figures[spec.id];
      assert.ok(base, `${c.id}: unknown figure ${spec.id}`);
      const m = resolveFigure(base, spec);
      assert.deepEqual(validateFigure(m), [], `${c.id}: figure validate`);
      assert.deepEqual(lint(m, { widthPx: 343 }), [], `${c.id}: figure lint`);
      const svg = renderModel(m, { width: 343 });
      assert.ok(typeof svg === 'string' && svg.startsWith('<svg'), `${c.id}: renderModel`);
    }
    for (const p of c.parts) {
      if (p.type === 'strip') assert.deepEqual(validateStrip(p), [], `${c.id}/${p.id}: strip.validate`);
      if (p.type === 'classify') assert.deepEqual(validateClassify(p) ?? [], [], `${c.id}/${p.id}: classify.validate`);
      if (p.type === 'termmatch') {
        const seed = p.id ?? c.id;
        assert.equal(JSON.stringify(termmatchLayout(p, seed)), JSON.stringify(termmatchLayout(p, seed)), `${c.id}: termmatch layout deterministic`);
      }
    }
  }
  assert.equal(figs, 19, 'figure cards');
});

// =====================================================================================
// 4. chained asks carry every intermediate; ASN parts carry reason + 2 distractors
// =====================================================================================

test('coverage: every num part (and multi field) with a chained `asks` names every chain intermediate in `distractors`, all parseable', () => {
  let chained = 0;
  const check = (id, p) => {
    if (!Array.isArray(p.asks) || !p.asks.length) return;
    const chain = chainOf(p.asks);
    assert.ok(Array.isArray(chain) && chain.length >= 1, `${id}: chainOf(${p.asks})`);
    const intermediates = chain.slice(0, -1);
    if (!intermediates.length) return;
    chained++;
    assert.ok(p.distractors && typeof p.distractors === 'object', `${id}: chained asks ${JSON.stringify(p.asks)} without distractors`);
    for (const name of intermediates) assert.ok(name in p.distractors, `${id}: intermediate "${name}" of ${JSON.stringify(p.asks)} is not a named distractor (${Object.keys(p.distractors)})`);
    for (const [k, v] of Object.entries(p.distractors)) assert.ok(parseNumber(String(v)).ok, `${id}: distractor ${k}="${v}" does not parse`);
    for (const name of intermediates) assert.notEqual(String(p.distractors[name]), String(p.answer), `${id}: intermediate ${name} equals the answer`);
  };
  for (const c of cards) for (const p of c.parts) {
    if (p.type === 'num') check(`${c.id}/${p.id}`, p);
    if (p.type === 'multi') for (const f of p.fields) check(`${c.id}/${p.id}/${f.key}`, f);
  }
  assert.ok(chained >= 8, `chained num parts found: ${chained}`);
  // the S3 examples
  assert.deepEqual(chainOf(byId['wp-07'].parts.find((p) => p.type === 'num').asks), ['angle', 'comp', 'supp']);
  assert.deepEqual(chainOf(byId['wp-05'].parts.find((p) => p.type === 'num').asks), ['smaller', 'comp']);
  assert.deepEqual(chainOf(byId['wp-12'].parts.find((p) => p.type === 'num').asks), ['smaller', 'supp']);
});

const S2_ASN = 'S S N N A S S S A A S S N A S S N A N A S S N A A S N N N S S S A A S S'.split(' ');
const S2_QZ = 'N N A S S S S N A S S N A S N S A N'.split(' ');

test('coverage: every asn-*/qz-* part has a reason + exactly 2 distinct distractors from data/asn.js; fact-* verdicts too; bonus none; qz-04 ⚑', () => {
  for (const c of [...asnCards, ...qzCards]) {
    const p = c.parts.find((x) => x.type === 'asn');
    assert.ok(p, `${c.id}: asn part`);
    assert.ok(['A', 'S', 'N'].includes(p.answer), `${c.id}: answer ${p.answer}`);
    assert.ok(typeof p.reason === 'string' && p.reason.length >= 10, `${c.id}: reason`);
    assert.ok(Array.isArray(p.distractors) && p.distractors.length === 2, `${c.id}: exactly 2 distractors (got ${p.distractors?.length})`);
    assert.equal(new Set([p.reason, ...p.distractors]).size, 3, `${c.id}: reason / distractors must be distinct`);
    for (const d of p.distractors) assert.ok(typeof d === 'string' && d.length >= 10, `${c.id}: distractor "${d}"`);
    const bank = reasonFor(c.id);
    assert.ok(bank, `${c.id}: no bank entry in data/asn.js`);
    assert.equal(p.reason, bank.reason, `${c.id}: reason ≠ bank`);
    assert.deepEqual([...p.distractors], [...bank.distractors], `${c.id}: distractors ≠ bank`);
    if (c.id === 'qz-04') assert.equal(p.disputed, 'Quizlet says S — and S is right (a line and a ray can be skew); an earlier draft flagged it as A', 'qz-04 ⚑ note (Global rule 5)');
    else assert.equal(p.disputed, undefined, `${c.id}: only qz-04 is disputed`);
  }
  assert.equal(REASON_IDS.length, 54);
  assert.deepEqual(asnCards.map((c) => c.parts[0].answer), S2_ASN, 'S2 §4 letter string');
  assert.deepEqual(qzCards.map((c) => c.parts[0].answer), S2_QZ, 'S2 §5 letter string');
  for (const c of bonusCards) {
    const p = c.parts.find((x) => x.type === 'asn');
    assert.ok(p && ['A', 'S', 'N'].includes(p.answer), `${c.id}: verdict`);
    assert.deepEqual([...p.distractors], [], `${c.id}: bonus has no chips`);
    assert.equal(p.reason, bonusReasonFor(c.id), `${c.id}: bonus reason line`);
    assert.equal(reasonFor(c.id), null);
  }
  assert.equal(Object.keys(BONUS_REASONS).length, 33);
  assert.equal(Object.keys(REASONS).length, 54);
  for (const id of ['fact-01', 'fact-02', 'fact-03', 'fact-04', 'fact-05']) {
    const p = byId[id].parts.find((x) => x.type === 'asn');
    assert.ok(p, `${id}: verdict part for Mock section C`);
    assert.ok(typeof p.statement === 'string' && p.statement.length > 10, `${id}: statement`);
    assert.ok(typeof p.reason === 'string' && p.reason.length >= 10, `${id}: reason`);
    assert.equal(p.distractors.length, 2, `${id}: 2 distractors`);
    assert.equal(p.mock, true, `${id}: mock flag`);
  }
});

test('coverage: asn/qz stems are byte-equal to content/SOURCE.md §4/§5; bonus stems match modulo the 2 notation-markup stems', () => {
  const s4 = [...SOURCE.matchAll(/^(\d+)\. (.+?) — (Always|Sometimes|Never)/gm)].map((m) => ({ n: +m[1], stem: m[2], letter: m[3][0] }));
  const s5 = [...SOURCE.matchAll(/^- (.+?) — ([ASN])\b/gm)].map((m) => ({ stem: m[1], letter: m[2] }));
  assert.equal(s4.length, 36);
  assert.equal(s5.length, 18);
  asnCards.forEach((c, i) => {
    assert.equal(s4[i].n, i + 1);
    assert.equal(c.stem, s4[i].stem, `${c.id}: stem ≠ SOURCE §4`);
    assert.equal(c.num, i + 1, `${c.id}: num`);
  });
  qzCards.forEach((c, i) => assert.equal(c.stem, s5[i].stem, `${c.id}: stem ≠ SOURCE §5`));
  const bonusLine = SOURCE.split('\n').find((l) => l.startsWith('Out-of-scope (bonus'));
  const items = bonusLine.replace(/^Out-of-scope \(bonus, triangles\/parallel\/skew\): /, '').replace(/\.$/, '').split(/;\s+/)
    .map((s) => /^(.+?) — ([ASN])$/.exec(s.trim())).filter(Boolean).map((m) => ({ stem: m[1], letter: m[2] }));
  assert.equal(items.length, 33);
  const EXPANDED = new Set(['bonus-05', 'bonus-10']);  // the two stems that carry §0 notation markup ({seg AB}, {ang ABC}) where the Quizlet has plain words
  bonusCards.forEach((c, i) => {
    if (EXPANDED.has(c.id)) return;
    assert.equal(c.stem.replace(/\.$/, ''), items[i].stem, `${c.id}: stem ≠ SOURCE §5 bonus`);
  });
});

// =====================================================================================
// 5. Mock eligibility
// =====================================================================================

/** Best-effort adapter over data/blueprint.js (T13) — returns a Set of ids per section letter, or null if the shape is unknown. */
async function blueprintCandidates() {
  const mod = await import(pathToFileURL(BLUEPRINT).href);
  const bp = mod.blueprint ?? mod.sections ?? mod.slots ?? mod.default;
  const out = {};
  const add = (letter, ids) => { for (const id of ids) (out[letter] ??= new Set()).add(id); };
  if (typeof mod.eligible === 'function') {
    for (const c of cards) for (const letter of Object.keys(MOCK_SECTIONS)) if (mod.eligible(c.id, letter) || mod.eligible(c, letter)) add(letter, [c.id]);
    return out;
  }
  if (typeof mod.candidates === 'function' || typeof mod.candidatesFor === 'function') {
    const fn = mod.candidates ?? mod.candidatesFor;
    for (const letter of Object.keys(MOCK_SECTIONS)) {
      const list = fn(letter, cards) ?? [];
      add(letter, list.map((x) => (typeof x === 'string' ? x : x.id)).filter(Boolean));
    }
    return out;
  }
  const entries = Array.isArray(bp) ? bp : (bp && typeof bp === 'object' ? Object.entries(bp).map(([k, v]) => ({ id: k, ...v })) : null);
  if (!entries) return null;
  for (const slot of entries) {
    const letter = String(slot.section ?? slot.id ?? slot.letter ?? '').toUpperCase().charAt(0);
    if (!MOCK_SECTIONS[letter]) continue;
    const ids = slot.ids ?? slot.sources ?? slot.originals ?? slot.candidates;
    if (Array.isArray(ids)) add(letter, ids.map((x) => (typeof x === 'string' ? x : x.id)).filter((x) => byId[x]));
    const skills = slot.skills ?? (slot.slots ? slot.slots.flatMap((s) => s.skills ?? []) : null);
    if (Array.isArray(skills)) add(letter, cards.filter((c) => !c.bonus && c.skills.some((s) => skills.includes(s))).map((c) => c.id));
  }
  return Object.keys(out).length ? out : null;
}

test('coverage: every non-bonus id is Mock-eligible (≥ 1 section), every section has ≥ 3 candidates, bonus never (manifest; blueprint.js when it exists)', async () => {
  const perSection = {};
  for (const row of manifest) {
    const sections = mockSections(row.id);
    if (row.bonus) { assert.deepEqual(sections, [], `${row.id}: bonus in the Mock`); continue; }
    assert.ok(sections.length >= 1, `${row.id}: ineligible for every Mock slot`);
    for (const s of sections) (perSection[s] ??= []).push(row.id);
  }
  for (const letter of Object.keys(MOCK_SECTIONS)) assert.ok((perSection[letter] ?? []).length >= 3, `Mock section ${letter} (${MOCK_SECTIONS[letter]}) has ${(perSection[letter] ?? []).length} candidate sources (want ≥ 3)`);
  // the S2 sentence: quad-* through slot E, fact-* through slot C
  for (const id of ['quad-01', 'quad-02', 'quad-03', 'fac-01', 'fac-18']) assert.ok(mockSections(id).includes('E'), `${id} in E`);
  for (const id of ['fact-01', 'fact-05', 'asn-01', 'qz-18']) assert.ok(mockSections(id).includes('C'), `${id} in C`);
  for (const id of ['ang-wu-1', 'cls-01']) assert.ok(mockSections(id).includes('B'), `${id} in B`);
  for (const id of ['voc-01', 'not-04', 'def-14']) assert.ok(mockSections(id).includes('A'), `${id} in A`);
  for (const id of ['ang-02', 'ang-10', 'doc-05', 'doc-07', 'wp-16']) assert.ok(mockSections(id).includes('D'), `${id} in D`);
  // fact-* are posed as verdict items: they must carry an asn part
  for (const id of nonBonus.filter((x) => mockSections(x).includes('C'))) assert.ok(byId[id].parts.some((p) => p.type === 'asn'), `${id}: section C needs an asn part`);
  if (!existsSync(BLUEPRINT)) {
    console.log('coverage: site/data/blueprint.js does not exist yet (T13) — Mock eligibility checked against the manifest only');
    return;
  }
  const bp = await blueprintCandidates();
  if (!bp) { console.log('coverage: blueprint.js has an unrecognised shape — export eligible(id, letter) or candidates(letter, cards) to be checked here'); return; }
  const eligible = new Set(Object.values(bp).flatMap((s) => [...s]));
  for (const id of nonBonus) assert.ok(eligible.has(id), `${id}: blueprint.js makes it ineligible for every Mock slot`);
  for (const id of manifestIds().filter(isBonus)) assert.ok(!eligible.has(id), `${id}: blueprint.js draws a bonus card`);
  for (const letter of Object.keys(MOCK_SECTIONS)) assert.ok((bp[letter]?.size ?? 0) >= 3, `blueprint section ${letter}: ${bp[letter]?.size ?? 0} candidates`);
});

// =====================================================================================
// 6. THE GOLDEN ROUND-TRIP — every stored answer of every part grades `correct`
// =====================================================================================

test('golden round-trip: every part of every card grades its own stored answer `correct` through grade() — all 17 part types', () => {
  const perType = {};
  for (const c of cards) {
    for (const p of c.parts) {
      const raw = correctRaw(c, p);
      assert.notEqual(raw, undefined, `${c.id}/${p.id}: no builder for part type ${p.type}`);
      assert.notEqual(raw, null, `${c.id}/${p.id}: no stored answer to round-trip`);
      if (p.type === 'pairs') assert.ok(Array.isArray(raw) && raw.length >= p.count, `${c.id}: teacherPairs must hold ≥ ${p.count} pairs`);
      const ctx = { card: c, state: {}, figure: c.figure ?? undefined, seed: `${c.id}|${p.id}` };
      const r = I.grade(p, raw, ctx);
      assert.notEqual(r.err, 'grader-error', `${c.id}/${p.id}: grader threw: ${r.error}`);
      assert.equal(r.kind, 'correct', `${c.id}/${p.id} (${p.type}) ${JSON.stringify(raw).slice(0, 120)} → ${r.kind}: ${r.msg}`);
      assert.equal(r.ok, true, `${c.id}/${p.id}: ok`);
      assert.equal(r.credit, 1, `${c.id}/${p.id}: credit ${r.credit}`);
      perType[p.type] = (perType[p.type] ?? 0) + 1;
    }
  }
  const total = Object.values(perType).reduce((a, b) => a + b, 0);
  assert.ok(total >= 280, `round-tripped ${total} parts: ${JSON.stringify(perType)}`);
  for (const t of CORRECT_RAW_TYPES) assert.ok(perType[t] >= 1, `part type ${t} never round-tripped`);
  assert.equal(CORRECT_RAW_TYPES.length, 17, 'S3 has 17 part types — a new one needs a correctRaw() builder');
});

// =====================================================================================
// 7. BUILD-POLICY §1 — nothing the school or Kuta owns is referenced from the data
// =====================================================================================

test('publication policy: no teacherKey / orig / crop / PNG reference in any file under site/data', () => {
  const list = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) list(p, out); else if (/\.m?js$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = list(join(ROOT, 'site', 'data'));
  assert.ok(files.length >= 12, `${files.length} data files scanned`);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // `srcFile` is T00's citation of where the stem was read from (documentation, byte-equal to the transcript);
    // every OTHER mention of a PNG / image path would be an asset reference and is forbidden.
    const withoutCitations = src.replace(/\bsrcFile\s*:\s*(['"`])(?:\\.|(?!\1).)*\1/g, 'srcFile: ""');
    assert.ok(!/\.png\b/i.test(withoutCitations), `${f}: references a PNG outside a srcFile citation`);
    assert.ok(!/\b(img|image|png|scan)\s*:\s*['"`]/.test(withoutCitations), `${f}: image field`);
    assert.ok(!/\bteacherKey\b/.test(src), `${f}: teacherKey`);
    assert.ok(!/\borig\s*:/.test(src), `${f}: orig:`);
    assert.ok(!/\bcrop\s*:/.test(src), `${f}: crop:`);
    assert.ok(!/Math\.random/.test(src), `${f}: Math.random`);
  }
  assert.ok(!existsSync(join(ROOT, 'site', 'content')), 'site/content/ must not exist (BUILD-POLICY §1)');
  const everything = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) everything(p, out); else out.push(p); }
    return out;
  };
  const scans = everything(join(ROOT, 'site')).filter((p) => /\.(png|jpe?g|gif|webp|pdf)$/i.test(p));
  assert.deepEqual(scans, [], `scans / PDFs under site/: ${scans.join(', ')}`);
});
