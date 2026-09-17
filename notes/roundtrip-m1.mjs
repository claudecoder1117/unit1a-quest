// Round-trip every M1 part through the REAL graders (site/js/grader/*).
import { cards } from '/Users/oliver/Projects/unit1a-quest/site/data/cards/m1.js';
import { TERMS } from '/Users/oliver/Projects/unit1a-quest/site/data/vocab.js';
import * as mc from '/Users/oliver/Projects/unit1a-quest/site/js/grader/mc.js';
import * as term from '/Users/oliver/Projects/unit1a-quest/site/js/grader/term.js';
import * as termmatch from '/Users/oliver/Projects/unit1a-quest/site/js/grader/termmatch.js';
import * as cloze from '/Users/oliver/Projects/unit1a-quest/site/js/grader/cloze.js';
import * as notation from '/Users/oliver/Projects/unit1a-quest/site/js/grader/notation.js';
import * as classify from '/Users/oliver/Projects/unit1a-quest/site/js/grader/classify.js';
import * as asn from '/Users/oliver/Projects/unit1a-quest/site/js/grader/asn.js';
import { mathfmt, stripMarkup } from '/Users/oliver/Projects/unit1a-quest/site/js/mathfmt.js';

const errs = [];
const E = (m) => errs.push(m);
let n = 0, wrongs = 0;
const ctxSeed = { seed: 'rt' };

for (const c of cards) {
  for (const p of c.parts) {
    const id = `${c.id}/${p.id}`;
    switch (p.type) {
      case 'mc': {
        n++;
        const ok = mc.grade(p, p.answer, ctxSeed);
        if (!ok.ok || ok.kind !== 'correct') E(`${id} correct answer graded ${ok.kind}`);
        // by index too
        const opts = mc.options(p, 'rt');
        const idx = opts.findIndex(o => o.ok);
        if (!mc.grade(p, idx, ctxSeed).ok) E(`${id} correct index graded wrong`);
        if (opts.length !== 4) E(`${id} options ${opts.length}`);
        for (const d of p.distractors) {
          wrongs++;
          const r = mc.grade(p, d.text, ctxSeed);
          if (r.kind !== 'wrong') E(`${id} distractor graded ${r.kind}`);
          if (r.msg !== d.why) E(`${id} distractor msg not the authored why: ${r.msg}`);
          if (d.tag && !r.tags.includes(d.tag)) E(`${id} distractor tag not emitted`);
          if (!c.misconceptions.some(m => m.answer === d.text)) E(`${id} distractor has no card-level misconception`);
        }
        if (mc.grade(p, '', ctxSeed).kind !== 'malformed') E(`${id} empty not malformed`);
        break;
      }
      case 'term': {
        n++;
        for (const a of p.answers) { const r = term.grade(p, a, { terms: TERMS }); if (!r.ok) E(`${id} alias "${a}" graded ${r.kind}`); }
        // case / punctuation / spacing insensitivity
        const r2 = term.grade(p, `  ${p.answers[0].toUpperCase()}. `, { terms: TERMS }); if (!r2.ok) E(`${id} uppercase form failed`);
        for (const cf of p.confusables) {
          wrongs++;
          const r = term.grade(p, cf.term, { terms: TERMS });
          if (r.kind !== 'wrong') E(`${id} confusable "${cf.term}" graded ${r.kind} (answers ${p.answers.join('|')})`);
          else if (r.msg !== cf.msg) E(`${id} confusable msg not authored: ${r.msg}`);
        }
        if (term.grade(p, '', { terms: TERMS }).kind !== 'malformed') E(`${id} empty not malformed`);
        break;
      }
      case 'termmatch': {
        n++;
        const lay = termmatch.layout(p, 'rt');
        if (lay.defs.every((d, k) => d.i === k)) E(`${id} layout not shuffled`);
        const all = Object.fromEntries(p.pairs.map(x => [x.term, x.def]));
        const r = termmatch.grade(p, all, ctxSeed);
        if (!r.ok || r.credit !== 1) E(`${id} full match graded ${r.kind} ${r.credit}`);
        const swapped = { ...all, [p.pairs[0].term]: p.pairs[1].def, [p.pairs[1].term]: p.pairs[0].def };
        const rs = termmatch.grade(p, swapped, ctxSeed);
        if (rs.kind !== 'wrong' || Math.abs(rs.credit - 4 / 6) > 1e-9) E(`${id} swapped pair graded ${rs.kind} ${rs.credit}`);
        break;
      }
      case 'cloze': {
        n++;
        const segs = cloze.parseCloze(p.text).filter(s => s.type === 'blank');
        if (segs.length !== p.blanks.length) E(`${id} parseCloze blanks ${segs.length} vs ${p.blanks.length}`);
        const right = p.blanks.map(b => b.answer);
        const r = cloze.grade(p, right, {});
        if (!r.ok || r.credit !== 1) E(`${id} correct blanks graded ${r.kind} ${JSON.stringify(r.fields.map(f => [f.raw, f.kind, f.msg]))}`);
        p.blanks.forEach((b, i) => {
          for (const o of b.options) {
            if (o === b.answer) continue;
            wrongs++;
            const raw = right.slice(); raw[i] = o;
            const rr = cloze.grade(p, raw, {});
            if (rr.kind !== 'wrong') E(`${id} blank ${i} option "${o}" graded ${rr.kind} (answer "${b.answer}")`);
            else if (b.why?.[o] && rr.msg !== b.why[o]) E(`${id} blank ${i} "${o}" msg not authored: ${rr.msg}`);
            const choices = cloze.choicesFor(p, i);
            if (!choices || choices.length !== 4) E(`${id} blank ${i} choicesFor ${choices}`);
          }
        });
        const blank = right.slice(); blank[0] = '';
        if (cloze.grade(p, blank, {}).kind !== 'malformed') E(`${id} empty blank not malformed`);
        break;
      }
      case 'notation': {
        n++;
        const good = { kind: p.kind, pts: p.pts };
        if (!notation.grade(p, good, {}).ok) E(`${id} canonical object graded wrong`);
        // unordered kinds accept reversed letters; ray does not
        const rev = { kind: p.kind, pts: p.kind === 'ang' ? [p.pts[2], p.pts[1], p.pts[0]] : [...p.pts].reverse() };
        const rr = notation.grade(p, rev, {});
        if (p.kind === 'ray') { if (rr.ok || !rr.tags.includes('ray-order')) E(`${id} reversed ray should be wrong with ray-order`); }
        else if (!rr.ok) E(`${id} reversed letters should be accepted for ${p.kind}`);
        for (const m of c.misconceptions) {
          wrongs++;
          const parsed = notation.parse(m.answer);
          if (!parsed) { E(`${id} misconception answer not parseable: ${m.answer}`); continue; }
          const r = notation.grade(p, parsed, {});
          if (r.kind !== 'wrong') E(`${id} misconception "${m.answer}" graded ${r.kind}`);
          if (!r.msg) E(`${id} no message for ${m.answer}`);
        }
        if (notation.grade(p, null, {}).kind !== 'malformed') E(`${id} null not malformed`);
        break;
      }
      case 'classify': {
        n++;
        if (classify.validate(p).length) E(`${id} validate: ${classify.validate(p)}`);
        if (!classify.grade(p, p.answer, {}).ok) E(`${id} correct bucket wrong`);
        if (!classify.grade(p, p.answer[0], {}).ok) E(`${id} letter shortcut wrong`);
        for (const o of p.options) if (o !== p.answer) { wrongs++; const r = classify.grade(p, o, {}); if (r.kind !== 'wrong' || !r.msg) E(`${id} ${o} graded ${r.kind}`); }
        break;
      }
      case 'asn': {
        n++;
        const r = asn.grade(p, p.answer, { mode: 'card' });
        if (!r.ok || !r.showReason || r.askReason) E(`${id} correct verdict: ${JSON.stringify([r.kind, r.showReason, r.askReason])}`);
        for (const v of ['A', 'S', 'N']) if (v !== p.answer) { wrongs++; const w = asn.grade(p, v, { mode: 'card' }); if (w.kind !== 'wrong' || !w.askReason) E(`${id} wrong verdict ${v}: ${w.kind} ask=${w.askReason}`); }
        const mk = asn.grade(p, p.answer, { mode: 'mock' }); if (mk.reason !== null || mk.askReason) E(`${id} mock shows reason`);
        if (asn.chips(p, 'rt').length !== 3) E(`${id} chips`);
        const full = asn.grade(p, { verdict: p.answer, reason: p.reason }, { mode: 'full36' }); if (!full.ok || full.withHints) E(`${id} full36 right chip`);
        const bad = asn.grade(p, { verdict: p.answer, reason: p.distractors[0] }, { mode: 'full36' }); if (!bad.ok || !bad.withHints) E(`${id} full36 wrong chip should be ok+withHints`);
        break;
      }
      default: E(`${id} unknown type ${p.type}`);
    }
  }
  // markup renders with no literal braces left behind
  const strings = [];
  const walk = (v) => { if (typeof v === 'string') strings.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(c);
  for (const s of strings) {
    if (!/\{/.test(s)) continue;
    const html = mathfmt(s);
    if (/[{}]/.test(html)) E(`${c.id} mathfmt left braces in: ${s}`);
    if (/[{}]/.test(stripMarkup(s))) E(`${c.id} stripMarkup left braces in: ${s}`);
  }
}
console.log(`parts graded: ${n}; wrong-option probes: ${wrongs}`);
console.log(errs.length ? errs : 'ROUND-TRIP OK');
process.exitCode = errs.length ? 1 : 0;
