// T06a validation: structure, cross-file id agreement, verbatim §0 definitions, markup well-formedness.
import { readFileSync } from 'node:fs';
import { cards } from '/Users/oliver/Projects/unit1a-quest/site/data/cards/m1.js';
import { vocab } from '/Users/oliver/Projects/unit1a-quest/site/data/vocab.js';
import { sheetById } from '/Users/oliver/Projects/unit1a-quest/site/data/sheets.js';
import { moduleById } from '/Users/oliver/Projects/unit1a-quest/site/data/modules.js';
import { skillById } from '/Users/oliver/Projects/unit1a-quest/site/data/skills.js';
import { parse as nparse, same as nsame } from '/Users/oliver/Projects/unit1a-quest/site/js/grader/notation.js';
import { isKnownTag } from '/Users/oliver/Projects/unit1a-quest/site/data/misconceptions.js';

const src = readFileSync('/Users/oliver/Projects/unit1a-quest/content/SOURCE.md', 'utf8');
const sec0 = src.slice(src.indexOf('## 0.'), src.indexOf('## 1.'));
const errs = [];
const E = (m) => errs.push(m);
const ids = cards.map(c => c.id);

if (ids.length !== 55) E(`count ${ids.length}`);
if (new Set(ids).size !== 55) E('duplicate ids');
if (JSON.stringify(ids) !== JSON.stringify(sheetById.VOC.ids)) E('ids ≠ sheets.js VOC order');
if (JSON.stringify(ids) !== JSON.stringify(moduleById.M1.originals)) E('ids ≠ modules.js M1 originals');

const MARK = /\{(line|seg|ray|len|ang|m) ([A-Z]{2,3})\}/g;
const checkMarkup = (id, s) => {
  if (typeof s !== 'string') return;
  for (const m of s.matchAll(/\{[^}]*\}/g)) {
    const t = m[0];
    const ok = /^\{(line|seg|ray|len) [A-Z]{2}\}$/.test(t) || /^\{(ang|m) [A-Z]{3}\}$/.test(t);
    if (!ok) E(`${id} bad markup ${t}`);
  }
};
const walk = (id, v) => { if (typeof v === 'string') checkMarkup(id, v); else if (Array.isArray(v)) v.forEach(x => walk(id, x)); else if (v && typeof v === 'object') Object.values(v).forEach(x => walk(id, x)); };

const tags = new Set();


for (const c of cards) {
  walk(c.id, c);
  for (const k of ['id', 'module', 'sheet', 'src', 'srcFile', 'tier', 'par', 'skills', 'stem', 'parts', 'hints', 'solution', 'misconceptions'])
    if (c[k] === undefined) E(`${c.id} missing ${k}`);
  if (c.module !== 'M1' || c.sheet !== 'VOC') E(`${c.id} module/sheet`);
  if (![1, 2].includes(c.tier)) E(`${c.id} tier ${c.tier}`);
  if (!(c.par > 0)) E(`${c.id} par`);
  if (!Array.isArray(c.skills) || !c.skills.length) E(`${c.id} skills`);
  for (const s of c.skills) if (!skillById[s]) E(`${c.id} unknown skill ${s}`);
  const want = { voc: 'VOC', not: 'NOTE', def: 'VOC', fact: 'ASN-PLP', cls: 'CLASS' }[c.id.split('-')[0]];
  if (c.skills[0] !== want) E(`${c.id} skill should be ${want}`);
  if (!Array.isArray(c.hints) || c.hints.length !== 3 || c.hints.some(h => typeof h !== 'string' || !h)) E(`${c.id} hints[3]`);
  if (!Array.isArray(c.solution) || !c.solution.length || c.solution.some(st => typeof st.say !== 'string' || typeof st.math !== 'string')) E(`${c.id} solution`);
  if (!c.parts.length) E(`${c.id} no parts`);
  if (c.pick && c.pick !== 'one') E(`${c.id} pick`);
  if (c.figure && c.figure.id !== 'F1') E(`${c.id} figure`);
  const partIds = new Set();
  for (const p of c.parts) {
    if (!p.id || !p.type) E(`${c.id} part id/type`);
    if (partIds.has(p.id)) E(`${c.id} dup part id ${p.id}`); partIds.add(p.id);
    switch (p.type) {
      case 'mc': {
        if (typeof p.answer !== 'string' || !p.answer) E(`${c.id} mc answer`);
        if (!Array.isArray(p.distractors) || p.distractors.length !== 3) E(`${c.id} mc distractors`);
        for (const d of p.distractors) if (typeof d === 'object' && (!d.text || !d.why || (d.tag && !isKnownTag(d.tag)))) E(`${c.id} mc distractor object ${JSON.stringify(d)}`);
        const all = [p.answer, ...p.distractors.map(d => typeof d === 'string' ? d : d.text)];
        if (new Set(all).size !== 4) E(`${c.id} mc options not unique`);
        break;
      }
      case 'term':
        if (!Array.isArray(p.answers) || !p.answers.length) E(`${c.id} term answers`);
        break;
      case 'termmatch': {
        if (!Array.isArray(p.pairs) || p.pairs.length !== 6) E(`${c.id} termmatch 6`);
        if (new Set(p.pairs.map(x => x.term)).size !== 6 || new Set(p.pairs.map(x => x.def)).size !== 6) E(`${c.id} termmatch unique`);
        if (p.blitz !== false) E(`${c.id} termmatch blitz flag`);
        break;
      }
      case 'cloze': {
        const n = (p.text.match(/\[_\]/g) || []).length;
        if (n !== p.blanks.length) E(`${c.id} cloze blanks ${n} vs ${p.blanks.length}`);
        for (const b of p.blanks) {
          for (const k of Object.keys(b.why ?? {})) if (!b.options.includes(k) || k === b.answer) E(`${c.id} cloze why key ${k} not a wrong option`);
          if (!b.options.includes(b.answer)) E(`${c.id} cloze answer not in options`);
          if (b.options.length !== 4 || new Set(b.options).size !== 4) E(`${c.id} cloze 4 unique options`);
        }
        // verbatim check against §0: fill the blanks and look for the sentence (case-insensitive, trailing punctuation loose)
        let filled = p.text; for (const b of p.blanks) filled = filled.replace('[_]', b.answer);
        const needle = filled.replace(/[.;]$/, '').toLowerCase();
        if (!sec0.toLowerCase().includes(needle)) E(`${c.id} cloze not verbatim: ${filled}`);
        break;
      }
      case 'notation': {
        if (!['line', 'seg', 'len', 'ray', 'ang', 'm', 'plane'].includes(p.kind)) E(`${c.id} notation kind`);
        if (!Array.isArray(p.pts) || p.pts.some(x => !p.letters.includes(x))) E(`${c.id} notation pts/letters`);
        if (p.kind === 'ang' && p.pts.length !== 3) E(`${c.id} ang pts`);
        if (p.kind !== 'ang' && p.pts.length !== 2) E(`${c.id} pts length`);
        break;
      }
      case 'classify':
        if (!p.options.includes(p.answer)) E(`${c.id} classify answer`);
        if (!/^\d+$/.test(p.measure)) E(`${c.id} classify measure`);
        break;
      case 'asn':
        if (!['A', 'S', 'N'].includes(p.answer)) E(`${c.id} asn answer`);
        if (!p.statement || !p.reason || p.distractors?.length !== 2) E(`${c.id} asn reason/distractors`);
        if (!p.mock) E(`${c.id} asn mock flag`);
        break;
      default: E(`${c.id} unknown part type ${p.type}`);
    }
  }
  if (c.pick === 'one' && c.parts.length < 2) E(`${c.id} pick:one with one part`);
  // misconceptions must be reachable: answer must be a live wrong option of some part
  for (const m of c.misconceptions) {
    if (m.tag !== undefined) { tags.add(m.tag); if (!isKnownTag(m.tag)) E(`${c.id} uncatalogued tag ${m.tag}`); }
    if (!m.msg || !m.answer || !m.part) E(`${c.id} misconception shape`);
    const live = c.parts.some(p => {
      if (m.part && p.id !== m.part) return false;
      if (p.type === 'mc') return p.distractors.map(d => typeof d === 'string' ? d : d.text).includes(m.answer);
      if (p.type === 'term') return vocab.some(v => v.term === m.answer) && !p.answers.includes(m.answer);
      if (p.type === 'cloze') return p.blanks.some(b => b.options.includes(m.answer) && b.answer !== m.answer);
      if (p.type === 'classify') return p.options.includes(m.answer) && p.answer !== m.answer;
      if (p.type === 'notation') { const c = nparse(m.answer); return !!c && !nsame(c, { kind: p.kind, pts: p.pts }); }
      return false;
    });
    if (!live) E(`${c.id} misconception unreachable: ${m.answer}`);
  }
}
// vocab defs verbatim in §0 (non-derived)
for (const v of vocab) {
  if (v.derived) continue;
  const needle = v.def.toLowerCase();
  if (!sec0.toLowerCase().includes(needle)) E(`${v.id} def not verbatim: ${v.def}`);
}
// F1 geometry claims
const deg = { D: 0, C: 31, B: 90, A: 180, E: 211 };
const ang = (x, y) => { let d = Math.abs(deg[x] - deg[y]); return d > 180 ? 360 - d : d; };
for (const [x, y, w] of [['C','D',31],['B','F',null],['B','C',59],['B','D',90],['A','E',31],['B','E',121],['A','C',149],['A','D',180]]) if (w !== null && ang(x, y) !== w) E(`F1 ${x}F${y} = ${ang(x,y)} not ${w}`);

console.log('tags used:', [...tags].join(', '));
console.log('tiers:', Object.entries(cards.reduce((a, c) => (a[c.tier] = (a[c.tier] || 0) + 1, a), {})).map(([k, v]) => `t${k}=${v}`).join(' '));
console.log(errs.length ? errs : 'M1 OK (55 cards)');
process.exitCode = errs.length ? 1 : 0;
