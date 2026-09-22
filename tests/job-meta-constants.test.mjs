// tests/job-meta-constants.test.mjs — J7 (meta lane). The printed prose may not drift from the constants.
//
// G7 gives Stats and Settings one job apiece: PRINT THE FORMULA. A panel that prints "the bar is 0.10"
// as a string literal is not printing the formula — it is repeating a number that was true when it was
// typed. The moment `RATING.calibratedBrierMax`, `CREW.capacityMax` or `CREDIT.k` is rebalanced, that
// panel lies to the student, silently, with a straight face, and every existing test stays green
// because every existing test compares the literal to a literal.
//
// This file closes that class. Two arms, and both are needed:
//
//   1. SOURCE — the sentence must INTERPOLATE the constant, not restate it. A regex over the source is
//      the only way to see the difference: `${CREDIT.k}` and `40` render the same string today and
//      diverge on the day someone changes the constant. (Same technique, and same reason, as
//      job-index.test.mjs's source arm — there is no DOM under `node --test`; BUILD-POLICY §3.)
//
//   2. ARITHMETIC — the derived sentence must also be TRUE. `maxBuildAtCeiling` is a shipped constant,
//      so "12 manned costs 12 points and the remaining 10 buy 10 HELD upgrades" is only honest while
//      that constant agrees with `capacityMax − mannedMax·COSTS.STEADY`. Interpolating a wrong constant
//      is still a lie, so arm 1 alone is not enough.
//
// Scope: the three files the meta lane owns (screens/stats.js, screens/settings.js, data/trophies.js).

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, readIfAny } from './_helpers.mjs';

import { CREW, RATING, CREDIT } from '../site/data/job.js';
import { COSTS, CAPACITY_MAX, MANNED_MAX, STAMPS_MAX, CHAIN_HOLD_MIN, MAKES } from '../site/js/job/crew.js';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const STATS = read('site/js/screens/stats.js');
const SETTINGS = read('site/js/screens/settings.js');

/** The prose of a panel, with the block comments that explain it stripped out. A comment may name a
 *  number freely — it is the rendered sentence that must derive. */
const prose = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

describe('J7 meta · the printed prose derives from the live constants (G7)', () => {
  describe('1 · source: the sentence interpolates the constant', () => {
    test('Stats prints the Brier bar from RATING.calibratedBrierMax, never as "0.10"', () => {
      const p = prose(STATS);
      assert.match(p, /at or under \$\{n2\(RATING\.calibratedBrierMax\)\}/,
        'the "at or under" arm must interpolate the constant');
      assert.match(p, /the bar is \$\{n2\(RATING\.calibratedBrierMax\)\}/,
        'the "the bar is" arm must interpolate the constant');
      assert.ok(!/(at or under|the bar is) 0\.10/.test(p),
        'a literal 0.10 in the calibration line survives a rebalance of RATING.calibratedBrierMax');
    });

    test('Stats prints the capacity formula from CREW, never as "8 + floor(level / 2)"', () => {
      const p = prose(STATS);
      assert.match(p, /\$\{cap\.base\} \+ floor\(level \/ \$\{CREW\.levelsPerPoint\}\)/,
        'the capacity formula must interpolate both the base and the divisor');
      assert.match(p, /of \$\{STAMPS_MAX\} stamps/, 'the stamp ceiling must interpolate STAMPS_MAX');
      assert.match(p, /STEADY costs \$\{COSTS\.STEADY\}/);
      assert.match(p, /HELD costs \$\{COSTS\.HELD\}/);
      assert.match(p, /holds the chain at \$\{CHAIN_HOLD_MIN\}/);
      assert.ok(!/8 \+ floor\(level \/ 2\)/.test(p), 'the capacity formula is hardcoded');
      assert.ok(!/of 7 stamps/.test(p), 'the stamp ceiling is hardcoded');
    });

    test('Stats prints the ceiling build from MANNED_MAX / CAPACITY_MAX / maxBuildAtCeiling', () => {
      const p = prose(STATS);
      assert.match(p, /\$\{MANNED_MAX\} manned costs \$\{MANNED_MAX \* COSTS\.STEADY\} points/);
      assert.match(p, /remaining \$\{CAPACITY_MAX - MANNED_MAX \* COSTS\.STEADY\}/);
      assert.match(p, /\$\{CREW\.maxBuildAtCeiling\.held\} HELD/);
      assert.match(p, /\$\{CREW\.maxBuildAtCeiling\.steady\} STEADY/);
      assert.match(p, /\$\{CREW\.maxBuildAtCeiling\.bare\}\s*\`?\s*\+?\s*'?\s*makes always bare/,
        'the bare count must interpolate maxBuildAtCeiling.bare');
      assert.ok(!/12 manned costs 12 points/.test(p), 'the ceiling sentence is hardcoded');
      assert.ok(!/seven makes always bare/.test(p), 'the bare count is spelled out as a word');
    });

    test('Settings prints the propriety second derivative from CREDIT.k, never as "−80"', () => {
      const p = prose(SETTINGS);
      assert.match(p, /The second derivative is −\$\{2 \* CREDIT\.k\}/,
        'd²E/dp² = −2k must interpolate CREDIT.k');
      assert.ok(!/The second derivative is −80/.test(p),
        'a literal −80 survives a rebalance of CREDIT.k');
    });
  });

  describe('2 · arithmetic: the derived sentence is also true', () => {
    test('maxBuildAtCeiling is exactly what the capacity ceiling buys', () => {
      const spent = MANNED_MAX * COSTS.STEADY;
      const upgradeCost = COSTS.HELD - COSTS.STEADY;
      const remaining = CAPACITY_MAX - spent;
      assert.ok(remaining >= 0, 'the ceiling cannot even man the cap');
      assert.equal(CREW.maxBuildAtCeiling.held, Math.floor(remaining / upgradeCost),
        'the published HELD count is not what the remaining points buy');
      assert.equal(CREW.maxBuildAtCeiling.steady, MANNED_MAX - CREW.maxBuildAtCeiling.held,
        'HELD + STEADY must be exactly the manned cap');
      assert.equal(CREW.maxBuildAtCeiling.bare, MAKES.length - MANNED_MAX,
        'the published bare count is not makes − manned cap');
      // and the sentence's premise: the cap, not the points, is what bites at the ceiling
      assert.ok(MANNED_MAX < MAKES.length, 'the board would be covered — the sentence claims it never is');
    });

    test('the capacity formula Stats prints is the one crew.js computes', () => {
      assert.equal(CREW.base, CAPACITY_MAX - Math.floor(0 / CREW.levelsPerPoint) - 0 - (CAPACITY_MAX - CREW.base),
        'sanity: CREW.base is the intercept');
      assert.equal(CREW.capacityMin, CREW.base, 'capacity at level 0 with no stamps is the base');
      assert.equal(CREW.capacityMax, CREW.base + Math.floor((CREW.capacityMax - CREW.base - STAMPS_MAX) * 1)
        + STAMPS_MAX, 'the ceiling is base + level points + every stamp');
      assert.ok(STAMPS_MAX <= CREW.stampsMax, 'STAMPS_MAX is clamped to the shipped boss count');
    });

    test('every number trophies.js repeats equals its data/job.js original', async () => {
      // trophies.js deliberately does NOT import data/job.js — 41 KB of constants on a boot path a
      // student with the layer off never needs (its own §GAME_WINGS note). The price of that decision
      // is this test: the repeated numbers must be pinned to the originals from outside.
      const { trophyById } = await import('../site/data/trophies.js');
      const { FAULT_INDEX, CHAIN } = await import('../site/data/job.js');

      const cond = (id) => {
        const t = trophyById[id];
        assert.ok(t, `the ${id} trophy is missing`);
        assert.equal(typeof t.cond, 'string', `${id} has no description`);
        return t.cond;
      };

      // the Fault Index size
      const tags = FAULT_INDEX.tags ?? FAULT_INDEX.count ?? FAULT_INDEX.size;
      assert.ok(Number.isFinite(tags), 'data/job.js FAULT_INDEX exposes no tag count');
      assert.equal(trophyById['index-68'].progress({ save: { game: { tags: {} } } }).need, tags,
        'the index-68 trophy needs a different count than data/job.js FAULT_INDEX');
      assert.match(cond('index-68'), new RegExp(`\\b${tags}\\b`),
        'the index-68 description quotes a different count than its own predicate');
      assert.ok(!/sixty-eight/.test(cond('index-68')), 'the count is spelled out as a word');

      // the chain cap and the multiplier it is worth
      assert.equal(trophyById['chain-8'].progress({ save: {} }).need, CHAIN.cap,
        'the chain-8 trophy needs a different depth than data/job.js CHAIN.cap');
      assert.match(cond('chain-8'), new RegExp(`chain of ${CHAIN.cap}\\b`));
      assert.match(cond('chain-8'), new RegExp(`×${CHAIN.multCap}\\b`),
        'the chain-8 description quotes a different multiplier than data/job.js CHAIN.multCap');

      // the calibrated bar and window
      assert.match(cond('calibrated'), new RegExp(RATING.calibratedBrierMax.toFixed(2)),
        'the calibrated description quotes a different bar than RATING.calibratedBrierMax');
      assert.match(cond('calibrated'), new RegExp(`\\b${RATING.calibratedWindow}\\b`),
        'the calibrated description quotes a different window than RATING.calibratedWindow');

      // and the waypoint agrees with its own predicate AND with the shipped milestone list
      const need25 = trophyById['index-25'].progress({ save: { game: { tags: {} } } }).need;
      assert.deepEqual(FAULT_INDEX.milestones, [need25, tags],
        'the two index trophies are not data/job.js FAULT_INDEX.milestones');
      assert.match(cond('index-25'), new RegExp(`\\b${need25}\\b`),
        'the index-25 description quotes a different count than its own predicate');
      assert.ok(need25 < tags, 'the waypoint is not below the whole index');
    });

    test('the trophy descriptions interpolate rather than restate', () => {
      const src = read('site/data/trophies.js').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.match(src, /Seal all \$\{INDEX_TAGS\} entries/);
      assert.match(src, /Reach a chain of \$\{CHAIN_DEEP\} inside one job/);
      assert.match(src, /caps, at ×\$\{CHAIN_MULT_CAP\}/);
      assert.match(src, /Brier score of \$\{CALIBRATED_BRIER_MAX\.toFixed\(2\)\}/);
      assert.match(src, /over \$\{CALIBRATED_WINDOW\} informative calls/);
      assert.match(src, /Seal \$\{INDEX_PART\} entries/);
      assert.ok(!/Brier score of 0\.10/.test(src), 'the calibrated bar is hardcoded');
      assert.ok(!/chain of 8 inside/.test(src), 'the chain depth is hardcoded');
      assert.ok(!/at ×2\.6/.test(src), 'the chain multiplier is hardcoded');
    });

    test('c(p, o) is strictly proper — the claim the Settings panel makes', () => {
      // E[c] = base − k[q(1−p)² + (1−q)p²];  dE/dp = −2k(p − q);  d²E/dp² = −2k < 0
      const E = (q, p) => CREDIT.base - CREDIT.k * (q * (1 - p) ** 2 + (1 - q) * p ** 2);
      for (const q of [0.05, 0.3, 0.5, 0.7, 0.85, 0.99]) {
        const hp = 1e-5;
        const d2 = (E(q, 0.5 + hp) - 2 * E(q, 0.5) + E(q, 0.5 - hp)) / (hp * hp);
        assert.ok(Math.abs(d2 - -2 * CREDIT.k) < 1e-3, `d²E/dp² is not −${2 * CREDIT.k} at q = ${q}`);
        // and the unique maximiser is p = q
        for (const p of [q - 0.1, q + 0.1].filter((x) => x > 0 && x < 1)) {
          assert.ok(E(q, q) > E(q, p), `truthful p = q is not the maximum at q = ${q}`);
        }
      }
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   ROUND 3 — the two defects the round-3 critics found that live INSIDE this lane.

   Both are the same failure as round 2's, one level up: round 2 caught panels restating a CONSTANT
   the code owns; these are panels restating a DEFINITION and a RANK the code owns. A number that is
   re-derived on a surface is a number that can disagree with the game, and both of these did.

   1. q̂ — Settings printed "your first-try rate on that make over the trailing 10 attempts". The
      shipped statistic is the CLEAR rate over the trailing 10 SITTINGS: `call.qHatDetail` parses
      `e.attempt` and deliberately ignores it, and the module header at call.js says so in those
      words. The two readings are not close — on an ordinary history they differ by 0.5, which is
      the whole width of `w`, and they disagree about whether the call is a measurement at all.

   2. The rank — both surfaces printed `rankNameFor(rating.value)`. That is not the rank the game
      grants. The 95 call and the guard multiplier are gated on `player.rank`, and `value === 5.00`
      has two causes that are opposite claims about the student: fifty measured 50-calls, and NO
      measurement at all (which is where a student who mastered their makes lives). Re-deriving the
      name from the value printed `Called 2` at the second one.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('J7 meta · round 3: a surface prints the game’s own statistic, never its own re-derivation', () => {
  describe('1 · q̂ is the CLEAR rate over sittings — and Settings now says so', () => {
    test('source: the q̂ legend states the clear rate, and no lane file says "first-try rate"', () => {
      const p = prose(SETTINGS);
      assert.match(p, /your CLEAR rate on that make over the trailing \$\{RATING\.qHatWindow\} sittings/,
        'the q̂ legend does not state the clear rate over sittings');
      /* REPAIR (REPAIR-DECISION §S1.3 item 2, tests lane). The file list grows to `site/data/job.js`:
         the definition drift (finding 15) lived in its `qHatWindow` docblock for three rounds, and
         the meta lane has now corrected it. Both readings of the lint are asserted, because a
         `prose()` that strips block comments would not see a docblock at all — which is exactly how
         the drift survived a green suite:
           · the RAW file must not contain "first-try rate" anywhere; and
           · it must state "CLEAR rate" both raw and after `prose()` (the meta lane put the sentence
             outside the block comment for precisely this reason).

         VERIFY ROUND 3 (test-integrity). `COMPOSED-GAME.md` is IN THIS LOOP now, which is what
         §S1.3(2) asked for in the first place — "assert **no** occurrence of `first-try rate`
         anywhere in the scanned set". It used to be handled by the arm below as a DISJUNCTION
         against a note, and every string that disjunction's `else` branch demanded is permanently
         present in `notes/repair-tests.md`, so the branch was satisfied unconditionally and the
         document was free: the withdrawn sentence could be pasted back into COMPOSED-GAME.md:433
         and the whole suite stayed green (demonstrated on a copy of the tree, 2 995 tests, 0 fail).
         A pin a permanent document satisfies is not a pin.

         This does NOT stop the document keeping the withdrawn reading on the record, which G11
         requires it to do: the record at COMPOSED-GAME.md:433 and :1150 is written as "the
         first-attempt rate over the trailing 10 attempts" — the words the document actually
         published — and arm B of the G12 lint below now holds THAT phrase to a retraction at every
         site it appears. What is banned here is the four-word site phrasing, in the document and in
         the four lane files alike, so the ban is one rule over one scanned set. */
      for (const [name, src] of [['settings.js', SETTINGS], ['stats.js', STATS],
        ['trophies.js', read('site/data/trophies.js')], ['data/job.js', read('site/data/job.js')],
        ['COMPOSED-GAME.md', read('COMPOSED-GAME.md')]]) {
        assert.ok(!/first-try rate/.test(prose(src)), `${name} still prints "first-try rate" for q̂`);
        assert.ok(!/first-try rate/.test(src), `${name} still says "first-try rate" for q̂, in a comment`);
      }
      assert.match(read('site/data/job.js'), /CLEAR rate/,
        'site/data/job.js does not state the CLEAR rate — finding 15 has come back');
      assert.match(prose(read('site/data/job.js')), /CLEAR rate/,
        'the CLEAR rate sentence in site/data/job.js is only inside a block comment, which `prose()` '
        + 'strips — that is how the first-try drift survived three rounds of a green suite');
      // the window unit is a SITTING, and the sentence must not call it an attempt again
      assert.ok(!/trailing \$\{RATING\.qHatWindow\} attempts/.test(p),
        'the q̂ window is still printed in attempts rather than sittings');
    });

    /**
     * THE SPEC, STRICTLY — and a control that proves this lint can fail.
     *
     * VERIFY ROUND 3 (test-integrity, MAJOR). What stood here was a DISJUNCTION: "either the
     * document states the CLEAR rate, or `notes/repair-tests.md` records the pending correction".
     * The `else` branch demanded three strings — `Spec corrections`, the exact withdrawn sentence
     * and the exact replacement — and a repair note that quotes both sentences carries all three
     * FOR EVER. So the branch was satisfied unconditionally and the document was free: the critic
     * pasted the withdrawn sentence back into COMPOSED-GAME.md:433 on a copy of the tree and ran
     * `node --test tests/` → 2 995 tests, 0 fail. The pin had never armed, and the arm's own
     * comment ("the document still carries the first-try reading today") had gone stale when the
     * doc lane landed the fix, which is why nobody noticed.
     *
     * The disjunction is gone. The withdrawn phrasing is banned by the file loop above, which now
     * scans COMPOSED-GAME.md with the four lane files; what is left here is the POSITIVE half —
     * the corrected sentence must be present, so a silent deletion is not a way past the ban — plus
     * two negative controls that run the real predicate over a mutated copy of the real document.
     * Without the controls this arm would again prove only that a phrase is absent from a file it
     * is absent from.
     *
     * Nothing here reads a note any more. A pin whose truth condition is a string in a permanent
     * document is the defect, not a lesser form of it; the record of the correction stays in
     * `notes/repair-tests.md` as an audit trail and licenses nothing. The CLASS — a withdrawn
     * reading standing bare anywhere in the document — is covered by arm B of the G12 lint below,
     * which now carries the reading the document itself keeps on the record.
     */
    test('the SPEC: COMPOSED-GAME.md states the CLEAR rate over sittings — strictly, and the lint is shown to fail on the revert', () => {
      const spec = read('COMPOSED-GAME.md');
      /* ASCII only: the published sentence contains `q̂`, whose composition (precomposed vs
         combining U+0302) is not this lint's business and would silently unarm it again. */
      const CORRECTED = '= your **CLEAR rate on that make over the trailing 10 sittings**';
      const REVERTED = '= your first-try rate on that make over the trailing 10 attempts';

      /** the predicate, as one function, so the controls below exercise the shipped thing */
      const faults = (doc) => {
        const bad = [];
        if (/first-try rate/.test(doc)) bad.push('the withdrawn "first-try rate" phrasing is back');
        if (!doc.includes(CORRECTED)) bad.push('the corrected q̂ sentence is absent');
        return bad;
      };

      assert.deepEqual(faults(spec), [],
        'COMPOSED-GAME.md no longer states q̂ as the CLEAR rate on that make over the trailing 10 '
        + 'sittings. `call.qHatDetail` parses `e.attempt` and deliberately ignores it; the two '
        + 'readings differ by ~0.5 on an ordinary history, which is the whole width of `w`.');
      const at = spec.split('\n').findIndex((l) => l.includes(CORRECTED));
      assert.ok(spec.split('\n')[at].includes('anti-farming weight'),
        `the CLEAR-rate sentence has moved off the anti-farming-weight paragraph (line ${at + 1}) — `
        + 'the controls below splice into that line, so they would stop testing the published claim');

      /* CONTROL 1 — the exact revert the critic performed, on the document's own line. */
      assert.deepEqual(faults(spec.replace(CORRECTED, REVERTED)),
        ['the withdrawn "first-try rate" phrasing is back', 'the corrected q̂ sentence is absent'],
        'the revert that kept a 2 995-test suite green is still not flagged by this lint');
      /* CONTROL 2 — the quiet way out: drop the claim without re-asserting the withdrawn one. */
      assert.deepEqual(faults(spec.replace(CORRECTED, '= your rate on that make')),
        ['the corrected q̂ sentence is absent'],
        'deleting the corrected sentence passes this lint — the ban on the old phrasing is then the '
        + 'only rule, and "say nothing" satisfies it');

      /* THE CLASS, not just the site. The ban above is on four words; the positive pin above is on
         one sentence. Between them a THIRD site could still define q̂ the withdrawn way in other
         words ("the first-attempt rate on that make over the trailing 10 attempts") while :433
         stays correct. So every q̂ DEFINITION in the document — every occurrence of the phrase
         family "rate on that make over the trailing …" — has to be the shipped reading.

         This is deliberately not an entry on arm B's WITHDRAWN list below. Arm B requires a
         withdrawn phrase to be PRESENT and retracted within reading distance, and the document's
         two records of this withdrawal (COMPOSED-GAME.md:433's parenthetical "It was published as
         the first-attempt rate over the trailing 10 attempts, which is a different event" and
         G-section bullet at :1150) are genuine retractions written in words `RETRACTS` does not
         carry. Adding them would mean widening the retraction vocabulary of a lint whose whole
         value is that it is narrow. The rule below needs no vocabulary at all. */
      /* …with the document's own carve-out, the one arm B uses: a line whose SUBJECT is an old
         claim — G11's "Withdrawn at round 4" list, or a G12 changelog entry that opens by quoting
         what it is about — may hold the withdrawn wording verbatim. The four-word site phrasing is
         banned there too, by the file loop above; this rule is about the DEFINITION being asserted. */
      const lines = spec.split('\n');
      const wFrom = lines.findIndex((l) => l.startsWith('**Withdrawn at round 4'));
      const wTo = lines.findIndex((l, i) => i > wFrom && l.startsWith('## G12'));
      const quotesByDesign = (line, i) => (wFrom >= 0 && wTo > wFrom && i > wFrom && i < wTo)
        || /^\d+\. \*\*Claimed/.test(line);
      const defs = lines.flatMap((line, i) => (quotesByDesign(line, i) ? []
        : [...line.matchAll(/(\S+) rate on that make over the trailing (\d+) (\w+)/g)]))
        .map((m) => ({ whole: m[0], reading: m[1].replace(/[*_`]/g, ''), n: m[2], unit: m[3] }));
      assert.ok(defs.length >= 1,
        'COMPOSED-GAME.md no longer defines q̂ as a rate on that make over a trailing window — the '
        + 'phrase family this rule scans has been renamed and the rule is now scanning nothing');
      for (const d of defs) {
        assert.equal(`${d.reading} ${d.n} ${d.unit}`, 'CLEAR 10 sittings',
          `COMPOSED-GAME.md defines q̂ as "${d.whole}". The shipped statistic is the CLEAR rate over `
          + 'the trailing 10 SITTINGS: `call.qHatDetail` parses `e.attempt` and deliberately ignores '
          + 'it, so any other reading makes one button forecast an event `econ.settle` never prices');
      }
    });

    test('arithmetic: the two readings really disagree, so the corrected sentence is load-bearing', async () => {
      const { qHatDetail, weightFor } = await import('../site/js/job/call.js');
      // Ten sittings on one make, ALL cleared; five of them on attempt 3 with hints — an ordinary
      // history for material a student is still fumbling.
      const hist = Array.from({ length: 10 }, (_, i) => (
        { at: 1000 + i, ok: true, attempt: i % 2 === 0 ? 1 : 3, hints: i % 2 === 0 ? 0 : 2 }));
      const save = { cards: { c1: { history: hist } } };
      const cards = { c1: { id: 'c1', skills: ['M1-EXP'] } };

      const d = qHatDetail(save, 'M1-EXP', { cards });
      assert.equal(d.of, RATING.qHatWindow, 'the window is the trailing ten SITTINGS');
      assert.equal(d.qHat, 1, 'the shipped q̂ is the clear rate: ten clears is 1.0');
      assert.equal(d.w, 0, 'and a clear rate of 1.0 weighs nothing');
      assert.equal(d.informative, false, 'so the call is not a measurement');

      const firstTry = hist.filter((h) => h.ok && h.attempt === 1).length / hist.length;
      assert.equal(firstTry, 0.5, 'the discarded reading would call the same history 0.5');
      assert.equal(weightFor(firstTry), RATING.weightK / 4, 'which is the MAXIMUM weight');
      assert.ok(weightFor(firstTry) >= RATING.informativeMin,
        'the two readings disagree about whether this call is a measurement at all');
      assert.equal(Math.abs(d.qHat - firstTry), 0.5, 'the gap is half the range of q̂');
    });
  });

  describe('2 · the rank a surface prints is the rank the game grants', () => {
    test('source: both panels read player.rank through ratingDetail and print rankOf().name', () => {
      assert.match(prose(STATS), /ratingDetail\(player\.rating\?\.calls \?\? \[\], RATING\.N, \{ rank: player\.rank \}\)/,
        'the Stats ledger does not pass the held rank to ratingDetail');
      assert.match(prose(STATS), /rankOf\(rating\.rank\)\.name/, 'the Stats ledger does not print the held rank');
      assert.match(prose(SETTINGS), /ratingDetail\(s\.player\?\.rating\?\.calls \?\? \[\], RATING\.N, \{ rank: s\.player\?\.rank \}\)/,
        'the Settings rating panel does not pass the held rank to ratingDetail');
      assert.match(prose(SETTINGS), /rankOf\(live\.rank\)\.name/, 'the Settings rating panel does not print the held rank');
      // and neither may go back to deriving a rank name from the live rating VALUE
      assert.ok(!/rankNameFor\((?:live|rating)\.value\)/.test(prose(STATS) + prose(SETTINGS)),
        'a panel is still deriving the rank name from the rating value');
    });

    test('behaviour: a mastered student keeps Called 5, and measured cowardice still falls to Called 2', async () => {
      const { callEntry, windowPush, ratingDetail, rankNameFor, rankOf, RANKS } = await import('../site/js/job/call.js');
      const build = (qHat, call) => {
        let calls = [];
        for (let i = 0; i < RATING.N; i++) {
          calls = windowPush(calls, callEntry({ call, ok: true, qHat, skill: 'M1-EXP', at: 1000 + i }), { N: RATING.N });
        }
        return calls;
      };

      /* (a) THE DEFECT. Fifty perfect calls on material the student has MASTERED: q̂ = 1 → w = 0 →
             not one of the fifty slots is a measurement. */
      const mastered = build(1.0, 95);
      const plain = ratingDetail(mastered, RATING.N);
      assert.equal(plain.n, 0, 'a mastered window holds no informative call');
      assert.equal(plain.measured, false, 'and therefore measures nothing');
      assert.equal(plain.value.toFixed(2), RATING.base.toFixed(2), 'so the rating reads exactly 5.00');
      assert.equal(rankNameFor(plain.value), 'Called 2', 'the OLD surface form prints Called 2 at them');

      const held = ratingDetail(mastered, RATING.N, { rank: 5 });
      assert.equal(held.held, true, 'the hold must fire on an unmeasured window');
      assert.equal(rankOf(held.rank).name, 'Called 5', 'the NEW surface form keeps the rank they hold');
      assert.equal(held.value.toFixed(2), plain.value.toFixed(2),
        'the rating VALUE still deflates to 5.00 — G2 wants that; only the RANK is held');

      // the demotion has teeth: it is the 95 call and the guard multiplier, not a label
      assert.ok(RANKS[4].calls.includes(95) && !RANKS[1].calls.includes(95),
        'Called 5 holds the 95 call and Called 2 does not');
      assert.ok(RANKS[4].guardMult > RANKS[1].guardMult, 'and a better guard multiplier');

      /* (b) THE CONTROL — the hold is a FLOOR on the rank, and a floor is transparent until it
             binds (S3; `designs/REPAIR-DECISION.md` §S3.1). Fifty 50-calls at q̂ = 0.5 weigh 1.00
             each and score credit 0 either way: the SAME rating value of 5.00, but every slot is a
             real measurement. From any rank cowardice can honestly have banked the floor does not
             bind, so Called 2 is what prints — `held` is not "measured === false" wearing a hat. */
      const coward = build(0.5, 50);
      for (const floor of [null, 1, 2]) {
        const measured = ratingDetail(coward, RATING.N, { rank: floor });
        assert.equal(measured.n, RATING.N, 'fifty 50-calls at q̂ = 0.5 are all measurements');
        assert.equal(measured.measured, true);
        assert.equal(measured.value.toFixed(2), RATING.base.toFixed(2), 'and score exactly 5.00 as well');
        assert.equal(measured.held, false, `a NON-BINDING floor (${floor}) holds nothing`);
        assert.equal(rankOf(measured.rank).name, 'Called 2',
          `measured cowardice at floor ${floor} must still be printed as Called 2`);
      }

      /* (c) AND THE PUBLISHED COST OF THE RATCHET (S3.6, G2 "Rank"). A student who DID reach
             Called 5 keeps it while they are being badly calibrated, because rank gates the 95 rung
             and the guard multiplier — loot — and this layer never removes a tool you own. The
             RATING is the number that tells the truth about it, and it reads exactly 5.00. */
      const heldCoward = ratingDetail(coward, RATING.N, { rank: 5 });
      assert.equal(rankOf(heldCoward.rank).name, 'Called 5', 'the rank a student earned is a floor under a measured window too');
      assert.equal(heldCoward.held, true, 'and `held` says the floor is what carried it');
      assert.equal(heldCoward.value.toFixed(2), RATING.base.toFixed(2), 'while the rating still deflates to 5.00');
      assert.equal(heldCoward.measured, true, 'a measured window stays measured — the floor moves the RANK only');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   ROUND 3 REPAIR — the meta lane's four surfaces, tested through the CODE THE PANEL RUNS.

   Everything above this line is a regex over source text. That technique caught a real class of
   defect in round 2 (a panel restating a constant), and round 3 proved it blind to the class one
   level up: a panel can INTERPOLATE every constant correctly and still publish a law the code does
   not run. Two of the three blockers in this lane were exactly that, and both had a green test
   sitting beside them:

     · `tests/job-guard.test.mjs:442` — "THE PUBLISHED FORMULA IS THE RUNNING ONE: X_HAT_FORMULA,
       implemented literally, IS xHatFrom" — asserts the exported STRING against `xHatFrom` and
       never looks at the surface that publishes it. The surface published a two-term law the code
       stopped running when the ballast landed, and this test stayed green through all of it.
     · `tests/job-guard.test.mjs:1270` — "PRESS_PANEL_COPY names each vector for its own side" —
       same shape: the paragraph was correct in `guard.js` and unused, while the panel printed the
       GUARD's own mixing to the student as "the unexploitable" press.

   So these tests IMPORT AND EXECUTE the functions `settings.js` renders from (`xHatLines`,
   `rankBandCells`, `stakeBandLine`) and the predicate `data/trophies.js` ships (`calibrated`), and
   each one carries its own NEGATIVE CONTROL: the rule the surface used before, implemented here,
   asserted to FAIL the property. A test whose negative control passes is not policing anything.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('J7 meta · round 3 repair: the rendered law is the running law', () => {
  describe('4 · x̂ — the panel renders guard.js X_HAT_FORMULA, ballast and all', () => {
    test('the four rendered lines ARE the export, with `cap` resolved and nothing else changed', async () => {
      const { xHatLines } = await import('../site/js/screens/settings.js');
      const { X_HAT_FORMULA } = await import('../site/js/job/guard.js');
      const { GUARD } = await import('../site/data/job.js');
      const lines = xHatLines();
      const resolve = (s) => s.replace(/`/g, '').replace(/\bcap\b/g, String(GUARD.jobWeightCap));

      assert.equal(lines.law, resolve(X_HAT_FORMULA.law), 'the law is not guard.js’s law');
      assert.equal(lines.omega, resolve(X_HAT_FORMULA.omega),
        'the panel’s interpolated ω has drifted from X_HAT_FORMULA.omega');
      assert.equal(lines.ballast, resolve(X_HAT_FORMULA.ballast));
      assert.equal(lines.bound, resolve(X_HAT_FORMULA.bound));
      // the term the panel used to omit, in BOTH places it appears
      assert.match(lines.law, /β\/n/, 'the numerator has no ballast term');
      assert.match(lines.law, /\+ β\)/, 'the denominator has no ballast term');
      // and nothing student-facing carries markdown or an unresolved symbol
      for (const [k, v] of Object.entries(lines)) {
        assert.ok(!v.includes('`'), `${k} still carries a markdown backtick`);
        assert.ok(!/\bcap\b/.test(v), `${k} prints the word "cap" instead of ${GUARD.jobWeightCap}`);
      }
    });

    test('the rendered law, implemented literally, reproduces xHatFrom on the windows that used to be wrong', async () => {
      const { xHatLines } = await import('../site/js/screens/settings.js');
      const { xHatFrom, WING_IDS } = await import('../site/js/job/guard.js');
      const sum = (a) => a.reduce((t, x) => t + x, 0);

      /* THE PANEL'S OWN STRINGS ARE THE SPEC HERE. The cap, and whether there is a ballast term at
         all, are READ OUT of the rendered lines rather than off `GUARD` — otherwise this test
         implements the right law no matter what the panel prints, which is precisely how the
         guard lane's own "THE PUBLISHED FORMULA IS THE RUNNING ONE" stayed green while the surface
         published a law the code had not run for a round. */
      const lines = xHatLines();
      const capFromOmega = Number(/min\(postedⱼ,\s*([\d.]+)\s*·/.exec(lines.omega)?.[1]);
      assert.ok(Number.isFinite(capFromOmega) && capFromOmega > 0,
        `the rendered ω line names no cap: ${lines.omega}`);
      const ballastDivisor = Number(/β = max\(0,\s*max\(ω\)\/([\d.]+)\s*−\s*Σω\)/.exec(lines.ballast)?.[1]);
      const printsBallast = /β\/n/.test(lines.law) && /\+ β\)/.test(lines.law) && Number.isFinite(ballastDivisor);

      /** The law the panel prints, implemented literally from the lines it prints. */
      const rendered = (jobs) => {
        const total = sum(jobs.map((j) => j.posted));
        const w = jobs.map((j) => Math.min(j.posted, capFromOmega * total));
        const beta = printsBallast ? Math.max(0, Math.max(...w) / ballastDivisor - sum(w)) : 0;
        const denom = sum(w) + beta;
        return WING_IDS.map((wing) => (sum(jobs.map((j, i) => {
          const t = sum(WING_IDS.map((k) => j.press[k] ?? 0));
          return w[i] * (t > 0 ? (j.press[wing] ?? 0) / t : 0);
        })) + beta / WING_IDS.length) / denom);
      };
      const cap = capFromOmega;
      /** THE NEGATIVE CONTROL: the two-term law the panel printed before this repair. */
      const oldTwoTerm = (jobs) => {
        const total = sum(jobs.map((j) => j.posted));
        const w = jobs.map((j) => Math.min(j.posted, cap * total));
        const denom = sum(w);
        return WING_IDS.map((wing) => sum(jobs.map((j, i) => {
          const t = sum(WING_IDS.map((k) => j.press[k] ?? 0));
          return w[i] * (t > 0 ? (j.press[wing] ?? 0) / t : 0);
        })) / denom);
      };

      const WINDOWS = {
        'one job': [{ press: { RECALL: 3 }, posted: 200 }],
        'two honest jobs': [{ press: { RECALL: 1, FIGURES: 1, WORDS: 1 }, posted: 200 },
          { press: { RECALL: 1, FIGURES: 1, WORDS: 1 }, posted: 200 }],
        'one decoy + one real': [{ press: { RECALL: 3 }, posted: 200 }, { press: { FIGURES: 3 }, posted: 200 }],
        '3 RUN + 1 VAULT': [{ press: { RECALL: 3 }, posted: 120 }, { press: { RECALL: 3 }, posted: 120 },
          { press: { RECALL: 3 }, posted: 120 }, { press: { FIGURES: 3 }, posted: 620 }],
        'a full 10-job window': Array.from({ length: 10 }, () => (
          { press: { RECALL: 1, FIGURES: 1, WORDS: 1 }, posted: 300 })),
      };

      let windowsTheOldLawGotWrong = 0;
      for (const [name, jobs] of Object.entries(WINDOWS)) {
        const code = xHatFrom({ game: { heat: { window: jobs } } }).values;
        const mine = rendered(jobs);
        for (let i = 0; i < code.length; i++) {
          assert.ok(Math.abs(code[i] - mine[i]) < 1e-9,
            `the RENDERED law disagrees with xHatFrom on "${name}", wing ${WING_IDS[i]}: `
            + `${code[i]} vs ${mine[i]}`);
        }
        const old = oldTwoTerm(jobs);
        if (Math.max(...code.map((v, i) => Math.abs(v - old[i]))) > 1e-9) windowsTheOldLawGotWrong++;
      }
      // the control: the law this repair deleted really is wrong, on four of the five windows above,
      // so the assertion loop is discriminating rather than vacuous
      assert.equal(windowsTheOldLawGotWrong, 4,
        'the two-term law must be wrong on every window a new student has, and right on the broad one');
    });

    test('source: guardCard renders the lines and the two-term string is gone', () => {
      const p = prose(SETTINGS);
      assert.match(p, /const xh = xHatLines\(\)/, 'guardCard does not build the rendered lines');
      assert.match(p, /\[xh\.law, xh\.omega, xh\.ballast, xh\.bound\]/, 'not all four lines are printed');
      assert.ok(!/x̂ᵢ = Σⱼ\(ωⱼ · shareᵢⱼ\) \/ Σⱼ ωⱼ/.test(p),
        'the two-term x̂ law is still in the panel');
      assert.ok(/β/.test(p), 'the panel never mentions the ballast');
    });
  });

  describe('5 · the press paragraph is the guard module’s, not the panel’s', () => {
    test('source: the panel prints PRESS_PANEL_COPY and none of the three withdrawn claims', () => {
      const p = prose(SETTINGS);
      assert.match(p, /PRESS_PANEL_COPY\.map\(line => hint\(line\)\)/,
        'the panel does not render guard.js PRESS_PANEL_COPY');
      assert.ok(!/in proportion to (their|the) study value/.test(p),
        'the panel still tells the student to press in proportion to study value — that is the RECIPROCAL of the maximin');
      assert.ok(!/fixed point, not a slogan/.test(p),
        'the panel still calls a Nash statement about a game this layer does not implement a fixed point');
      assert.ok(!/1 − k\/vᵢ/.test(p),
        'the GUARD’s own mixing is hand-typed into the panel again');
    });

    test('the claims that paragraph makes are true of the shipped pressAdvice', async () => {
      const { pressAdvice, PRESS_PANEL_COPY, PRESS_FORMULA, GUARD_MIX_FORMULA, MAXIMIN_FORMULA } =
        await import('../site/js/job/guard.js');
      const wings = ['RECALL', 'FIGURES', 'WORDS'];
      const v = { RECALL: 30, FIGURES: 20, WORDS: 10 };
      const a = pressAdvice({ wings, y: [0.4, 0.35, 0.25], eps: 0.15 }, v);
      // sentence 2 — what the BOARD pre-presses, positive on every wing
      assert.ok(PRESS_PANEL_COPY[1].includes(PRESS_FORMULA));
      assert.deepEqual(a.tokens, { RECALL: 1, FIGURES: 1, WORDS: 1 },
        'the pre-press spends on all three wings');
      // sentence 3 — `y` is the HOUSE's, and it puts nothing on the third wing
      assert.ok(PRESS_PANEL_COPY[2].includes(GUARD_MIX_FORMULA));
      assert.ok(a.guardMix[2] < 1e-9, 'y puts 0 of 3 on the lowest-value wing while the board puts 1');
      // sentence 4 — the maximin is the RECIPROCAL ordering, which is the sentence that was reversed
      assert.ok(PRESS_PANEL_COPY[3].includes(MAXIMIN_FORMULA));
      assert.ok(a.maximin[1] > a.maximin[0] + 1e-9,
        'the maximin must put MORE weight on the lower-value wing — the deleted sentence said the opposite');
    });

    test('the same-wing run rule is printed with the exception that really overrides it', async () => {
      const { blockedWing, heldWing, guardDist } = await import('../site/js/job/guard.js');
      const { GUARD } = await import('../site/data/job.js');
      const worked = (wing) => ({ guard: wing, targets: [{ ok: true }], posted: 100, bagged: 50 });
      const abandoned = (wing) => ({ guard: wing, targets: [], posted: 100 });
      const runs = Array.from({ length: GUARD.sameWingMaxRuns }, () => worked('RECALL'));

      // the rule, as printed
      assert.equal(blockedWing({ game: { log: runs } }), 'RECALL', 'Mercy does not block the fourth run');
      assert.equal(guardDist({ game: { log: runs } }, { eps: 0.2 }).byWing.RECALL, 0);
      // and the exception, measured: one walked-out board and the blocked wing is drawn with p = 1.
      // `blockedWing` still names it — an abandoned board is not a job it took — so the override is
      // inside `guardDist`, which is exactly why the printed sentence cannot be read off Mercy alone.
      const withQuit = { game: { log: [...runs, abandoned('RECALL')] } };
      assert.equal(heldWing(withQuit), 'RECALL', 'the abandoned board’s guard is not still standing');
      assert.equal(blockedWing(withQuit), 'RECALL', 'Mercy still names the wing it would block');
      const d = guardDist(withQuit, { eps: 0.2 });
      assert.equal(d.blocked, null, 'the held wing overrides Mercy — that is the exception');
      assert.equal(d.byWing.RECALL, 1,
        'so the same wing CAN be drawn a fourth time running, and the panel must say so');
      /* STRENGTHENED at integration (notes/repair-guard.md R16 landed). This used to grep
         `settings.js` for one phrase the panel typed itself — which passed while the legend stated
         the bound with only ONE of its two exceptions, the defect F60 is about. The panel now
         renders `guard.js CAP_PANEL_COPY`, so the pin is: the panel AUTHORS no legend, and the
         module's own legend names BOTH exceptions. `tests/job-guard.test.mjs` §6b asserts every
         clause of `CAP_PANEL_COPY` against `guardDist` in all three regimes, so this arm cannot
         drift from the measurement the way a screen literal could. */
      const { CAP_PANEL_COPY } = await import('../site/js/job/guard.js');
      const p = prose(SETTINGS);
      assert.match(p, /CAP_PANEL_COPY\[0\]/, 'the cap legend is not rendered from guard.js CAP_PANEL_COPY');
      assert.match(p, /CAP_PANEL_COPY\[1\]/, 'the Mercy legend is not rendered from guard.js CAP_PANEL_COPY');
      assert.match(p, /CAP_PANEL_COPY\[2\]/, 'the walked-board exception is not rendered from guard.js CAP_PANEL_COPY');
      assert.ok(!/still standing when you come back, whatever it has drawn lately/.test(p),
        'the panel is hand-typing the cap legend again instead of rendering the module\'s');
      const legend = CAP_PANEL_COPY.join(' ');
      assert.match(legend, /keeps its guard standing/, 'the legend drops the walked-board exception');
      assert.match(legend, /two wings on it/, 'the legend drops the two-wing exception — the one this test just measured');
      assert.match(legend, new RegExp(`${GUARD.sameWingMaxRuns} jobs running`), 'the legend drops the run rule itself');
    });
  });

  describe('6 · the printed rank bands are a partition of the rating range', () => {
    test('every reachable rating lands in exactly one printed band, and it is rankFor’s', async () => {
      const { rankBandCells } = await import('../site/js/screens/settings.js');
      const { rankFor, rankOf } = await import('../site/js/job/call.js');
      const { RANKS, RANK_THRESHOLDS, RATING } = await import('../site/data/job.js');
      const cells = rankBandCells();
      assert.equal(cells.length, RANKS.length);
      // the cells are contiguous, come off RANK_THRESHOLDS, and cover [0, 10] with no gap
      assert.deepEqual(cells.map((c) => c.from), [...RANK_THRESHOLDS]);
      cells.forEach((c, i) => {
        if (i) assert.equal(c.from, cells[i - 1].to, `a gap between band ${i} and band ${i + 1}`);
      });
      assert.equal(cells[0].from, RATING.min);
      assert.equal(cells.at(-1).to, RATING.max);

      const holds = (c, r) => r >= c.from - 1e-9 && (c === cells.at(-1) ? r <= c.to + 1e-9 : r < c.to - 1e-9);
      const THE_FOUR_HOLES = [4.95, 6.45, 7.65, 8.85];
      for (let r = 0; r <= RATING.max + 1e-9; r = +(r + 0.01).toFixed(2)) {
        const inBands = cells.filter((c) => holds(c, r));
        assert.equal(inBands.length, 1, `rating ${r.toFixed(2)} is in ${inBands.length} printed bands`);
        assert.equal(inBands[0].name, rankOf(rankFor(r)).name,
          `rating ${r.toFixed(2)} prints the band of a different rank than rankFor awards`);
      }
      for (const r of [...THE_FOUR_HOLES, 6.49, 0, 10]) {
        const cell = cells.find((c) => c.name === rankOf(rankFor(r)).name);
        assert.ok(holds(cell, r), `${r} sits outside the printed band of its own rank (${cell.range})`);
      }

      /* THE NEGATIVE CONTROL. The rendering this repair replaced — `min`–`bandTop` — fails the same
         property, on exactly the four ratings above, because bandTop is a display rounding 0.1
         below the next threshold. If this ever stops failing, bandTop has been repaired at source
         and the function above may go back to reading it. */
      const oldCells = RANKS.map((r, i) => ({
        name: r.name, from: r.min, to: r.bandTop, last: i === RANKS.length - 1,
      }));
      const oldHolds = (c, r) => r >= c.from - 1e-9 && (c.last ? true : r <= c.to + 1e-9);
      const orphans = THE_FOUR_HOLES.filter((r) => !oldCells.some((c) => oldHolds(c, r)));
      assert.deepEqual(orphans, THE_FOUR_HOLES,
        'the bandTop rendering no longer leaves these four ratings in no band — re-derive this test');
    });

    test('source: the panel prints rankBandCells() and never bandTop again', () => {
      const p = prose(SETTINGS);
      assert.match(p, /rankBandCells\(\)\.flatMap/, 'the rating panel does not print the partition');
      assert.ok(!/bandTop/.test(p), 'the panel is printing a display rounding as a band edge again');
    });
  });

  describe('7 · the stake band is DERIVED in Settings, with its substitution', () => {
    test('the printed band and peak are econ.js’s own, to the digit', async () => {
      const { stakeBandLine } = await import('../site/js/screens/settings.js');
      const { stakeBand, stakePeak, wTimesEc } = await import('../site/js/job/econ.js');
      const { RATING, CREDIT } = await import('../site/data/job.js');
      const line = stakeBandLine();
      const [lo, hi] = stakeBand();
      const peak = stakePeak();
      assert.equal(line.lo, lo, 'the printed low edge is not econ.stakeBand()');
      assert.equal(line.hi, hi, 'the printed high edge is not econ.stakeBand()');
      assert.equal(line.peak.qHat, peak.qHat);
      assert.equal(line.peak.value, peak.value);
      assert.equal(line.band, `q̂ ${lo.toFixed(3)} to ${hi.toFixed(3)}`);

      // the substitution G3.1 says is printed: u = q̂(1 − q̂), w·E[c] = 40u − 160u², peak at u = 0.125
      assert.match(line.derivation, /^u = q̂\(1 − q̂\)/);
      assert.ok(line.derivation.includes(`${RATING.weightK * CREDIT.base}u − ${RATING.weightK * CREDIT.k}u²`),
        `the derivation must interpolate weightK·base and weightK·k, not literals: ${line.derivation}`);
      assert.match(line.derivation, /peak at u = 0\.125/);

      // and the band really is the ≥ 80 % region of the function named — measured, not asserted
      for (const q of [lo + 1e-6, 0.8, peak.qHat, 0.9, hi - 1e-6]) {
        assert.ok(wTimesEc(q) >= 0.8 * peak.value - 1e-9, `q̂ ${q} is printed inside the band but is not`);
      }
      for (const q of [lo - 1e-3, hi + 1e-3, 0.5, 0.99]) {
        assert.ok(wTimesEc(q) < 0.8 * peak.value, `q̂ ${q} is printed outside the band but is not`);
      }
    });

    test('source: Settings imports the two functions and no longer types the band as a literal', () => {
      const p = prose(SETTINGS);
      assert.match(SETTINGS, /stakeBand, stakePeak \} from '\.\.\/job\/econ\.js'/,
        'Settings does not import the band it publishes');
      assert.match(p, /stakeBandLine\(\)/, 'the rating panel does not call the derived line');
      assert.ok(!/q̂ ≈ 0\.76 to 0\.93/.test(p), 'the stake band is hardcoded prose again');
      assert.ok(!/band q̂ ≈/.test(p), 'the stake band is still approximated by hand');
    });
  });

  describe('8 · `calibrated` and the reliability panel compute the SAME window', () => {
    /* Both surfaces publish "the last 20 INFORMATIVE calls" and they disagreed. The window holds
       the last 50 CALLS — a non-informative one takes its slot as `{p: null, w: 0}` since the
       round-2 fix — so `slice(-20)` BEFORE the filter asks for the last twenty SLOTS to be
       informative, which is a different and far harder claim. `screens/stats.js reliabilityBlock`
       filters first; `data/trophies.js rollingBrier` sliced first. */
    const realWindow = async (qHatInformative, okPattern) => {
      const { callEntry, windowPush } = await import('../site/js/job/call.js');
      let calls = [];
      for (let i = 0; i < RATING.N; i++) {
        calls = windowPush(calls, i % 2 === 0
          ? callEntry({ call: 85, ok: okPattern(i), qHat: qHatInformative, skill: 'FAC2', at: 1000 + i })
          : callEntry({ call: 95, ok: true, qHat: 1.0, skill: 'VOC', at: 1000 + i }), { N: RATING.N });
      }
      return calls;
    };
    /** exactly what `screens/stats.js reliabilityBlock` does: filter, THEN take the last 20. */
    const panelBrier = (calls) => {
      const win = calls.filter((c) => c && Number.isFinite(c.p)).slice(-RATING.calibratedWindow);
      if (win.length < RATING.calibratedWindow) return null;
      return win.reduce((t, c) => t + (c.p - (c.ok ? 1 : 0)) ** 2, 0) / win.length;
    };
    /** THE NEGATIVE CONTROL: the rule `rollingBrier` used before this repair. */
    const oldRule = (calls) => {
      const win = calls.slice(-RATING.calibratedWindow).filter((c) => c && Number.isFinite(c.p));
      if (win.length < RATING.calibratedWindow) return null;
      return win.reduce((t, c) => t + (c.p - (c.ok ? 1 : 0)) ** 2, 0) / win.length;
    };

    test('a real 50-slot window with blanks in it earns the trophy the panel says it has earned', async () => {
      const { trophyById } = await import('../site/data/trophies.js');
      const calls = await realWindow(0.85, () => true);   // calibrated 85-calls that all clear
      assert.equal(calls.length, RATING.N, 'the window is fifty SLOTS');
      assert.equal(calls.filter((c) => Number.isFinite(c.p)).length, RATING.N / 2,
        'half of them are blanks — which is what a window looks like once makes are mastered');

      const brier = panelBrier(calls);
      assert.ok(brier != null && brier <= RATING.calibratedBrierMax,
        `the panel prints ${brier} and calls it at or under ${RATING.calibratedBrierMax}`);
      assert.equal(trophyById.calibrated.test({ save: { player: { rating: { calls } } } }), true,
        'Stats prints a passing Brier while the trophy that publishes the same number stays unearned');

      // the control: the pre-repair rule cannot score this window at all
      assert.equal(oldRule(calls), null,
        'the slice-then-filter rule now scores a half-blank window — this test would no longer fail against it');
    });

    test('and it is not a free pass: the same window shape misses the bar when the calls are bad', async () => {
      const { trophyById } = await import('../site/data/trophies.js');
      const calls = await realWindow(0.85, (i) => i % 4 === 0);   // 85-calls that clear half the time
      const brier = panelBrier(calls);
      assert.ok(brier > RATING.calibratedBrierMax, `a mis-calibrated window must print above the bar, got ${brier}`);
      assert.equal(trophyById.calibrated.test({ save: { player: { rating: { calls } } } }), false,
        'the trophy fired on a window the panel scores above the bar');
    });

    test('and fewer than 20 informative calls is still not a window', async () => {
      const { trophyById } = await import('../site/data/trophies.js');
      const { callEntry, windowPush } = await import('../site/js/job/call.js');
      let calls = [];
      for (let i = 0; i < RATING.N; i++) {
        calls = windowPush(calls, i < 19
          ? callEntry({ call: 85, ok: true, qHat: 0.85, skill: 'FAC2', at: 2000 + i })
          : callEntry({ call: 95, ok: true, qHat: 1.0, skill: 'VOC', at: 2000 + i }), { N: RATING.N });
      }
      assert.equal(calls.filter((c) => Number.isFinite(c.p)).length, 19);
      assert.equal(trophyById.calibrated.test({ save: { player: { rating: { calls } } } }), false,
        'nineteen informative calls is not a window, blanks or no blanks');
    });

    test('source: the filter runs BEFORE the slice, and the stale docblock is gone', () => {
      const src = read('site/data/trophies.js');
      assert.match(src, /const informative = calls\.filter\(/, 'rollingBrier does not filter first');
      assert.match(src, /const win = informative\.slice\(-size\)/, 'rollingBrier does not slice the informative calls');
      assert.ok(!/calls\.slice\(-size\)\.filter\(/.test(src), 'the slice-then-filter rule is back');
      assert.ok(!/windowPush` drops the rest/.test(src),
        'the docblock still says windowPush drops non-informative calls — it writes them as blank slots');
      assert.match(src, /blank slot/, 'the docblock must say what the window actually holds');
    });
  });

  describe('9 · the ratchet’s audit line (G9 #4) is on both audit surfaces and nowhere else', () => {
    test('source: Settings and Stats print player.records.bestRating beside the rank', () => {
      assert.match(prose(SETTINGS), /best rating \$\{f2\(bestRating\)\}/,
        'the Settings rating panel does not print the rating that earned the rank');
      assert.match(prose(SETTINGS), /s\.player\?\.records\?\.bestRating/);
      assert.match(prose(STATS), /best rating \$\{n2\(bestRating\)\}/,
        'the Stats ledger does not print the rating that earned the rank');
      assert.match(prose(STATS), /const bestRating = rec\.bestRating/);
    });

    /* ============================================================================================
       ROUND-3 VERIFY 1 — WHY THE TEST BELOW IS PLAYED AND NOT GREPPED.
       What stood here was `assert.match(src, /Number\.isFinite\(bestRating\) \?/)` over the
       printer's SOURCE TEXT, under the name "neither surface invents a number while the save has
       none". It could not fail, and what it pinned was false: S3.1(c) declared
       `player.records.bestRating` with a default of 0 in BOTH copies of the schema
       (`data/job.js` SAVE_DEFAULTS, `store.js freshPlayer`) and made `normalizePlayer`'s coercion
       unconditional, so `Number.isFinite(bestRating)` is TRUE on every fresh save and every
       migrated one. Every student read `5.00 · Called 2 · best rating 0.00 · 0 of 50 informative
       calls` — the invented number, beside the rank that number exists to audit (G9 #4's one
       printed exception to "recomputable from the save").
       The two arms below RUN THE SHIPPED LINE-BUILDERS. A guard that does not hold cannot survive
       them, and neither can a schema default that pretends to be a reading.
       ============================================================================================ */
    test('a save that has never recorded a high-water prints no audit number at all', async () => {
      const { fresh, migrate, SAVE_VERSION } = await import('../site/js/store.js');
      const { ratingAuditLine } = await import('../site/js/screens/settings.js');
      const { ledgerRatingLine } = await import('../site/js/screens/stats.js');
      const NOW = Date.UTC(2026, 8, 22);

      for (const [what, save] of [['a fresh save', fresh(NOW)], ['a migrated save', migrate({ v: SAVE_VERSION }, NOW)]]) {
        const best = save.player.records.bestRating;
        assert.equal(Number.isFinite(best), true,
          `${what}: the field is declared, so Number.isFinite alone can never mean "no record"`);
        for (const [where, line] of [['Settings', ratingAuditLine(save)], ['Stats', ledgerRatingLine(save)]]) {
          assert.ok(!/best rating/.test(line),
            `${where} on ${what} invents the ratchet's audit record: "${line}"`);
          assert.ok(!/0\.00/.test(line), `${where} on ${what} prints a 0.00 nobody earned: "${line}"`);
          assert.match(line, /^5\.00 /, `${where} on ${what} does not lead with the live rating: "${line}"`);
        }
      }
      // …and the guard is not simply "print nothing ever": a real record prints on both surfaces
      const held = fresh(NOW);
      held.player.records.bestRating = 9.536000000000001;
      assert.match(ratingAuditLine(held), / · best rating 9\.54 /);
      assert.match(ledgerRatingLine(held), / · best rating 9\.54 · /);
    });

    test('after one played job the printed high-water is max(rating over the play)', async () => {
      const state = await import('../site/js/job/state.js');
      const { fresh } = await import('../site/js/store.js');
      const { todayISO, addDays } = await import('../site/js/days.js');
      const { applyOutcome: applySchedule } = await import('../site/js/schedule.js');
      const { byId: CARDS_BY_ID, cards: ALL_CARDS } = await import('../site/data/cards.js');
      const { isBonus } = await import('../site/data/source-manifest.js');
      const { ratingAuditLine } = await import('../site/js/screens/settings.js');
      const { ledgerRatingLine } = await import('../site/js/screens/stats.js');
      const { ratingDetail } = await import('../site/js/job/call.js');
      const { RATING } = await import('../site/data/job.js');
      /** what the persisted window's calls were WORTH — the quantity both `bestRating` writers store */
      const earnedNow = (s) => ratingDetail(s.player?.rating?.calls ?? [], RATING.N).earned;

      const DAY = 86400000;
      const NOW = new Date(2026, 8, 16, 18, 0).getTime();
      const TODAY = todayISO(new Date(NOW));
      const BANK = ALL_CARDS.filter((c) => !isBonus(c.id));

      /* A save with real card records, due reviews and a seeded sitting history — no RNG, so the
         play below is one fixed sequence. The history is what `call.qHatFor` reads, and it is
         pitched at ≈ 70 % clears so the calls the job makes are INFORMATIVE (w ≥ 0.25) and the
         rating actually moves; an all-clear history would weigh 0 and leave the window blank. */
      const save = fresh(NOW - 30 * DAY);
      save.settings.testDate = addDays(TODAY, 6);
      BANK.slice(0, 70).forEach((c, i) => {
        let rec = null;
        for (let r = 0; r < 3; r++) rec = applySchedule(save, c.id, (i + r) % 4 === 0 ? 'wrong' : 'clean', { now: NOW - (30 - r * 4) * DAY });
        if (!rec) return;
        rec.cleared = true;
        rec.due = NOW - ((i % 5) + 1) * DAY;
        rec.history = Array.from({ length: 10 }, (_, k) => ({ at: NOW - (12 - k) * DAY + i * 60000, ok: ((i * 3) + k) % 10 < 7, attempt: 1, hints: 0 }));
      });
      for (const k of MAKES) save.skills[k] = { m: 62, n: 6, lastAt: NOW - 3 * DAY, lastDueCorrectAt: null };

      /* One job, through the real machine: startJob → lockCall → applyTarget → … The history entry
         the grade path writes is written HERE, before `applyTarget` is told anything, because
         `js/job/*` may not write Ledger A (the same discipline job-ledger.test.mjs follows). */
      let t = NOW;
      state.startJob(save, { today: TODAY, now: t });
      state.beginTargets(save, { now: (t += 6000) });
      const ratings = [];
      const worths = [];
      let locked = null;
      let i = 0;
      for (let step = 0; step < 300; step++) {
        const g = state.stateOf(save);
        if (!g || g.outcome != null) break;
        if (g.phase === 'envelope') {
          if (!g.stakes) { state.beginAnswer(save, { now: (t += 1000) }); continue; }
          const legal = state.callsAvailable(save);
          locked = legal[Math.min(1, legal.length - 1)];
          state.lockCall(save, locked, { now: (t += 5000) });
          continue;
        }
        if (g.phase === 'answer') {
          const it = state.currentItem(save);
          const cleared = (i++ % 3) !== 0;
          const raw = state.unguard(save);
          const rec = raw.cards[it.id] ?? (raw.cards[it.id] = { cleared: false, attempts: 0, bucket: 0, due: t, history: [] });
          if (!Array.isArray(rec.history)) rec.history = [];
          rec.history.push({ at: t, ok: cleared, attempt: cleared ? 1 : 3, hints: 0, ms: 9000 });
          state.applyTarget(save, {
            cleared, firstTry: cleared, hints: 0, attempt: cleared ? 1 : 3, solutionShown: !cleared,
          }, { now: (t += 40000), cards: CARDS_BY_ID });
          if (locked != null) { ratings.push(save.player.rating.value); worths.push(earnedNow(save)); locked = null; }
          continue;
        }
        if (g.phase === 'payout' || g.phase === 'bagpush') { state.push(save, { now: (t += 9000) }); continue; }
        if (g.phase === 'brief') { state.brief(save, {}, { now: (t += 20000) }); continue; }
        if (g.phase === 'getaway') { state.crack(save, { now: (t += 25000) }); continue; }
        break;
      }

      // the arm really played, and the rating really moved — otherwise the assertions below are free
      assert.ok(ratings.length >= 5, `only ${ratings.length} staked targets: the arm did not play`);
      assert.ok(new Set(ratings.map((r) => r.toFixed(3))).size >= 3,
        `the rating never moved (${ratings.map((r) => r.toFixed(2)).join(' ')}) — no informative call was made`);

      /* THE RECORD IS A HIGH-WATER OF `detail.earned`, NOT OF `detail.value` — which is what both
         writers store (`js/job/state.js applyTarget` and `endJob`, on the line their own comment
         calls "the number that BOUGHT the rank"), and what G9 #4's exception is for: `p.rank` is a
         ratchet and is not recomputable from the window, so the rating that bought it is kept
         beside it. Sampled here by RE-DERIVING it from the persisted window at each staked target,
         the way a reviewer would, rather than by reading back the field under test.
         This arm used to sample `rating.value` and happened to agree while `earned` was
         `min(value, ceiling)` and so could never exceed it. Verify round 2 prices the rank off the
         ceiling alone — the `min` was measured to destroy the honest player's ceiling 19 windows in
         20 (notes/repair-call.md R5) — so `earned` can now sit either side of `value` and the two
         samples are different numbers. The claim is unchanged; the quantity is the stored one. */
      const high = Math.max(...worths);
      const live = save.player.rating.value;
      assert.ok(Math.abs(high - live) > 1e-9,
        `the record (${high}) is the live RATING (${live}) — this play cannot tell the two apart, which is `
        + 'the whole of what G9 #4 asks the audit line to show');
      assert.ok(Math.min(...worths) < high - 1e-9,
        `what the calls were worth never moved (${worths.map((r) => r.toFixed(2)).join(' ')}) — a max over a `
        + 'constant series is not a high-water');

      const want = high.toFixed(2);
      for (const [where, line] of [['Settings', ratingAuditLine(save)], ['Stats', ledgerRatingLine(save)]]) {
        assert.ok(line.includes(`best rating ${want}`),
          `${where} prints the wrong high-water: "${line}" (max over the play was ${want})`);
        assert.ok(line.startsWith(live.toFixed(2)), `${where} does not lead with the live rating: "${line}"`);
      }
    });

    test('both audit surfaces answer "is this a record?" identically, value by value', async () => {
      const settings = await import('../site/js/screens/settings.js');
      const stats = await import('../site/js/screens/stats.js');
      const cases = [undefined, null, NaN, Infinity, -Infinity, '9.9', {}, [], -1, 0, 0.0001, 5, 9.9, 10];
      for (const v of cases) {
        assert.equal(settings.hasBestRating(v), stats.hasBestRating(v),
          `the two audit surfaces disagree about ${JSON.stringify(v)}`);
      }
      // 0 is the schema default (`store.freshPlayer`), and a default is not a measurement
      assert.equal(settings.hasBestRating(0), false, '0 is the declared default, not a recorded rating');
      assert.equal(settings.hasBestRating(0.01), true, 'a real high-water must print');
    });
  });

  describe('10 · the crew panel’s two false promises are withdrawn', () => {
    test('Stats no longer promises a between-jobs crew control that does not exist', () => {
      const p = prose(STATS);
      assert.ok(!/free and unlimited between jobs/.test(p),
        'Stats still promises between-jobs re-allocation; crew.allocate has one caller chain and it is the brief');
      assert.match(p, /allocated in a brief window/, 'Stats must say where crew is actually allocated');
    });

    test('Stats no longer promises that a job legalises an over-budget build', async () => {
      const p = prose(STATS);
      assert.ok(!/the next job will legalise it/.test(p),
        'nothing under site/js calls crew.legalize — the sentence is false');
      assert.match(p, /re-allocate it in a brief window/, 'the student must be told what to do instead');
      // the control: legalize() really has no CALL SITE under site/js (comments and strings stripped,
      // so this file's own explanation of why the sentence went does not trip it)
      const { listFiles, stripCommentsAndStrings } = await import('./_helpers.mjs');
      const callers = listFiles(join(ROOT, 'site/js')).filter((f) => !f.endsWith('job/crew.js'))
        .filter((f) => /\blegalize\s*\(/.test(stripCommentsAndStrings(readFileSync(f, 'utf8'))));
      assert.deepEqual(callers, [],
        'legalize() is wired now — the crew lane has landed it, so this sentence may be restored');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   VERIFY ROUND 1 — THE DOC LANE'S OWN LINTS.            (COMPOSED-GAME.md G12 #71–#77)

   Added by the `doc` fixer lane, which owns `COMPOSED-GAME.md` and no source file. It lives here
   because this file already owns the "a surface may not restate a constant the code owns" class,
   and the document is a surface: every arm below reads `COMPOSED-GAME.md` and checks it against
   the shipped functions, exactly as the arms above check `settings.js` and `stats.js`.

   THE FAILURE THIS CLOSES. The round-3 repair withdrew the claim "systematic over-calling drives
   the rating that gates it to 0" at G3.7 #9 and recorded the withdrawal on G11's list — and left
   the SAME SENTENCE standing at G3.2, still offered as "the only published brake", in the
   paragraph whose own subject is the EV hole. One withdrawal, two sites, one edit. Nothing could
   see it: a claim withdrawn in prose leaves no constant behind for the arms above to catch.

   Four arms, in order of how specific they are:
     A · the exact regression — that phrase, and the sentence it lived in;
     B · the class — a phrase on G11's withdrawn list may not be re-asserted bare anywhere else;
     C · the arithmetic behind the qualification G2 / G3.7 #8 now publish (G12 #74);
     D · the two published surfaces whose numerals the document quotes: G1's sample primary button
         (G12 #72) and G2's rank-band partition (G12 #73).
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

import { callEntry, ratingDetail, rankFor, weightFor } from '../site/js/job/call.js';
import { PUBLISHED, SHAPES, RANK_THRESHOLDS } from '../site/data/job.js';
import { rankBandCells } from '../site/js/screens/settings.js';

const SPEC = read('COMPOSED-GAME.md');
const SPEC_LINES = SPEC.split('\n');

/** G11's "Withdrawn at round 4" list — the one block where a withdrawn phrase is the SUBJECT. */
const WITHDRAWN_BLOCK = (() => {
  const from = SPEC_LINES.findIndex((l) => l.startsWith('**Withdrawn at round 4'));
  assert.ok(from > 0, 'G11 no longer carries a "Withdrawn at round 4" list — arm B cannot be scoped');
  const to = SPEC_LINES.findIndex((l, i) => i > from && l.startsWith('## G12'));
  assert.ok(to > from, 'the withdrawn list runs to the end of the file — the G12 heading moved');
  return { from, to };
})();
const inWithdrawnList = (i) => i > WITHDRAWN_BLOCK.from && i < WITHDRAWN_BLOCK.to;

/* A line may carry a withdrawn phrase only while it is SAYING SOMETHING ABOUT the phrase. These are
   the forms this document actually uses to do that; a bare re-assertion carries none of them. */
const RETRACTS = /withdrawn|no longer|\*\*Claimed\b|was false|false as|never was|replaces|used to/i;

/* A MARKDOWN PARAGRAPH IS ONE LINE IN THIS FILE, and some of them run 2 000 characters. Testing the
   whole line for a retraction word is far too weak — the round-3 defect's own paragraph contains
   "it is not a corner case" 120 characters upstream of the phrase, which would have satisfied any
   line-wide test. So the retraction has to sit NEXT TO the claim, which is also the only place a
   reader would find it: 60 characters upstream (enough for "**Claimed:**" or "no longer says") and
   200 downstream (enough for ", offered as *the* brake) is withdrawn."). */
const retractedAt = (line, idx, len) => RETRACTS.test(line.slice(Math.max(0, idx - 60), idx + len + 200));
/** A G12 changelog entry opens by QUOTING the claim it is about; the quote is the entry's subject. */
const isChangelogClaim = (line) => /^\d+\. \*\*Claimed/.test(line);
/** A line where an old claim may legitimately appear verbatim: G11's list, or a G12 "Claimed:" entry. */
const quotesByDesign = (line, i) => inWithdrawnList(i) || isChangelogClaim(line);
/** every occurrence of `re` in `line`, as {idx, len} */
const occurrences = (line, re) => [...line.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))]
  .map((m) => ({ idx: m.index, len: m[0].length }));

describe('doc · COMPOSED-GAME.md may not re-assert a claim it withdrew (G12 #71–#77)', () => {
  describe('A · the exact regression: the over-calling brake', () => {
    const PHRASE = 'systematic over-calling drives the rating that gates it to 0';

    test('every site of the withdrawn phrase says it is withdrawn', () => {
      const hits = SPEC_LINES
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => line.includes(PHRASE));
      assert.ok(hits.length >= 2,
        `the withdrawn phrase appears ${hits.length} time(s). G11 §"Withdrawn at round 4" says a `
        + 'document may not quietly drop a claim it spent a section defending, so the phrase must '
        + 'survive at G3.7 #9 and on the withdrawn list — deleting it is not the repair');
      for (const { line, i } of hits) {
        const ok = quotesByDesign(line, i)
          || occurrences(line, new RegExp(PHRASE)).every((o) => retractedAt(line, o.idx, o.len));
        assert.ok(ok,
          `COMPOSED-GAME.md:${i + 1} asserts "${PHRASE}" without withdrawing it. That is the round-3 `
          + 'defect exactly: the claim was withdrawn at G3.7 #9 and left standing at G3.2. Since the '
          + 'rank ratchet the rating falls to 0.00 and the rank does NOT follow it, so the sentence '
          + 'names a brake that no longer exists.');
      }
    });

    test('and G3.2 no longer offers a rank brake at all — the sentence itself is gone', () => {
      assert.ok(!/The only published brake is the rank ladder/.test(SPEC),
        'G3.2 is publishing "The only published brake is the rank ladder" again. Since the ratchet '
        + 'the 95 rung is gated at Called 3 ON THE WAY UP ONLY and is never withdrawn afterwards, so '
        + 'at S = 0 there is no EV brake and no rank brake — only the carry ladder off S = 0.');
      /* the positive half: G3.2 must still tell the reader what IS left */
      assert.match(SPEC, /There is no EV brake on over-calling at `S = 0`/,
        'G3.2 states the EV hole but no longer states that over-calling is unbraked there');
    });

    test('NEGATIVE CONTROL · the round-3 sentence, spliced back in, is flagged', () => {
      /* Without this the arm above proves only that the phrase is absent from the two places it is
         absent from. The control re-inserts the withdrawn sentence into G3.2's own paragraph —
         including the "it is not a corner case" that sits 120 characters upstream of it and that a
         line-wide retraction test would have accepted — and asserts the lint says no. */
      const OLD = ' The only published brake is the rank ladder (95 needs Called 3, and '
        + `${PHRASE}), which is a *rating* brake, not an EV one.`;
      const i = SPEC_LINES.findIndex((l) => l.includes('it is the opening beat'));
      assert.ok(i > 0, 'G3.2 no longer contains the S = 0 paragraph this control splices into');
      const mutated = SPEC_LINES[i].replace('it is the opening beat.', `it is the opening beat.${OLD}`);
      const flagged = occurrences(mutated, new RegExp(PHRASE))
        .filter((o) => !retractedAt(mutated, o.idx, o.len));
      assert.equal(flagged.length, 1,
        'the lint does not flag the exact sentence it exists to flag — a retraction word anywhere on '
        + 'a 2 000-character markdown paragraph must not count as retracting the claim');
    });
  });

  describe('B · the class: a withdrawn phrase may not stand bare anywhere else', () => {
    /* Seeded with the phrases this document withdrew that appear at MORE THAN ONE site — which is
       the only shape the round-3 defect can take. Growing this list is cheap; leaving it at one
       entry would make the lint a pin rather than a rule. */
    const WITHDRAWN = [
      ['the farmer’s ceiling', /farmer[’']s ceiling/],
      ['raisable only by clearing more of the packet', /raisable only by clearing more of the packet/i],
      ['Tanking is strictly dominated', /strictly dominated/],
      ['three states, two flips, no dominant build', /three states, two flips/i],
      /* added by the verify round: the three claims G12 #74 / #75 / #76 deleted rather than repaired */
      ['what a throw cannot buy is the rank', /what a throw cannot buy is the rank\b/i],
      /* the VALUE, not the bare identifier: the repair paragraph and G12 #75 both quote the grep
         `grep -rn "drawnBy" …` that proves the field absent, and a grep string is not a claim */
      ["drawnBy: 'job'", /drawnBy: 'job'/],
      ['HELD crew skips the call', /crew skips the \*?call/i],
    ];

    for (const [name, re] of WITHDRAWN) {
      test(`"${name}" is retracted at every site it appears`, () => {
        const hits = SPEC_LINES.map((line, i) => ({ line, i })).filter(({ line }) => re.test(line));
        assert.ok(hits.length > 0,
          `"${name}" is on G11's withdrawn list and has vanished from the document. A withdrawn `
          + 'claim stays on the record (G11: "so that round 5 does not re-derive them").');
        for (const { line, i } of hits) {
          if (quotesByDesign(line, i)) continue;
          for (const o of occurrences(line, re)) {
            assert.ok(retractedAt(line, o.idx, o.len),
              `COMPOSED-GAME.md:${i + 1} re-asserts the withdrawn claim "${name}" with nothing that `
              + `retracts it within reading distance: …${line.slice(Math.max(0, o.idx - 60), o.idx + o.len + 200)}…`);
          }
        }
      });
    }
  });

  describe('C · what a throw can and cannot buy — the qualification at G2 and G3.7 #8 (G12 #74)', () => {
    const N = RATING.N;
    /** `k` calls at one q̂ on one rung, the first `h` cleared; the rest of the window left unfilled. */
    const windowOf = ({ k, h, q, call }) => Array.from({ length: k }, (_, i) =>
      callEntry({ call, ok: i < h, qHat: q, skill: 'X', at: i }));

    test('an ALREADY-COMPETENT student generates no measurement at all: 5.00 · Called 2', () => {
      /* q̂ = 0.97 ⟹ w = 0.116 < RATING.informativeMin, so `callEntry` writes a blank slot and the
         window never fills. This is the student G2's old unqualified sentence could not see: they
         never pass through the informative band, so the ratchet has no rung of theirs to hold. */
      assert.ok(weightFor(0.97) < 0.25, 'q̂ = 0.97 must be OUTSIDE the informative band or the arm is vacuous');
      const d = ratingDetail(windowOf({ k: N, h: N, q: 0.97, call: 95 }), N);
      assert.equal(d.n, 0, 'a mastered window is empty — nothing informative enters it');
      assert.equal(d.measured, false);
      assert.equal(d.value, RATING.base, 'and the rating sits at exactly 5.00');
      assert.equal(d.rank, 2, 'which prints Called 2: the rung the claim assumes they hold does not exist');
    });

    test('…and throwing back INTO the band buys Called 5 outright, which the ratchet then keeps', () => {
      /* One in ten thrown puts the make at q̂ ≈ 0.90, where the honest rung is 85 and `w·E[c]` is at
         the top of the reachable ladder (2.268 — G3.7 #8's own table). A full window there is the
         9.536 G2 "Rank" already publishes for the demotion slide, read the other way round. */
      const t = ratingDetail(windowOf({ k: N, h: 45, q: 0.90, call: 85 }), N);
      assert.equal(t.n, N, 'every slot is informative at q̂ = 0.90');
      assert.equal(t.measured, true);
      assert.ok(Math.abs(t.value - 9.536) < 5e-3, `a full window at q̂ 0.90 scores ${t.value}, not 9.536`);
      assert.equal(t.rank, 5, 'Called 5 — bought by the throws, not by passing through the band while learning');
      assert.equal(t.held, false, 'and bought outright: no floor was needed to print it');

      /* the permanence: master the material again and the window empties, but the rung stays */
      const after = ratingDetail(windowOf({ k: N, h: N, q: 0.97, call: 95 }), N, { rank: t.rank });
      assert.equal(after.value, RATING.base, 'the rating falls back to 5.00 once the window empties');
      assert.equal(after.rank, 5, 'the rank does NOT fall — this is the cost of the ratchet, and it is published');
      assert.equal(after.held, true, 'and `held` says the floor is what carried it');
    });

    test('the LEARNER half of the claim, which is the half that survives, still holds', () => {
      /* A rung earned on the way up is never withdrawn by any later call, however bad. This is what
         G2 and G3.7 #8 still assert, and it is why the qualification is a qualification rather than
         a retraction: for a student with a rung, a throw re-buys a tool they own. */
      const wild = Array.from({ length: N }, (_, i) =>
        callEntry({ call: 95, ok: i % 2 === 0, qHat: 0.5, skill: 'X', at: i }));
      const d = ratingDetail(wild, N, { rank: 5 });
      assert.equal(d.measured, true, 'fifty 95-calls at q̂ 0.5 is a full measurement');
      assert.equal(Math.round(d.value * 100) / 100, 0, 'the rating goes all the way to 0.00');
      assert.equal(rankFor(d.value), 1, 'and the window on its own would print Called 1');
      assert.equal(d.rank, 5, 'but the earned rung is held — G3.2 and G3.7 #9 both now say so');
    });
  });

  describe('D · the numerals the document quotes off a shipped surface', () => {
    test('EVERY sample primary button is the line `board.js` builds on the nominal draft (G12 #72)', () => {
      /* The round-3 defect was published at TWO sites — G1's worked trace and G6's "every primary
         button prints" sentence — so this arm walks the whole document rather than the first hit.
         A quoted DEFECT is allowed where it is retracted, by the same reading-distance rule as the
         withdrawn-phrase arms above; anything else has to be the shipped triple. */
      const wallS = PUBLISHED.shapeTable.JOB.wallS[0];             // 740 — the nominal JOB row
      const minutes = Math.ceil(wallS / 60);                        // what `board.js` prints: ~13 min
      const split = Math.round(PUBLISHED.nominalHeadlineSplit.JOB[0]); // the headline basis: 38 %

      /* `ends` is `now + wallS`, and G1 states the trace's own clock, so the end time is derived */
      const clock = /board read at (\d\d):(\d\d)/.exec(SPEC);
      assert.ok(clock, 'G1 no longer states the clock its worked trace is read at, so `ends` is unpinnable');
      const endMin = Math.floor((Number(clock[1]) * 60 + Number(clock[2])) + wallS / 60);
      const ends = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

      const BUTTON = /~(\d+) min · ends (\d\d:\d\d) · (\d+) % game/g;
      let live = 0;
      SPEC_LINES.forEach((line, i) => {
        for (const m of line.matchAll(BUTTON)) {
          /* A triple that IS the shipped one is a live sample and needs no excuse. Only a triple
             that is NOT may appear, and only where it is retracted in place or is the subject of a
             G12 "Claimed:" entry — the order matters, because a repair parenthetical quoting the
             old line sits downstream of the corrected line it repairs. */
          if (Number(m[1]) === minutes && m[2] === ends && Number(m[3]) === split) { live++; continue; }
          if (quotesByDesign(line, i) || retractedAt(line, m.index, m[0].length)) continue;
          assert.equal(Number(m[1]), minutes,
            `COMPOSED-GAME.md:${i + 1} prints a JOB wall clock no shipped path produces. `
            + `On the nominal draft \`board.js\` prints ~${minutes} min (Math.ceil(${wallS}/60)); the `
            + `measured boards are a different table again. Found: ${m[0]}`);
          assert.equal(m[2], ends,
            `COMPOSED-GAME.md:${i + 1} prints an end time that is not \`now + wallS\` off the stated `
            + `${clock[1]}:${clock[2]} clock (${ends}). Found: ${m[0]}`);
          assert.equal(Number(m[3]), split,
            `COMPOSED-GAME.md:${i + 1} prints a split that is none of the four published bases `
            + `(${PUBLISHED.shapeTable.JOB.split.join(' / ')} table, `
            + `${PUBLISHED.nominalHeadlineSplit.JOB.join(' / ')} headline). The board prints the `
            + `headline basis, so the nominal draft is ${split} %. Found: ${m[0]}`);
        }
      });
      assert.ok(live >= 2,
        `only ${live} live sample button(s) found; the document published this line at two sites and `
        + 'the round-3 repair fixed neither, so the arm must see both');

      /* and the FIRST field is the shape's own name — `COPY.primary` opens with `SHAPES[id].name` */
      const trace = SPEC_LINES.find((l) => l.trimStart().startsWith('[ ') && l.includes('% game'));
      assert.ok(trace, 'G1 no longer carries a bracketed sample primary button');
      assert.match(trace.trim(), new RegExp(`^\\[ ${SHAPES.JOB.name} · `),
        `the sample button must lead with the shape name, not a verb: ${trace.trim()}`);
    });

    test('the G2 Rank table prints the partition `rankBandCells()` renders, not `bandTop` (G12 #73)', () => {
      const rows = [...SPEC.matchAll(/^\| (\d) \| \*\*(Called \d)\*\* \| `([^`]+)` \|/gm)]
        .map((m) => ({ rank: Number(m[1]), name: m[2], range: m[3] }));
      assert.equal(rows.length, RANK_THRESHOLDS.length,
        'G2 Rank table no longer has one row per rank, or its rating cell is no longer code-quoted');
      const cells = rankBandCells();
      for (const row of rows) {
        const cell = cells.find((c) => c.rank === row.rank);
        assert.ok(cell, `no shipped band for rank ${row.rank}`);
        assert.equal(row.name, cell.name, `rank ${row.rank} is named differently in the document`);
        assert.equal(row.range, cell.range,
          `G2 prints "${row.range}" for ${cell.name} and \`rankBandCells()\` renders "${cell.range}". `
          + 'The display roundings (4.9 / 6.4 / 7.6 / 8.8) leave 4.95, 6.45, 7.65 and 8.85 in no band '
          + 'at all, and `call.rankFor` ranks every one of them.');
      }
      /* the negative control: the rendering the document used to print really was unsatisfiable */
      const orphans = [4.95, 6.45, 7.65, 8.85].filter((v) =>
        !cells.some((c) => v >= c.from && (c.range.startsWith('≥') ? true : v < c.to)));
      assert.deepEqual(orphans, [], 'the shipped partition orphans a rating — it is not a partition');
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * 8 · VERIFY ROUND 2 — the rank is bought with evidence the game does not price
 *
 * The finding: `COMPOSED-GAME.md` G3.7 proof 8 priced "the throw" as the loss of a staked job target
 * ("the target itself, the chain, the XP, the bucket and the Readiness", residual prize "at most
 * 2.5 % overall"), and on that basis G3.8 #4 published "Desirable difficulty is the only path to
 * rank" and G9 #6 "Nothing can be farmed". But the anti-farming weight `w = 4q̂(1−q̂)` is built by
 * `call.qHatFor` out of `save.cards[*].history`, and `screens/card.js` pushes an entry there on
 * EVERY graded original — job target or plain Today's Page sitting. A card failed OUTSIDE a job
 * therefore moves `w` while paying no carry, no chain and no rating (proof 4: there is none without
 * `inProgress.game`), so the action the document prices is not the action an exploiter takes.
 *
 * The end-to-end measurement is 48 simulated jobs and is deliberately NOT in this suite — it lives
 * at `notes/repair-meta-evidence.mjs` (Called 2 vs Called 4 on 8/8 seeds, +11.63 % post-climb loot
 * AS MEASURED IN VERIFY ROUND 2 — re-measured in verify round 3 at +6.91 %; §12 at the foot of this
 * file now SPAWNS that script and pins the document's numerals to its stdout, which is the gap this
 * sentence used to describe as deliberate — byte-identical study ledger on 8/8). What IS pinned
 * here is the pair of MECHANISM facts the
 * simulation is built out of, both of them microseconds, plus the published claims that must not
 * drift back now that they have been withdrawn.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */
describe('J7 meta · verify round 2: the rank is bought with evidence the game does not price', () => {
  describe('8 · the mechanism, pinned so the 48-job simulation is not what stands between this and a regression', () => {
    test('a sitting that is NOT a job target moves the anti-farming weight — no game state required', async () => {
      const { qHatDetail, weightFor, RATING: R } = await import('../site/js/job/call.js');
      const cards = { c1: { id: 'c1', skills: ['M1-EXP'] } };
      /* ten clears: the already-competent student G3.7 proof 8 names. q̂ = 1, w = 0, window empty. */
      const hist = Array.from({ length: 10 }, (_, i) => ({ at: 1000 + i, ok: true, attempt: 1, hints: 0 }));
      const save = { cards: { c1: { history: hist } } };          // NO `game`, NO `inProgress`
      const before = qHatDetail(save, 'M1-EXP', { cards });
      assert.equal(before.qHat, 1, 'the master clears everything');
      assert.equal(weightFor(before.qHat), 0, 'and every call they make weighs nothing');
      assert.equal(before.informative, false, 'so nothing they do can enter the rating window');

      /* TWO free study sittings marked wrong — the exact entry `screens/card.js` writes on a graded
         original, made on Today's Page, with no job anywhere in the save. */
      save.cards.c1.history.push({ at: 2000, ok: false, attempt: 1, hints: 0, ms: 9000 });
      save.cards.c1.history.push({ at: 2001, ok: false, attempt: 1, hints: 0, ms: 9000 });
      const after = qHatDetail(save, 'M1-EXP', { cards });

      assert.equal(after.of, R.qHatWindow, 'the window is still the trailing ten sittings');
      assert.equal(after.qHat, 0.8, 'two misses in ten is a clear rate of 0.8');
      assert.ok(weightFor(after.qHat) >= R.informativeMin,
        `w = ${weightFor(after.qHat)} must clear the informative gate ${R.informativeMin} — this is the `
        + 'whole exploit: the student is now rateable, and nothing in the GAME was spent to get there');
      assert.equal(after.informative, true, 'the same calls are now measurements');

      /* and NOTHING the game layer prices moved: there is no game state in this save at all. */
      assert.equal(save.game, undefined, 'no game ledger was written by a free sitting');
      assert.equal(save.inProgress, undefined, 'no job was in progress; proof 4 prices nothing here');
      assert.equal(save.player, undefined, 'no rating, no rank, no carry, no chain — and yet w moved');
    });

    test('the writer really is unconditional: `screens/card.js` pushes history on a graded original, job or not', () => {
      /* Deliberately tolerant of the receiver's name and of formatting — another lane owns this file
         and the point being pinned is that the push exists on BOTH branches (cleared and missed),
         with no `inProgress.game` / job test standing between them and the write. */
      const CARD = read('site/js/screens/card.js');
      const pushes = [...CARD.matchAll(/history\.push\(\{[^}]*ok:\s*(true|false)/g)].map((m) => m[1]);
      assert.ok(pushes.includes('true') && pushes.includes('false'),
        'screens/card.js no longer writes a history entry on both the cleared and the missed branch — '
        + 'if that changed, re-measure `notes/repair-meta-evidence.mjs` and re-state G3.7 proof 8');
      assert.match(read('site/js/job/call.js'), /save\.cards|cards\[|\.history/,
        'call.js no longer reads the card history at all — the whole VR2-FARM paragraph is then stale');
    });

    /* MID-ROUND, THE CAP HALF CLOSED AND THIS TEST WAS REWRITTEN TO THE NEW TRUTH.
       The verify-2 finding had two halves: the ACTION (a sitting the game does not price moves `w`)
       and the REPORT (`slotCeiling` took the flattering root of `w = 4q̂(1−q̂)`, so a CHOSEN q̂ = 0.2
       was capped exactly as an earned q̂ = 0.8). While this ticket was open the call lane landed the
       save-schema change that closes the second half — `callEntry` now stores `q` and `slotCeiling`
       uses it — so the chosen-q̂ lie is priced at 0 and ranks Called 2. Re-measured through
       `notes/repair-meta-evidence.mjs` §2 after it landed: q̂ ∈ {0.2, 0.3, 0.5} → ceiling 0.00,
       Called 2; q̂ = 0.8 → ceiling 8.28 / 6.76, Called 4. The FIRST half is untouched by it, and the
       same script's §1 re-run after the change is byte-for-byte the run before it — rank 2 vs 4 on
       8/8, +11.63 % post-climb AT THE TIME (the economy has moved since; §12 below re-runs the
       script every suite and pins the document to whatever it prints) — because the sandbagger's
       report is HONEST about the evidence they
       manufactured. That is the distinction this test now pins, and it is why Request A is the
       mechanic that closes VR2-FARM and this one is not. */
    test('the cap now binds on a CHOSEN q̂ — and still cannot tell manufactured evidence from earned', async () => {
      const { callEntry, ratingDetail, weightFor, informativeBand } = await import('../site/js/job/call.js');
      /* `w = 4q̂(1−q̂)` has two roots symmetric about ½; the ambiguity the entry now resolves. */
      assert.ok(Math.abs(weightFor(0.2) - weightFor(0.8)) < 1e-12,
        'the two roots are the same weight by construction (to float epsilon)');
      const [lo, hi] = informativeBand(weightFor(0.2));
      assert.ok(Math.abs(lo - 0.2) < 1e-9 && Math.abs(hi - 0.8) < 1e-9, 'and they are exactly 0.2 / 0.8');

      const win = (qHat) => Array.from({ length: RATING.N }, (_, i) =>
        callEntry({ call: 85, ok: true, qHat, skill: 'M1-EXP', at: i }));
      const chosen = ratingDetail(win(0.2), RATING.N);   // 85 on material they miss 4 times in 5
      const honest = ratingDetail(win(0.8), RATING.N);   // 85 on material they clear 4 times in 5
      assert.ok(chosen.ceiling < honest.ceiling,
        'THE REPORT half has re-opened: `slotCeiling` is taking the flattering root again, so a chosen '
        + 'q̂ = 0.2 is priced as an earned q̂ = 0.8. Re-measure notes/repair-meta-evidence.mjs §2 and '
        + 're-state G3.7 proof 8 — the document currently publishes this half as CLOSED.');
      assert.ok(chosen.rank < honest.rank, 'and the rank follows the cap, not the dice');
      assert.match(JSON.stringify(callEntry({ call: 85, ok: true, qHat: 0.2 })), /"q":0\.2/,
        'the entry no longer stores q̂, which is the change that closed the report half');

      /* THE ACTION half, which that change does NOT touch: nothing in the entry says WHERE the
         sitting that set q̂ happened, so a q̂ = 0.8 manufactured on Today's Page and a q̂ = 0.8 earned
         on staked job targets are the same slot, byte for byte, and buy the same rank. */
      const keys = Object.keys(callEntry({ call: 85, ok: true, qHat: 0.8, skill: 'M1-EXP', at: 1 }));
      assert.ok(!keys.some((k) => /stake|job|source|role|where|target/i.test(k)),
        `the entry now records provenance (${keys.join(', ')}) — if that is a staked-sitting marker, `
        + 'Request A may have landed and VR2-FARM must be re-measured and re-stated');
      const manufactured = ratingDetail(win(0.8), RATING.N);
      assert.deepEqual(manufactured, honest,
        'the rating path distinguishes two windows that differ only in where the evidence was made — '
        + 'it cannot, and that is exactly the open half of VR2-FARM');
      assert.ok(honest.rank > 2,
        'and the rank it buys is above the Called 2 the honest master with an empty window is stuck at');
    });
  });

  describe('9 · the document no longer makes the two claims the round falsified', () => {
    test('G3.8 #4 no longer publishes "Desirable difficulty is the only path to rank"', () => {
      assert.ok(!/\*Desirable difficulty is the only path to rank\.\*/.test(SPEC),
        'the italic claim is back in G3.8 #4; fabricated difficulty buys the same rank for free');
      assert.match(SPEC, /Desirable difficulty is the DEAREST path to rank/,
        'G3.8 #4 no longer states what IS true of that step');
      assert.match(SPEC, /“Desirable difficulty is the only path to rank\.”/,
        'the withdrawal is not on record in G11 — a document may not quietly drop a claim');
    });

    test('G9 #6 states its exception in the criterion, and G9 no longer says all ten pass', () => {
      assert.ok(!/^6\. \*\*Nothing can be farmed\.\*\*/m.test(SPEC),
        'G9 #6 is back to the unqualified "Nothing can be farmed." — the RANK is farmable');
      assert.match(SPEC, /Nothing can be farmed — except the RANK/, 'the exception is not in the criterion');
      assert.ok(!/is not a criterion\. All ten must pass\.\s*$/m.test(SPEC),
        'the G9 preamble claims all ten pass while criterion 6 carries a measured exception');
      assert.match(SPEC, /notes\/repair-meta-evidence\.mjs/,
        'the criterion cites no reproduction — the /tmp script the critic ran is gone in three days');
    });

    test('G9 #1 and G8\'s J8 row carry the consistent-surface condition and the measured cross-regime error', () => {
      assert.ok(!/agree within 5 points on all four shapes, on both the default and the full-use path/.test(SPEC),
        'the agreement claim is unconditioned again; across a change of surface it is 7.4 points out');
      assert.match(SPEC, /each measured against a history of its OWN surface/,
        'G9 #1 no longer states the condition the suite actually measures');
      assert.match(SPEC, /tap→FULL worst 6\.9/, 'the measured tap→full error is not published');
      assert.match(SPEC, /full→tap worst 7\.4/, 'the measured full→tap error is not published');
      assert.match(SPEC, /on both paths \*\*seasoned with their own path\*\*/,
        "G8's J8 acceptance row still claims both paths without saying each is seasoned with its own");
    });

    test('both mechanics are recorded as OPEN in the lane note, with the file that would close them', () => {
      const note = readIfAny('notes/repair-meta.md') ?? '';
      assert.ok(note.includes('Requests'), 'notes/repair-meta.md has no Requests section');
      assert.ok(/q̂ only from sittings that were themselves staked job targets|staked job targets/.test(note),
        'the q̂-from-staked-targets request is not on record, so the open mechanic has no owner');
      assert.ok(note.includes('projectFor'),
        'the projectFor path-term request is not on record');
    });
  });

  describe('10 · Settings publishes the mechanic and what it really costs', () => {
    test('the rating panel carries an `the evidence` row naming the unpriced sitting', () => {
      const p = prose(SETTINGS);
      assert.match(p, /'the evidence'/, 'the rating panel has no evidence row');
      assert.match(p, /no carry, no chain and no rating/,
        'the panel does not say that a sitting outside a job costs the game nothing');
      assert.match(p, /Today’s Page/, 'the panel does not name where the free sitting happens');
      /* and it still says what it DOES cost — the ledger this app is for */
      assert.match(p, /the bucket drops, the mastery hit lands, the error is logged and Readiness/,
        'the panel names the exploit without naming its real price, which is the dishonest half');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   VERIFY ROUND 2 — THE DOC LANE'S OWN LINTS.            (COMPOSED-GAME.md G12 #78–#81)

   Appended by the `doc` fixer lane (owner of `COMPOSED-GAME.md`, no source file), same rationale as
   the round-1 block above: the document is a surface, and a surface may not restate a rule the code
   owns.

   THE FAILURE CLASS THIS CLOSES, which is not the round-1 one. Round 1 caught a claim the document
   WITHDREW and went on asserting. Round 2 caught four claims the CODE moved past and the document
   went on publishing — a spec running behind its own tree, which is worse than stale, because it
   reads to a later round as authority to "repair" the code back to the older rule. All four were
   reproduced by running the shipped code before anything was edited.

     E · G2 / G3.1 — the rank ratchet is `rankFor(min(value, ceiling), {floor})`, not
         `rankFor(value, {floor})`; the readable branch is published as the set the code computes;
         and "monotonically in the rating" may not stand unretracted (#78).
     F · G3.8 / G9 #5 / G8's J4 row — the four-condition domain must be published WITH its
         reachability, and the bound must be the one `tests/job-align.test.mjs` asserts (#79).
     G · G1 statement 2 / G9 criterion 1 — the mid-job-WALK claim must be published in the two
         registers `tests/job-board.test.mjs` asserts, never as an unqualified "five of five" (#80).
     H · G6's phone paragraph — the board sheet's cap and its flow must be what `css/job.css`
         actually declares (#81).

   Each arm reads the SHIPPED artefact (the module, the test that owns the measurement, or the
   stylesheet) and derives what the document must say from it. No numeral below is typed twice.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

import { isInformative, informativeQHats, wTimesEcDiscrete } from '../site/js/job/call.js';
import { SPLIT, LAYOUT } from '../site/data/job.js';

const ALIGN_SRC = read('tests/job-align.test.mjs');
const BOARD_SRC = read('tests/job-board.test.mjs');
/** the stylesheet with its (long, argumentative) block comments stripped — a comment may say
 *  anything; it is the DECLARATION that ships. Same treatment `job-screen.test.mjs` gives it. */
const JOB_CSS = read('site/css/job.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** pull one capture out of a source file, or fail with the reason the lint cannot run */
const capture = (src, re, what) => {
  const m = re.exec(src);
  assert.ok(m, `${what} — this lint derives the document's numeral from that assertion and it is gone`);
  return m[1];
};

describe('doc · COMPOSED-GAME.md may not publish a rule the code has moved past (G12 #78–#81)', () => {
  describe('E · G2 / G3.1 · THE CAP: the rank is priced off min(value, ceiling)', () => {
    test('the document publishes the shipped ratchet rule, and not the pre-cap one', () => {
      /* DERIVED FROM `call.js`, because this expression has already moved twice in one round:
         `rankFor(value, {floor})` → `rankFor(min(value, ceiling), {floor})` → `rankFor(ceiling, …)`.
         The lint does not care WHICH it is; it cares that the document says the same thing. */
      const CALL = read('site/js/job/call.js');
      const rhs = capture(CALL, /\n\s*const earned = ([^;]+);/, '`ratingDetail` no longer computes an `earned`');
      assert.ok(SPEC.includes(`rankFor(${rhs}, { floor })`) || SPEC.includes(`earned  = ${rhs}`),
        `G2 "Rank" does not publish the shipped rule. \`call.js ratingDetail\` computes `
        + `\`earned = ${rhs}\` and ranks THAT — a spec that publishes anything else is an instruction `
        + 'to a later round to "repair" the scorer back to a rule it has already left behind.');
      assert.ok(SPEC.includes('rankFor(earned, { floor: rank held })'),
        'the published formula block no longer shows the floor being applied to `earned`');
      assert.ok(!/floors the computed rank on the rank held \(`rankFor\(value, \{ floor \}\)`\)/.test(SPEC),
        'the pre-cap rule is published again in G2\'s ratchet paragraph');
      for (const word of ['ceiling', 'earned']) {
        assert.ok(SPEC.includes(word),
          `the document never names \`${word}\`, which is half of the rule the rank is read off`);
      }
    });

    test('…and the shipped scorer really does cap: a lucky window ranks BELOW its own rating band', () => {
      /* the §3 case from `job-call.test.mjs`: at q̂ = 3/5 the 70 rung is worth exactly the neutral,
         so however the dice fall the rank may not move — while the raw rating clamps to the top. */
      const N = RATING.N;
      const win = Array.from({ length: N }, (_, i) => callEntry({ call: 70, ok: true, qHat: 0.6, skill: 'X', at: i }));
      const d = ratingDetail(win, N);
      assert.ok(Math.abs(d.ceiling - RATING.base) < 1e-6,
        `the 70 call at q̂ = 3/5 is worth ${d.ceiling}, not the neutral — the tied rung is no longer tied`);
      assert.ok(d.value > d.ceiling && d.capped, 'the arm needs a window whose dice ran ahead of its reports');
      assert.ok(d.rank < rankFor(d.value),
        `the capped rank (${d.rank}) is not below the rating band's rank (${rankFor(d.value)}) — `
        + 'there is no cap to document');
      assert.equal(rankFor.length, 1, '`rankFor` is no longer default-off in its floor');
    });

    test('the INFORMATIVE GRID the document publishes is the set the code computes', () => {
      /* ────────────────────────────────────────────────────────────────────────────────────────
         VERIFY r3 · BLOCKER (call-propriety). THIS ARM USED TO READ:

             const printed = capture(SPEC, /`q̂ ∈ \{([^}]+)\}`/, '…').split(',').map(Number);
             const computed = Array.from({length: RATING.qHatWindow + 1}, (_, k) => k / RATING.qHatWindow)
               .filter(isInformative);
             assert.deepEqual(printed, computed);

         — it compared the document's deciles against a DECILE GENERATOR, so the two agreed and both
         were wrong. `call.qHatDetail` divides by the sittings the make HAS (`of = win.length`), not
         by the window, so the reachable q̂ are `h/of` for `of = min(qHatWindow, sittings)`: the
         informative set has 31 members, not 9, and its best `w·E[c]` is 2.4980 at 6/7 — above the
         2.2680 at 9/10 the Sanity table published as the reachable maximum. This arm's own words
         say why that matters ("publishing the wrong set publishes the identity over the wrong
         domain"), and it was the thing publishing it. The generator is now the CODE's
         (`call.informativeQHats`), and what the document is held to is the grid's SHAPE — its size
         and its maximum — because a 31-member set is not a thing a spec line should transcribe.
         ──────────────────────────────────────────────────────────────────────────────────────── */
      const computed = informativeQHats();
      assert.ok(computed.length >= 31,
        `the code's informative reachable grid has ${computed.length} members — if the window or the `
        + 'gate moved, the document below moves with it');
      const deciles = Array.from({ length: RATING.qHatWindow + 1 }, (_, k) => k / RATING.qHatWindow)
        .filter(isInformative);
      assert.ok(computed.length > deciles.length,
        'the reachable grid is the deciles again — `qHatDetail` has gone back to dividing by the window');

      const printedSize = Number(capture(SPEC, /\*\*(\d+)\*\* informative values/,
        'G12 #78 no longer publishes the size of the informative reachable grid'));
      assert.equal(printedSize, computed.length,
        `the document publishes ${printedSize} informative reachable q̂ and the code computes `
        + `${computed.length} — that grid is the domain over which the truthful rung is the `
        + 'slot-by-slot maximiser, so publishing the wrong set publishes the identity over the wrong domain');

      /* and the MAXIMUM, which is the number G3.1's Sanity table and G3.7 #8 price against */
      const peak = computed.map((r) => ({ ...r, wec: wTimesEcDiscrete(r.q) }))
        .sort((a, b) => b.wec - a.wec)[0];
      assert.equal(`${peak.hits}/${peak.of}`, '6/7', 'the reachable argmax of w·E[c] moved');
      const printedPeak = Number(capture(SPEC, /\*\*([\d.]+) at [^*]{0,12}6\/7/,
        'no site publishes the reachable maximum of w·E[c] and the q̂ that reaches it'));
      assert.ok(Math.abs(printedPeak - peak.wec) < 5e-5,
        `the document publishes ${printedPeak} as the reachable maximum and the code computes `
        + `${peak.wec.toFixed(4)} at ${peak.hits}/${peak.of}`);
      assert.ok(peak.wec > wTimesEcDiscrete(0.9),
        'the decile 9/10 is the maximum again — the four values above it have left the grid');
    });

    test('F1 — the double-root hole is CLOSED in the code, and the document may not publish it as open', () => {
      /* THIS ARM CHANGED SIDES MID-ROUND, deliberately. F1 was drafted as an open finding: the slot
         stored only `(w, p)`, `w = 4q̂(1−q̂)` has two roots, and the cap guessed the flattering one.
         The call lane then landed `q` on the entry. The arm now holds the CLOSURE — and the document
         with it — so that a later round cannot quietly undo the save-schema change and leave G2
         claiming an identity the scorer no longer has. */
      const entry = callEntry({ call: 85, ok: true, qHat: 0.8, skill: 'M', at: 1 });
      assert.ok(Number.isFinite(entry.q),
        'an informative call entry no longer stores its own `q`. If the save schema is being rolled '
        + 'back, G2 THE CAP must go back to publishing F1 as OPEN — the identity is false without it.');
      const mock = callEntry({ p: 0.25, ok: true, w: 0.64, skill: null, at: 1 });
      assert.ok(!Number.isFinite(mock.q),
        'the Mock\'s defined-weight slot now carries a `q̂` it cannot have — it has no make, so there '
        + 'is no clear rate to store, and G2 names that slot as the one double-root reading left');

      const N = RATING.N;
      const capOf = (call, q) =>
        ((ratingDetail([callEntry({ call, ok: true, qHat: q, skill: 'X', at: 1 })], N).ceiling
          - RATING.base) * N) / RATING.scale;
      /* the blocker in one line, and its repair: on material cleared 1 time in 10 the 85 lie is now
         priced BELOW the honest 50 it used to out-cap. */
      assert.ok(capOf(85, 0.1) < capOf(50, 0.1) - 1e-9,
        `the 85 lie at q̂ = 0.1 caps at ${capOf(85, 0.1).toFixed(4)} against the honest 50's `
        + `${capOf(50, 0.1).toFixed(4)} — F1 is open again and G2 publishes it closed`);
      assert.ok(/F1/.test(SPEC), 'the finding lost its label, so no later round can find its history');
      assert.ok(!/F1 — THE HOLE, PUBLISHED OPEN/.test(SPEC),
        'G2 still publishes F1 as an open hole while the scorer reads the slot\'s own q̂');
    });

    test('"monotonically in the rating" may not stand as an assertion anywhere', () => {
      const PHRASE = 'monotonically in the rating';
      for (const [i, line] of SPEC_LINES.entries()) {
        if (!line.toLowerCase().includes(PHRASE)) continue;
        const ok = quotesByDesign(line, i)
          || occurrences(line, new RegExp(PHRASE, 'i')).every((o) => retractedAt(line, o.idx, o.len));
        assert.ok(ok,
          `COMPOSED-GAME.md:${i + 1} asserts "rank helps ${PHRASE}". Since THE CAP the rank is a `
          + 'function of `min(rating, ceiling)`, so two windows with the SAME rating can hold '
          + 'different ranks and the sentence is false as written.');
      }
    });

    test('G9 #4\'s exception names the statistic the save actually stores in `bestRating`', () => {
      /* DERIVED, NOT TYPED. The document may not name a field of `ratingDetail` that the writers do
         not write. This arm reads the writers, insists they agree with each other, and then insists
         the document names the SAME one — so whichever way a later round takes it, the prose moves
         with the code instead of after it. (It bit within minutes of the state lane moving this
         field from `value` to `earned` mid-round; that is what it is for.) */
      const writers = [
        ['site/js/job/state.js', 2],                  // applyTarget + endJob
        ['site/js/screens/mock.js', 1],               // applyMockCall
      ];
      const fields = new Set();
      for (const [path, count] of writers) {
        const hits = [...read(path).matchAll(/bestRating = Math\.max\([\s\S]{0,120}?detail\.(\w+)\)/g)];
        assert.equal(hits.length, count,
          `${path} has ${hits.length} writer(s) of \`records.bestRating\` off a \`ratingDetail\`, not ${count} `
          + '— the audit record moved and G2 / G9 #4 name its writers explicitly');
        for (const h of hits) fields.add(h[1]);
      }
      assert.equal(fields.size, 1,
        `the writers of \`bestRating\` disagree: ${[...fields].join(' / ')}. G9 #4's exception is a `
        + 'single claim about a single field; it cannot be true of a field written two ways.');
      const [field] = [...fields];
      assert.ok(SPEC.includes(`store \`detail.${field}\``) || SPEC.includes(`high-water of \`detail.${field}\``),
        `every writer stores \`detail.${field}\` and the document does not say so. G9 #4 grants this `
        + 'layer ONE exception to "recomputable from the save", and it is only checkable while the '
        + 'document names the statistic the record actually holds.');
      /* and the identity the document publishes off that field really does hold: `rankFor` is
         monotone, so a high-water over `earned` is a high-water of the rank it buys. */
      const ladder = [0, 2.5, 4.99, 5, 6.4, 6.5, 7.69, 7.7, 8.89, 8.9, 10];
      for (let i = 1; i < ladder.length; i++) {
        assert.ok(rankFor(ladder[i]) >= rankFor(ladder[i - 1]),
          `rankFor is not monotone across ${ladder[i - 1]} → ${ladder[i]} — a high-water over the `
          + 'rating a rank was bought with is then NOT a high-water of the rank, and G9 #4\'s '
          + 'one-line recomputation is false');
      }
    });
  });

  describe('F · G3.8 · the four-condition domain is published WITH its reachability', () => {
    const pct = (s) => Math.round(Number(s) * 100);
    const poolBound = pct(capture(ALIGN_SRC, /all19\.all \/ all19\.boards <= ([\d.]+)/,
      'job-align §9 no longer bounds `domain.all` over the 19-make pool'));
    const briefBound = pct(capture(ALIGN_SRC, /board\.all \/ board\.boards <= ([\d.]+)/,
      'job-align §9 no longer bounds `domain.all` at the brief\'s own call'));

    test('G3.8 publishes the rate, at the bound the suite asserts', () => {
      assert.ok(SPEC.includes(`at most ${briefBound} %`),
        `G3.8 must publish "at most ${briefBound} %" — the bound \`tests/job-align.test.mjs\` §9 asserts `
        + 'at the brief\'s own call. Without it the theorem reads as a statement about an evening, '
        + 'which `crew.js alignmentFor`\'s own docstring says in writing is wrong.');
      assert.ok(SPEC.includes(`at most ${poolBound} %`),
        `G3.8 must publish "at most ${poolBound} %" — the bound asserted over the 19-make default pool`);
      assert.match(SPEC, /limit case and not a description of an evening/,
        'the document does not say, in its own voice, what `crew.js` says in its docstring');
    });

    test('and G9 #5 and G8\'s J4 row carry the same bound — one withdrawal, three sites', () => {
      const sites = SPEC_LINES.filter((l) => l.includes(`at most ${briefBound} %`) && l.includes('domain'));
      assert.ok(sites.length >= 2,
        `only ${sites.length} site(s) publish the reachability beside the domain. G3.8, G9 #5 and G8's `
        + 'J4 row all cite `alignmentFor().domain`, and the round-1 lesson was that one withdrawal '
        + 'edited at one site is not a withdrawal');
    });
  });

  describe('G · the mid-job-WALK claim, at the strength its arm asserts', () => {
    const overBound = Math.round(Number(capture(BOARD_SRC, /over\.length \/ cells\.length <= ([\d.]+)/,
      'job-board no longer bounds the five-of-five over-band share')) * 100);
    const medianBound = (Number(capture(BOARD_SRC, /q\(gaps, 0\.5\) <= ([\d.]+) \* SPLIT\.agreeWithinPoints/,
      'job-board no longer bounds the five-of-five median')) * SPLIT.agreeWithinPoints).toFixed(1);
    const worstBound = (Number(capture(BOARD_SRC, /gaps\.at\(-1\) <= ([\d.]+) \* SPLIT\.agreeWithinPoints/,
      'job-board no longer bounds the five-of-five tail')) * SPLIT.agreeWithinPoints).toFixed(1);

    test('the document publishes the DISTRIBUTION bounds the five-of-five arm actually asserts', () => {
      for (const [what, text] of [['over-band share', `at most ${overBound} % of cells over`],
        ['median', `median ≤ ${medianBound}`], ['tail', `worst ≤ ${worstBound}`]]) {
        assert.ok(SPEC.includes(text),
          `the document does not publish the ${what} bound as "${text}". At five of five `
          + '`tests/job-board.test.mjs` asserts a DISTRIBUTION, not the criterion per cell, so a '
          + 'sentence claiming the criterion there rests on an arm that tolerates its own falsification.');
      }
    });

    test('"five of five" may never stand unqualified', () => {
      const QUALIFIES = /unqualified|overstatement|withdrawn|distribution|replaces|superseded|\*\*Claimed/i;
      const PHRASES = ['up to five of five', 'up to five mid-job walks out of five'];
      for (const [i, line] of SPEC_LINES.entries()) {
        for (const phrase of PHRASES) {
          if (!line.includes(phrase)) continue;
          const ok = quotesByDesign(line, i)
            || occurrences(line, new RegExp(phrase)).every((o) =>
              QUALIFIES.test(line.slice(Math.max(0, o.idx - 200), o.idx + o.len + 400)));
          assert.ok(ok,
            `COMPOSED-GAME.md:${i + 1} claims "${phrase}" with nothing beside it. Measured over the `
            + `arm's own 200 cells per walk level, up to ${overBound} % sit outside `
            + `SPLIT.agreeWithinPoints = ${SPLIT.agreeWithinPoints} at that level (SPEC-CORRECTIONS A-3).`);
        }
      }
    });

    test('and the arm\'s NAME says which register it asserts where', () => {
      const name = capture(BOARD_SRC, /test\('(THE CRITERION survives a history of mid-job walks[^']*)'/,
        'the walk arm was renamed past the substring `board.js` and two lane notes cite');
      assert.match(name, /three of five/i,
        `the arm is named "${name}" — at five of five it asserts a distribution, not the criterion, `
        + 'so a name that certifies the criterion at every level certifies a claim its own numbers refute');
      assert.match(name, /distribution/i, `the arm's name does not name its second register: "${name}"`);
    });
  });

  describe('H · G6\'s phone paragraph · the sheet is capped and in normal flow', () => {
    /** the rules whose subject is `.job-board`, in source order */
    const boardRules = [...JOB_CSS.matchAll(/\.job-board\s*\{([^}]*)\}/g)].map((m) => ({ at: m.index, body: m[1] }));

    test('the document publishes the cap `css/job.css` declares, verbatim', () => {
      const decl = capture(JOB_CSS, /(max-block-size:\s*min\(var\(--job-board-sheet\)[^;]*)/,
        'the board sheet is no longer capped by a `min()` on `--job-board-sheet`');
      const tidy = decl.replace(/\s+/g, ' ').trim();
      assert.ok(SPEC.includes(tidy),
        `G6 must publish the shipped cap \`${tidy}\`. It published "Board sheet 264 px" for four `
        + 'rounds, and 264 px is only the FIRST of three terms.');
      assert.ok(!/Board sheet 264 px sticky/.test(SPEC.split('\n').filter((l, i) => !isChangelogClaim(l)).join('\n')),
        'G6 is publishing "Board sheet 264 px sticky" again — both halves are false on the 375 px '
        + 'phone the paragraph names as load-bearing');
    });

    test('the two derived numerals follow from the shipped terms, and the document prints them', () => {
      const dvh = Number(capture(JOB_CSS, /min\(var\(--job-board-sheet\),\s*(\d+(?:\.\d+)?)dvh/,
        'the `dvh` term of the sheet cap is gone')) / 100;
      const sheet = Number(capture(JOB_CSS, /--job-board-sheet:\s*(\d+)px/, 'the sheet constant is gone'));
      assert.equal(sheet, LAYOUT.boardSheetPx, 'the stylesheet and `LAYOUT` disagree about the sheet');
      const atPhone = Math.round(dvh * 667);               // the 375x667 phone G6 names
      const unlocks = Math.round(sheet / dvh);             // the height at which 264 becomes reachable
      assert.ok(atPhone < sheet, 'the `dvh` term no longer binds at 375x667 — the paragraph must be re-measured');
      assert.ok(SPEC.includes(`${atPhone} px`),
        `G6 must publish the ${atPhone} px the cap actually allows at 375x667, not the ${sheet} px constant`);
      assert.ok(SPEC.includes(`${unlocks} px`),
        `G6 must publish that ${sheet} px needs about ${unlocks} px of viewport height to be reachable`);
    });

    test('`position: sticky` is on `.job-board` ONLY in the desktop rail, and the document says so', () => {
      const rail = JOB_CSS.indexOf('@container jobscreen (min-width: 896px)');
      assert.ok(rail > 0, 'the desktop rail container query is gone — the sticky claim cannot be scoped');
      const sticky = boardRules.filter((r) => /position:\s*sticky/.test(r.body));
      assert.equal(sticky.length, 1,
        `\`position: sticky\` is on \`.job-board\` in ${sticky.length} rules. G6 publishes the narrow `
        + 'form as NOT sticky, and `job.css` argues a sticky grid item cannot leave its own grid area.');
      assert.ok(sticky[0].at > rail,
        'the one sticky `.job-board` rule is OUTSIDE the desktop rail query — either the phone sheet '
        + 'is sticky now (and G6 is right after all) or the rail moved');
      assert.match(SPEC, /in normal flow — not sticky|not sticky \(a sticky grid item/,
        'G6 no longer states that the phone sheet is in normal flow');
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   VERIFY ROUND 3 — A PUBLISHED NUMERAL MAY NOT OUTLIVE THE EVIDENCE IT CITES.   (meta lane)

   Round 1 caught a claim the document WITHDREW and went on asserting. Round 2 caught claims the
   CODE moved past and the document went on publishing. Round 3 caught the next layer down: three
   claims whose own cited evidence — a script the document names, a sweep a test already runs, a
   function whose docblock argues the opposite — contradicts them, with nothing in
   `node --test tests/` standing between the two. Two of the three were written by the round-2 and
   round-3 REPAIRS themselves, which is the point: a correction that is not executable is just a
   newer sentence.

   Each arm below RUNS the evidence and reads the document's numerals back out of the paragraph.
   No numeral is typed twice: every expected value is computed from the shipped machine.

     11 · §3.7 proof 11 / G9 #8 / G12 #64 — "a bagged … job writes none".  BAG IS NOT A TERMINAL
          STATE, so that sentence is false for the majority of real jobs, and false in the direction
          that invites a gate on `bagged` which would drop the page record, the forecast point and
          the daily-goal check.                                     (verify-3 ledger-invariance)
     12 · §3.7 proof 8 / G9 #6 / G11 / G12 VR2-FARM — the +11.6 % / +5.6 % pair and the 4.6×
          multiple, against `node notes/repair-meta-evidence.mjs`, the document's ONLY cited
          evidence, which prints a different pair.                        (verify-3 test-integrity)
     13 · G1 statement 2 — "each job's ratio dropped from both sums", against `board.js add()`,
          which clamps and drops nothing.                                (verify-3 split-honesty)
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from 'node:child_process';

describe('meta · verify round 3: a published numeral may not outlive the evidence it cites', () => {

  describe('11 · BAG is not a terminal state, and proof 11 may not say it is', () => {
    /**
     * Plays a whole job the way `screens/job.js` plays one (the driver in
     * `tests/run-lane-r2.test.mjs`), with ONE difference: `bag()` wherever that driver pushes. If
     * BAG were terminal the job would end at the first beat; it is not, so the job runs to the
     * getaway, cracks, and completes.
     */
    const playAllBagged = async (seedDays) => {
      const state = await import('../site/js/job/state.js');
      const { fresh } = await import('../site/js/store.js');
      const { todayISO, addDays } = await import('../site/js/days.js');
      const { byId: cardById } = await import('../site/data/cards.js');
      const { captureJobBefore, jobSummaryContext } = await import('../site/js/screens/run.js');

      const NOW = new Date(2026, 8, 16, 18, 0).getTime();
      const TODAY = todayISO(new Date(NOW));
      const CLEAN = { cleared: true, firstTry: true, hints: 0, attempt: 1, elapsedMs: 9000, xp: 40 };

      const save = fresh(NOW - seedDays * 86400000);
      save.settings.testDate = addDays(TODAY, 8);
      let t = NOW;
      state.startJob(save, { today: TODAY, now: t });
      const before = captureJobBefore(state.unguard(save), state.queueOf(save));
      let live = state.queueOf(save).slice();
      state.beginTargets(save, { now: (t += 6000) });
      let debrief = null; let bags = 0;
      for (let i = 0; i < 400; i++) {
        const g = state.stateOf(save);
        if (!g || g.outcome != null) break;
        live = state.queueOf(save).slice();
        if (g.phase === 'envelope') { state.lockCall(save, 70, { now: (t += 5000) }); continue; }
        if (g.phase === 'answer') {
          const it = state.currentItem(save);
          state.applyTarget(save, { ...CLEAN, id: it.id }, { now: (t += 40000), cards: cardById });
          continue;
        }
        if (g.phase === 'payout' || g.phase === 'bagpush') {
          if (state.targetsLeft(save) === 0) {
            debrief = state.endJob(save, state.OUTCOMES.COMPLETED, { now: (t += 1000), day: TODAY });
            break;
          }
          const r = state.bag(save, { now: (t += 9000) });          // ← BAG, never PUSH
          bags++;
          if (r?.debrief) { debrief = r.debrief; break; }           // (it never does: see below)
          continue;
        }
        if (g.phase === 'brief') { state.brief(save, {}, { now: (t += 20000) }); continue; }
        if (g.phase === 'getaway') { debrief = state.crack(save, { now: (t += 25000) }); continue; }
        break;
      }
      const runs0 = (save.runs ?? []).length;
      const fc0 = Object.keys(save.forecastLog ?? {}).length;
      jobSummaryContext(save, debrief, { queue: live, before });     // ← `renderDebrief`'s one call
      return {
        bags, debrief, save, runs0, fc0,
        runs1: (save.runs ?? []).length,
        fc1: Object.keys(save.forecastLog ?? {}).length,
        row: (save.runs ?? [])[(save.runs ?? []).length - 1] ?? null,
      };
    };

    test('`OUTCOMES` has no BAGGED word, and `bag()` ends in the same `advance()` `push()` does', async () => {
      const { OUTCOMES } = await import('../site/js/job/state.js');
      const words = Object.values(OUTCOMES).map(String);
      assert.ok(!words.some((w) => /bag/i.test(w)),
        `\`OUTCOMES\` now contains a BAG word (${words.join(', ')}). If BAG has become terminal, `
        + '§3.7 proof 11, G9 #8 and G12 #64 have to be re-measured and re-stated — they currently '
        + 'publish the opposite, on this test\'s evidence.');
      const SRC = read('site/js/job/state.js');
      const bagFn = /export function bag\(save[\s\S]*?\n}/.exec(SRC);
      assert.ok(bagFn, '`state.bag` is gone — proof 11\'s BAG sentence cannot be checked');
      assert.match(bagFn[0], /advance\(s, g,/,
        '`bag()` no longer ends in `advance()`. That call is the whole reason BAG is not terminal: '
        + 'it closes the job only at `left === 0`, exactly as `push()` does.');
    });

    test('a job BAGGED AT EVERY BEAT completes, and writes the row, the forecast point and the goal check', async () => {
      for (const seedDays of [3, 5, 7]) {
        const r = await playAllBagged(seedDays);
        const where = `save ${seedDays}: bags=${r.bags} outcome=${r.debrief?.outcome} complete=${r.debrief?.complete}`;
        assert.ok(r.bags >= 5, `${where} — the driver never reached five bag beats, so this arm proved nothing`);
        assert.equal(r.debrief?.complete, true,
          `${where} — BAG has become terminal. Every sentence in §3.7 proof 11, G9 #8 and G12 #64 `
          + 'about what a bagged job writes has to be re-measured.');
        assert.equal(r.runs1, r.runs0 + 1, `${where} — no \`runs[]\` row for a COMPLETED job`);
        assert.equal(r.fc1, r.fc0 + 1, `${where} — no forecast point for a COMPLETED job`);
        assert.equal(r.row?.kind, 'page', `${where} — the row a bagged job wrote is not a page row`);
      }
    });

    test('the document names the real condition — NOT COMPLETE — and never "bagged"', () => {
      for (const re of [/bagged,? (?:quit|or quit|or walked)[^.]{0,80}writes none/i,
        /a bagged[^.]{0,60}job writes none/i]) {
        assert.ok(!re.test(SPEC),
          `the document publishes "a bagged … job writes none" (${re}). It is false: a job bagged at `
          + 'every beat and played to the end is `complete`, and `commitJobRun`\'s only gate is '
          + '`debrief.complete !== true`. SPEC-CORRECTIONS V3-4.');
      }
      assert.match(SPEC, /BAG is not a terminal state/,
        '§3.7 proof 11 no longer states the fact that makes the corrected sentence readable');
      const proof11 = SPEC.split('\n').find((l) => l.includes('**(11) Risk of ruin.**'));
      assert.ok(proof11, '§3.7 proof 11 is gone');
      assert.match(proof11, /a job that is \*\*not complete\*\*/,
        'proof 11 no longer names the actual condition for writing nothing');
      assert.match(proof11, /debrief\.complete !== true|commitJobRun/,
        'proof 11 no longer names the gate, which is the only thing a later ticket may implement');
    });
  });

  describe('12 · VR2-FARM — the magnitudes are the cited script\'s, re-run here', () => {
    /** `node notes/repair-meta-evidence.mjs` — the ONLY reproduction COMPOSED-GAME.md offers for
     *  VR2-FARM, named twice in the document and deliberately outside this suite for one round
     *  ("48 simulated jobs"). It is seeded and takes about a second, so there was never a reason
     *  for the gap; four published sites drifted away from it while it was open. */
    const evidence = () => {
      const run = spawnSync(process.execPath, ['notes/repair-meta-evidence.mjs'],
        { cwd: ROOT, timeout: 300_000, encoding: 'utf8' });
      assert.equal(run.status, 0,
        `notes/repair-meta-evidence.mjs failed — the document's only VR2-FARM evidence does not run\n`
        + `${run.stdout}\n${run.stderr}`);
      return run.stdout;
    };
    const pct = (out, label) => {
      const m = new RegExp(`${label}\\s+[\\d\\s]+→\\s*[\\d\\s]+=\\s*(-?[\\d.]+)%`).exec(out);
      assert.ok(m, `the script no longer prints its \`${label} … = X%\` summary line:\n${out}`);
      return +m[1];
    };

    test('the script still reproduces the QUALITATIVE claims the document makes', () => {
      const out = evidence();
      const master = [...out.matchAll(/MASTER rank=(\d+)/g)].map((m) => +m[1]);
      const sand = [...out.matchAll(/SANDBAG rank=(\d+)/g)].map((m) => +m[1]);
      assert.equal(master.length, 8, `the §1 arm no longer runs 8 seeds:\n${out}`);
      assert.deepEqual(sand.length, 8, `the §1 arm no longer runs 8 seeds:\n${out}`);
      assert.ok(master.every((r) => r === 2),
        `the honest master is no longer Called 2 on 8/8 (${master.join(',')}) — G9 #6 and G12 `
        + 'VR2-FARM publish that it is');
      assert.ok(sand.every((r) => r === 4),
        `the sandbagger is no longer Called 4 on 8/8 (${sand.join(',')}) — the whole exploit`);
      assert.equal((out.match(/study ledger identical: true/g) ?? []).length, 8,
        `the study ledger is no longer byte-identical on 8/8 — that is Ledger A leaking:\n${out}`);
      assert.match(out, /sandbag wins BOTH currencies on 6\/8/,
        `the document publishes "both currencies on 6 of 8"; the script no longer prints it:\n${out}`);
    });

    test('and the document publishes the pair the script PRINTS, at every site', () => {
      const out = evidence();
      const post = pct(out, 'POST-CLIMB');
      const total = pct(out, 'TOTAL loot');

      const postSites = [...SPEC.matchAll(/\+([\d.]+) % post-climb loot/g)].map((m) => +m[1]);
      const overSites = [...SPEC.matchAll(/\(\+([\d.]+) % overall\)/g)].map((m) => +m[1]);
      assert.ok(postSites.length >= 4,
        `VR2-FARM's post-climb figure is published at ${postSites.length} sites; it was at four `
        + '(proof 8, G9 #6, G11, G12). If a site was removed, remove it from this count too.');
      assert.ok(overSites.length >= 2, 'VR2-FARM\'s overall figure is no longer published at both sites');
      for (const v of postSites) {
        assert.equal(v, +post.toFixed(2),
          `the document publishes +${v} % post-climb loot; \`notes/repair-meta-evidence.mjs\` — the `
          + `only evidence the document cites for it — prints ${post.toFixed(2)} %. Re-run it and `
          + 're-state all four sites (SPEC-CORRECTIONS V3-1).');
      }
      for (const v of overSites) {
        assert.equal(v, +total.toFixed(2),
          `the document publishes +${v} % overall; the script prints ${total.toFixed(2)} %.`);
      }

      /* and the DERIVED sentence, which is false with a stale numerator: the published residual is
         "at most 2.5 % overall", so the multiple is the measured figure over 2.5 — on each basis. */
      const BOUND = 2.5;
      assert.ok(SPEC.includes('at most **2.5 %** overall') || SPEC.includes('"at most **2.5 %** overall"'),
        'the 2.5 % residual bound is no longer quoted, so the multiple below has no denominator');
      const want = new Set([+(total / BOUND).toFixed(2), +(post / BOUND).toFixed(2)]);
      const got = new Set([...SPEC.matchAll(/([\d.]+)×\*{0,2} too small/g)].map((m) => +m[1]));
      assert.deepEqual(got, want,
        `the document says the 2.5 % bound is ${[...got].join('× / ')}× too small; measured, it is `
        + `${(total / BOUND).toFixed(2)}× on the overall basis and ${(post / BOUND).toFixed(2)}× on `
        + 'the post-climb basis. This is the sentence that priced the exploit.');
      assert.ok(!/is \*\*4\.6× too small\*\*/.test(SPEC),
        'the 4.6× multiple is back: it was derived from a post-climb percentage against an OVERALL '
        + 'bound, and from a percentage the script no longer prints');
    });
  });

  describe('13 · G1 statement 2 — an outlier is CLAMPED into the window, not dropped from it', () => {
    test('`board.js add()` pools a clamped ratio and drops nothing', async () => {
      const BOARD = read('site/js/job/board.js');
      const add = /const add = \(acc, meas, exp\) => \{[\s\S]*?\n  \};/.exec(BOARD);
      assert.ok(add, '`personalRates`\' `add` is gone — G1 statement 2 (a) describes it by name');
      /* Deliberately tolerant of HOW the ratio reaches `clampRate` — the board lane added an
         out-of-band counter (`acc.lo` / `acc.hi`) to this function while verify round 3 was open,
         and a lint that pinned the expression `clampRate(meas / exp)` went red on a change that
         kept the behaviour exactly. What must hold is the two facts G1 statement 2 (a) publishes:
         the pooled term is CLAMPED, and there is exactly ONE early return — the zero guard. A
         second return is how the ratio gets dropped, and dropping is the round-1 BLOCKER. */
      assert.match(add[0], /acc\.meas \+= exp \* clampRate\(/,
        '`add` no longer pools a CLAMPED ratio. If it drops out-of-band ratios again, the round-1 '
        + 'verification BLOCKER is back (a flat clock emptied the window and the board printed the '
        + 'shipped table under the words `your last 5 jobs`), and G1 statement 2 has to be '
        + 're-stated a third time.');
      assert.equal((add[0].match(/\breturn\b/g) ?? []).length, 1,
        `\`add\` now has ${(add[0].match(/\breturn\b/g) ?? []).length} returns, not just the zero `
        + 'guard. A second one skips an observation instead of bounding it — that IS the dropping '
        + `behaviour G1 statement 2 must then publish again:\n${add[0]}`);
      assert.match(add[0], /acc\.n\+\+/, '`add` no longer counts the observation it pooled');
    });

    test('measured through `postBoard`: five jobs on record stay five at every clock', async () => {
      const { postBoard, RATE_CLAMP } = await import('../site/js/job/board.js');
      const { fresh } = await import('../site/js/store.js');
      const { todayISO, addDays } = await import('../site/js/days.js');
      const NOW = new Date(2026, 8, 16, 18, 0).getTime();
      const TODAY = todayISO(new Date(NOW));
      for (const secPerStem of [20, 10, 6, 2]) {
        const s = fresh(NOW - 5 * 86400000);
        s.settings.testDate = addDays(TODAY, 8);
        s.game = { ...(s.game ?? {}) };
        s.game.log = Array.from({ length: 5 }, (_, i) => ({
          day: addDays(TODAY, -(5 - i)), shape: 'JOB', targets: 10, bagged: 400, posted: 500,
          rating: 5, guard: null, cracked: true, tGame: 300, tAnswer: Math.round(secPerStem * 10),
        }));
        const r = postBoard(s, TODAY, { now: NOW }).projectionRates ?? {};
        assert.equal(r.n?.answer, 5,
          `at ${secPerStem} s/stem only ${r.n?.answer} of 5 jobs stayed in the answer window — the `
          + 'ratio is being DROPPED again, which is the behaviour G1 statement 2 published for two '
          + 'rounds after the code stopped doing it (SPEC-CORRECTIONS V3-3)');
        assert.ok(r.answer >= RATE_CLAMP.min - 1e-12 && r.answer <= RATE_CLAMP.max + 1e-12,
          `the pooled answer rate ${r.answer} left [${RATE_CLAMP.min}, ${RATE_CLAMP.max}]`);
      }
      const floor = RATE_CLAMP.min.toFixed(3);
      assert.ok(SPEC.includes(`\`RATE_MIN\` = ${floor}`),
        `G1 statement 2 must publish the clamp floor the code ships (${floor}), since that is the `
        + 'number a clamped outlier is pinned at');
    });

    test('and G1 statement 2 no longer publishes the estimator the repair removed', () => {
      assert.ok(!/dropped from both sums/.test(SPEC),
        'G1 statement 2 (a) publishes "each job\'s ratio dropped from both sums" in the present '
        + 'tense, as one of the "two things [that] now close it". `board.js add()` clamps and drops '
        + 'nothing, and its own docblock titles the change "AN OUTLIER IS BOUNDED, NOT DELETED".');
      assert.match(SPEC, /clamped into `\[RATE_MIN, RATE_MAX\]`/,
        'G1 statement 2 (a) no longer states what `add()` actually does with an out-of-band ratio');
      assert.match(SPEC, /an outlier is BOUNDED, not deleted/i,
        'the correction does not name the failure it replaced, so the next round cannot tell which '
        + 'of the two estimators this paragraph is describing');
    });
  });
});
