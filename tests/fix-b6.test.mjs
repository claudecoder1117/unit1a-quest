// tests/fix-b6.test.mjs — keeps ticket FIX:B6 from rotting back (card side rail + mc/termmatch).
//
// Two defects, both of the family notes/LAYOUT-ROOT.md names: a text box with no floor, and a
// component that did not lay itself out from its own width.
//
//  9  the hint ladder's button printed its COUNT as a bare text node next to a real <span>. A bare
//     text node is an anonymous flex item — no rule can reach it — so when the ladder was narrower
//     than the button's max-content width it was "Hint 3 of 3" that broke ("Hint 3 of" / "3") while
//     the optional qualifier kept a full line. Measured: qualifier 17.1ch in a 27.7ch button.
//  16 `.wd-opts` (mc, strip) and `.w-tm-defs` (termmatch) were one-column GRIDS of <button>s. WebKit
//     does not re-run intrinsic row sizing for that grid when its inline size changes, so after the
//     card's landscape rule narrowed the answer column the options kept the row heights they had at
//     the wide size: a 46.6 px box holding 69.3 px of text, spilling 36 px through the next option.
//
// Static assertions over the shipped CSS/JS — no browser. The measured proof (both engines, both
// themes, the auditor's own resize path) is `node qa/fixb6-sweep.mjs` and `node qa/fixb6-probe.mjs`;
// the audit slice is `node qa/layout-audit.mjs --only card-wp-01-hint,card-wp-04-hint,card-termmatch`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const CARD_JS = read('site/js/screens/card.js');
const POLISH = read('site/css/polish.css');
// only THIS ticket's block: polish.css is append-only and other lanes add their own after it
const B6 = POLISH.slice(POLISH.indexOf('=== fix:B6'), POLISH.indexOf('=== /fix:B6 ==='));

test('fix:B6 — the hint button has no bare text node: both labels are elements', () => {
  assert.ok(B6.length > 0, 'the fix:B6 block is gone from polish.css');
  assert.match(CARD_JS, /span\.card-hint-n/, 'the hint count lost its own element (it is unstylable as a text node)');
  assert.match(CARD_JS, /span\.card-hint-q/, 'the hint qualifier lost its own element');
  // the three places that write the label all go through the one helper
  assert.equal((CARD_JS.match(/setHintLabel\(/g) || []).length, 3, 'a hint label is written somewhere other than setHintLabel()');
  assert.ok(!/hintBtn\.append\(/.test(CARD_JS), 'hintBtn.append() is back — that is how the bare text node returned');
  assert.ok(!/hintBtn\.textContent\s*=\s*'[^']/.test(CARD_JS), 'a hint label is written as raw text again');
});

test('fix:B6 — the hint qualifier has a real floor, not `auto`', () => {
  // flex breaks a line from each item's HYPOTHETICAL size, so `flex: 1 1 auto` (basis = max-content)
  // is not a floor at all: it would put the qualifier on its own line the moment the text is long.
  assert.match(B6, /\.card-hint-btn > \.card-hint-q\s*\{[^}]*flex:\s*1\s+1\s+18ch/, 'the qualifier lost its 18ch basis');
  assert.match(B6, /\.card-hint-btn > \.card-hint-q\s*\{[^}]*min-width:\s*min\(100%,\s*18ch\)/, 'the qualifier lost its min-width floor');
  assert.match(B6, /\.card-hint-btn > \.card-hint-n\s*\{[^}]*white-space:\s*nowrap/, 'the hint COUNT may never break');
  assert.match(B6, /\.card-hint-btn\s*\{[^}]*flex-wrap:\s*wrap/, 'the button must be able to give the qualifier its own line');
});

test('fix:B6 — a one-column list of <button>s is a flex column, never a grid', () => {
  assert.match(B6, /\.wd-opts,\s*\.w-tm-defs\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/,
    'the option / definition lists are grids again — WebKit keeps their stale row heights on resize');
});

test('fix:B6 — the two answer text tracks keep a ch floor', () => {
  assert.match(B6, /\.wd-opt > \.wd-opt-t\s*\{[^}]*flex:\s*1\s+1\s+12ch/, '.wd-opt-t lost its 12ch basis');
  assert.match(B6, /\.wd-opt > \.wd-opt-t\s*\{[^}]*min-width:\s*min\(100%,\s*12ch\)/, '.wd-opt-t is back to `min-width: 0`');
  assert.match(B6, /\.w-tm-def\s*\{\s*grid-template-columns:\s*24px minmax\(min\(100%,\s*12ch\),\s*1fr\)/,
    '.w-tm-def is back to `24px minmax(0, 1fr)` — a 0 px minimum on a column that holds words');
});

test('fix:B6 — the block is responsive by container, never by viewport', () => {
  // LAYOUT-ROOT: a component hosted at a width unrelated to the viewport queries its OWN box. Nothing
  // in this block may decide a widget's columns from @media.
  // the block opens inside a comment (the slice starts at the tag), so drop through its close first
  const rules = B6.slice(B6.indexOf('*/')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/@media/.test(rules), 'fix:B6 added an @media rule — every rule in this block is about a component\'s own box');
});
