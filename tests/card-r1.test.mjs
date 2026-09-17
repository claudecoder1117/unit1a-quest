// tests/card-r1.test.mjs — visual QA round 1, group "Card screen + every widget".
//
// The DOM-free halves of the round-1 fixes: the strip grader's charged-slot skip (Submit is idempotent, S3),
// the reject menu's single-root filtering (no leaked root, no "both" of one), the singular "valid" wording
// being recognised, the ang-10 misconception lines no longer spelling out the factorization (S3: `roots`
// never reveals the missing root), the wedge hit floor in svg.js's constants, and normalizeItem() putting a
// rotated voc card's question on the paper. The DOM halves (the re-tap guard in card.js gradeEntry, the
// pips of factored/equation, the phone order) are pinned by source scans and were checked in the browser
// (scratchpad/fix/*.png in the fixer's report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './_helpers.mjs';

import { grade as gradeStrip } from '../site/js/grader/strip.js';
import { grade as gradeAny, ready as gradersReady } from '../site/js/grader/index.js';
import { menu, grade as gradeReject } from '../site/js/grader/reject.js';
import { byId } from '../site/data/cards.js';
import { normalizeItem } from '../site/js/screens/card.js';

await gradersReady;   // the dispatcher lazy-loads its graders (card.js awaits the same promise)

const card = (id) => byId[id] ?? byId.get?.(id);
const part = (id, pid) => card(id).parts.find((p) => p.id === pid);

test('card r1 / strip: a slot the screen already charged is never the "newest" miss again', () => {
  const p = part('doc-05', 'strip') ?? card('doc-05').parts.find((x) => x.type === 'strip');
  const wrongEq = p.slots[0].options.find((o) => (typeof o === 'string' ? o : o.text) !== p.slots[0].answer);
  const raw = { [p.slots[0].id]: typeof wrongEq === 'string' ? wrongEq : wrongEq.text };
  const first = gradeAny(p, raw, { state: {} });
  assert.equal(first.kind, 'wrong', 'the first submit of a wrong pick is a charged miss');
  assert.equal(first.reveal?.id, p.slots[0].id);
  // the screen records the reveal (card.js rememberWrong → ctx.state.charged) and the student taps Submit again
  const again = gradeAny(p, raw, { state: { charged: [p.slots[0].id] } });
  assert.equal(again.kind, 'malformed', 'the re-tap is free');
  assert.match(again.msg, /^Next: /, 'and points at the next slot instead of re-reporting the revealed one');
  assert.equal(again.slots[0].state, 'revealed', 'the revealed row stays revealed');
  // the same call on the pure strip grader (no dispatcher) behaves identically
  assert.equal(gradeStrip(p, raw, { state: { charged: [p.slots[0].id] }, gradePart: gradeAny }).kind, 'malformed');
});

test('card r1 / reject menu: one root found → no chip names the unseen root, none says "both" of one', () => {
  const p = part('ang-10', 'keep');
  const full = menu(p).map((c) => c.text);
  assert.ok(full.some((t) => /−1\/2|-1\/2/.test(t)), 'the full menu carries the −1/2 distractor (both roots on screen)');
  assert.ok(full.some((t) => /\bboth\b/i.test(t)));
  const one = menu(p, { roots: ['3'] }).map((c) => c.text);
  assert.ok(!one.some((t) => /−1\/2|-1\/2/.test(t)), `a chip leaked the missing root: ${one.join(' | ')}`);
  assert.ok(!one.some((t) => /\bboth\b|\bneither\b/i.test(t)), `a "both"/"neither" chip with one root: ${one.join(' | ')}`);
  assert.ok(one.some((t) => /^valid/.test(t)), 'a singular "valid" chip stands in for both-valid');
  assert.ok(one.includes('3 makes m∠BFC = 81 which is too big'), 'chips about the FOUND root stay');
  // both roots found → the menu is the full one
  assert.deepEqual(menu(p, { roots: ['3', '-1/2'] }).map((c) => c.text).sort(), full.slice().sort());
});

test('card r1 / reject grade: keeping the one found root with the singular wording is correct', () => {
  const p = part('ang-10', 'keep');
  const r = gradeReject(p, { keep: ['3'], reject: [], reason: 'valid — every measure comes out positive' }, { roots: ['3'] });
  assert.equal(r.kind, 'correct', r.msg);
  assert.equal(r.reasonOk, true);
  const bad = gradeReject(p, { keep: ['3'], reject: [], reason: 'only integers are allowed' }, { roots: ['3'] });
  assert.equal(bad.kind, 'wrong');
});

test('card r1 / S3: no forgot-second-root line in the content spells out a factor or the other root', () => {
  const leak = /\([a-z]\s*[+−-]\s*\d+\)\s*\([a-z]|\d+[a-z]\([a-z]\s*[+−-]\s*\d+\)|\bx = 0\b/;
  for (const c of Object.values(byId)) {
    if (!c || !Array.isArray(c.misconceptions)) continue;
    for (const m of c.misconceptions) {
      if (m?.tag !== 'forgot-second-root') continue;
      assert.ok(!leak.test(String(m.msg)), `${c.id}: "${m.msg}" reveals the factorization`);
    }
  }
  const ang10 = card('ang-10').misconceptions.filter((m) => m.tag === 'forgot-second-root');
  assert.equal(ang10.length, 2);
  for (const m of ang10) assert.equal(m.msg, "That's one root — there's another. Set each factor to 0.");
});

test('card r1 / normalizeItem: a rotated voc card puts the question on the paper, once', () => {
  const v = card('voc-01');
  assert.match(v.stem, /^Vocabulary — §0 term 1 of 23\.$/, 'the data keeps its index label');
  for (let hist = 0; hist < 3; hist++) {
    const item = normalizeItem(v, { kind: 'card', histLen: hist });
    assert.equal(item.parts.length, 1);
    assert.equal(item.stem, v.parts[hist % 3].prompt, `rotation ${hist}: the paper reads the mounted part's question`);
    assert.equal(item.parts[0].prompt, '', 'and the widget does not repeat it');
    assert.equal(item.parts[0].type, v.parts[hist % 3].type);
  }
  // a card with a real stem is untouched
  const w = normalizeItem(card('wp-01'), { kind: 'card' });
  assert.equal(w.stem, card('wp-01').stem);
});

test('card r1 / source pins: the re-tap guard, the pips, the wedge floor, one Continue', () => {
  const cardSrc = read('site/js/screens/card.js');
  assert.match(cardSrc, /isRepeatWrong\(entry, part, res, raw\)/, 'gradeEntry checks for a repeated wrong answer');
  assert.match(cardSrc, /entry\.lastChargedRaw = rawKey\(raw\)/, 'chargeWrong remembers the charged raw');
  assert.match(cardSrc, /entry\.ctx\.state\.charged = \[\.\.\.entry\.chargedSlots\]/, 'strips hand their charged slots to the grader');
  assert.ok(!/'Continue'\)\);\s*result\.append\(actions\)/.test(cardSrc), 'the result strip no longer repeats the dock Continue');
  assert.match(cardSrc, /dockHint/, 'the dock carries a Hint button on phones');
  assert.match(read('site/js/widgets/factored.js'), /pips: \(\) => \(\{ total: 1, filled: f\.wrap\.dataset\.state === 'ok' \? 1 : 0 \}\)/);
  assert.match(read('site/js/widgets/equation.js'), /pips: \(\) => \(\{ total: 1, filled: root\.dataset\.kind === 'correct' \? 1 : 0 \}\)/);
  const m = /const WEDGE_MIN = (\d+), WEDGE_MAX = (\d+), BAND = (\d+), MIN_CHORD = (\d+);/.exec(read('site/js/figure/svg.js'));
  assert.ok(m, 'svg.js wedge constants');
  // at 375 px the figure paints ≈ 0.78 css px per viewBox unit, so 44 px needs ≥ 57 vb of chord / band
  assert.ok(+m[3] >= 57 && +m[4] >= 57, `BAND ${m[3]} / MIN_CHORD ${m[4]} are under the 44 px floor at 375`);
  assert.ok(+m[2] >= +m[4] / (2 * Math.sin(Math.PI * 13 / 180)), 'WEDGE_MAX lets a 26° wedge reach the chord');
  const css = read('site/css/polish.css');
  assert.match(css, /grid-template-areas: "head" "stage" "parts" "foot" "result" "solution" "side" "sandbox"/, 'phones: parts before Scratch/hints');
});
