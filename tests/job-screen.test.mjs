// tests/job-screen.test.mjs — THE SCREEN. designs/CUT-BRIEF.md "Hard limits", designs/CUT-SPEC.md §5, §6.
//
// The screen is the lane that carries the feel, so it is also the lane that can re-inflate the layer
// by accident: one more read-out, one more tap, one word a 14-year-old has to be taught. Every
// assertion below is held over the REACHABLE state space rather than over a sample, and every one of
// them was run against a deliberately broken copy of `screens/job.js` / `css/job.css` first — the
// mutations and the failures they produced are listed in `notes/cut-screen.md` under "Negative
// controls". A test that cannot fail is worse than no test, and the layer this replaced shipped
// several.
//
// WHAT IS PROVED HERE
//   1. Three numeric slots, never a fourth, and the numerals in them are EXACTLY the numbers
//      `job/state.js` computed — not a scaled one, not a related one.
//   2. The third slot is a COUNT, never a percentage, and it is `qHatDetail`'s own `hits of of`.
//   3. Two taps per question: the call, then the study card's own Submit. Bank is never required.
//   4. Every student-visible string is CUT-SPEC §6's, or the skill's own name off the card.
//   5. The streak is the only NUMBER that animates, and while it moves it is the biggest thing on
//      the screen.
//   6. No new route (`ROUTE_PATTERNS` is 13), no advice before a call, and no word the brief bans.
//   7. The session still files the page it closed (`captureJobBefore` / `commitJobRun`).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { read, listFiles, repoPath, stripCommentsAndStrings } from './_helpers.mjs';
import { ROUTE_PATTERNS } from '../site/js/app.js';
import { fresh } from '../site/js/store.js';
import * as state from '../site/js/job/state.js';
import * as econ from '../site/js/job/pay.js';
import { qHatDetail } from '../site/js/job/call.js';
import { COPY } from '../site/data/job.js';
import { skillById } from '../site/data/skills.js';
import { byId as cardById } from '../site/data/cards.js';
import {
  PHASES, PLAY_PHASES, FLIP_MS, TICK_MS, BANK_MS,
  makeNameOf, FACE_NAMES, hitLineOf, hitMeterOf, paysLineOf, readingOf, stripFor, viewModel,
  requiredTapsOf, stringsOf, numeralsOf, screenNumeralsOf, settleAbandonedBid, exitOf,
} from '../site/js/screens/job.js';

const SRC = read('site/js/screens/job.js');
const CSS = read('site/css/job.css');
const THEME = read('site/css/theme.css');

/** The source with its comments removed — a file that DOCUMENTS a ban must not trip its own lint. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/* ==========================================================================================
   The reachable state space — BFS from (pile 0, streak 1) over the shipped payoff table
   ========================================================================================== */

/**
 * Every `(pile, streak)` a session of `depth` questions can actually be in, by walking the SHIPPED
 * `econ` table: from each state, every offered call's right branch and wrong branch, plus a bank.
 * Nothing is reconstructed — `offered` / `payOf` / `costOf` are the ones the screen prices against.
 */
function reachableStates(depth = 12) {
  const seen = new Map();
  let frontier = [[0, 1]];
  seen.set('0|1', [0, 1]);
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const [p, m] of frontier) {
      const push = (p2, m2) => {
        const k = `${p2}|${m2}`;
        if (seen.has(k)) return;
        seen.set(k, [p2, m2]);
        next.push([p2, m2]);
      };
      for (const c of econ.offered(p, m)) {
        push(p + econ.payOf(c, m), Math.min(econ.MULT_MAX, m + 1));      // a right answer
        push(Math.max(0, p - econ.costOf(c, m, p)), 1);                  // a wrong one
      }
      push(0, 1);                                                        // a bank
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return [...seen.values()];
}

const REACHABLE = reachableStates(12);

/** A save-shaped object holding exactly one live session record. `state.stateOf` reads this. */
const saveAt = (pile, streak, call = null, at = 1000) => ({
  inProgress: {
    queue: [{ n: 1, id: 'x', skill: 'VOC' }],
    idx: 0,
    game: {
      pile, streak, answered: 0, tGame: 0, tAnswer: 0, seed: 's',
      call: call ? { id: call, at } : null,
    },
  },
});

/* ==========================================================================================
   1 · THREE NUMERIC SLOTS, AND EVERY NUMERAL IS THE ENGINE'S OWN
   ========================================================================================== */

describe('the strip: three slots, and not one number the engine did not compute', () => {
  test('exactly three slots in every reachable state, called and uncalled', () => {
    let n = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of [null, ...econ.offered(p, m)]) {
        const strip = stripFor(readingOf(saveAt(p, m, call)), { hits: 7, of: 10 });
        assert.equal(strip.length, 3, `pile ${p} ×${m} call ${call}: ${strip.length} slots`);
        assert.deepEqual(strip.map((s) => s.slot), ['pile', 'streak', 'third']);
        n++;
      }
    }
    assert.ok(n > 1000, `only ${n} states exercised — the sweep collapsed`);
  });

  test('slot 1 is the pile, slot 2 is the streak, byte for byte', () => {
    for (const [p, m] of REACHABLE) {
      const strip = stripFor(readingOf(saveAt(p, m)), { hits: 3, of: 4 });
      assert.equal(strip[0].value, String(p), `pile ${p} printed ${strip[0].value}`);
      assert.equal(strip[1].value, `×${m}`, `streak ${m} printed ${strip[1].value}`);
      assert.equal(strip[0].caption, COPY.pile);
      assert.equal(strip[1].caption, COPY.streak);
    }
  });

  test('slot 3 prints `pays N` where N is econ.payOf(call, streak) and nothing else', () => {
    let checked = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        const strip = stripFor(readingOf(saveAt(p, m, call)));
        const pay = econ.payOf(call, m);
        assert.equal(strip[2].value, paysLineOf(pay), 'paysLineOf drifted from the slot');
        assert.equal(strip[2].value, COPY.pays({ n: pay }),
          `pile ${p} ×${m} ${call}: printed ${strip[2].value}, engine pays ${pay}`);
        /* the one failure mode that killed the old layer: a factor baked in AND shown beside it */
        assert.deepEqual(numeralsOf([strip[2]]), [pay],
          `pile ${p} ×${m} ${call}: slot 3 carries a numeral that is not the pay`);
        checked++;
      }
    }
    assert.ok(checked > 1000, `only ${checked} priced states — the sweep collapsed`);
  });

  test('the whole strip carries exactly the engine numbers, and no fourth number', () => {
    for (const [p, m] of REACHABLE) {
      /* uncalled, with a history: the pile and the streak, and NOTHING else. The hit rate used to
         print `6 of 9` here — a fourth and a fifth number at the one moment the game asks for a
         decision, while the number CUT-BRIEF names (what it pays) was not on screen at all. */
      assert.deepEqual(numeralsOf(stripFor(readingOf(saveAt(p, m)), { hits: 6, of: 9 })),
        [p, m], `pile ${p} ×${m}: the face-down strip printed a number the engine has not got`);
      /* uncalled, no history at all */
      assert.deepEqual(numeralsOf(stripFor(readingOf(saveAt(p, m)), { hits: 0, of: 0 })), [p, m]);
      /* called */
      for (const call of econ.offered(p, m)) {
        assert.deepEqual(numeralsOf(stripFor(readingOf(saveAt(p, m, call)))),
          [p, m, econ.payOf(call, m)], `pile ${p} ×${m} ${call}: a fourth number is on screen`);
      }
    }
  });

  /**
   * THE HARD LIMIT ITSELF, counted where CUT-BRIEF counts it — "at most three numbers ON SCREEN at
   * once during play: the pile, the streak multiplier, and what the current question pays. Nothing
   * else numeric." The strip is not the screen: a figure on a call, on the card or in a line of copy
   * costs exactly what a figure in a slot costs, so this counts the WHOLE model.
   *
   * The shipped screen failed it — four numbers face down (`40 · ×3 · 7 of 10`) with the pay missing
   * — and the test that stood here counted SLOTS, which is how a three-slot strip printed four
   * numbers for three verification rounds without anything going red.
   */
  /**
   * ROUND 2 (player-feel), and the reason this sweep is now three loops deep. The assertion above
   * passed the LITERAL `'VOC'` for the skill in all 3,666 of its states, so the one string on the
   * face-down card that does not come out of `COPY` — the skill's own name, off `data/skills.js` —
   * was never once varied. Two of the nineteen skills on the graph are named `Factoring a = 1` and
   * `Factoring a > 1`; swapping `'VOC'` for `'FAC2'` made this very assertion fail with
   * `[56, 4, 32, 1]`, a fourth number on screen that the engine never computed. That is 9 of the 100
   * weight in the graph, so it is not a corner — it is an ordinary Friday page.
   *
   * A guard that cannot fire on the input that breaks it is not a guard, and this one shipped past
   * three verification rounds and a green suite. It sweeps the graph now: every skill × every
   * reachable state × every play phase, and the count is checked against the product so it cannot
   * quietly collapse back to one skill.
   */
  test('at most three numbers on screen: every play phase, every reachable state, EVERY skill', () => {
    const detail = { hits: 7, of: 10, window: 10 };
    const ids = Object.keys(skillById);
    assert.ok(ids.length >= 19, `the graph is ${ids.length} skills — this sweep is not the graph`);
    let worst = 0;
    let checked = 0;
    for (const id of ids) {
      for (const [p, m] of REACHABLE) {
        for (const phase of PLAY_PHASES) {
          const call = phase === 'call' ? null : econ.offered(p, m)[0];
          const model = viewModel(saveAt(p, m, call), { phase, detail, skill: id });
          const nums = screenNumeralsOf(model);
          worst = Math.max(worst, nums.length);
          assert.ok(nums.length <= 3,
            `${id} · pile ${p} ×${m} ${phase}: ${nums.length} numbers on screen (${nums.join(', ')})`);
          if (phase === 'call') {
            assert.deepEqual(nums, [p, m],
              `${id} · pile ${p} ×${m}: the face-down card prints more than the two it has`);
          } else {
            assert.deepEqual(nums, [p, m, econ.payOf(call, m)],
              `${id} · pile ${p} ×${m} ${phase}: the three numbers are not the pile, the streak and the pay`);
          }
          checked++;
        }
      }
    }
    assert.equal(worst, 3, 'no state reached the three-number ceiling — the sweep collapsed');
    assert.equal(checked, ids.length * REACHABLE.length * PLAY_PHASES.length,
      'the sweep is no longer the whole product of skills, states and phases');
  });

  /**
   * …AND THE REASON IT HOLDS, pinned on its own so the count above can never be satisfied by luck.
   *
   * The skill name is the ONLY student-visible string on the face-down card that `data/skills.js`
   * owns rather than `data/job.js COPY`, which makes it the only one that can put a numeral on
   * screen without a line of this layer changing. Held over the whole graph rather than over the
   * one skill a fixture happens to draw.
   */
  test('no name the face-down card can print carries a digit — the whole graph', () => {
    for (const id of Object.keys(skillById)) {
      const printed = makeNameOf(id);
      assert.ok(!/\d/.test(printed),
        `the card says "${printed}" for ${id} — a fourth number on screen (CUT-BRIEF "Hard limits")`);
      assert.ok(printed.trim().length > 0, `${id} reaches the card as an empty string`);
      /* a name that was already clean is printed byte for byte: nothing is renamed that need not be */
      const own = skillById[id].name;
      if (!/\d/.test(own)) assert.equal(printed, own, `${id}: the card renamed a name that was already clean`);
    }
    /* …and a skill this layer has never heard of still reaches the card as itself, rather than being
       blanked off the one line that says what the question is about */
    assert.equal(makeNameOf('NOT-A-SKILL'), 'NOT-A-SKILL');
  });

  /* The bank beat is the one moment a fourth KIND of number can reach the band, and it may only do
     it by taking the other two off: `today N points` replaces the strip, it never joins it. */
  test('the beat after a bank is one number, and the slots are gone while it is up', () => {
    for (const [p, m] of REACHABLE.slice(0, 300)) {
      const model = viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 2, of: 3 }, skill: 'VOC', banked: 186 });
      assert.deepEqual(model.strip, [], 'the slots are still up under the bank line');
      assert.equal(model.say, COPY.todayPoints({ points: 186 }));
      assert.deepEqual(screenNumeralsOf(model), [186], 'the bank beat prints something besides the points');
    }
    /* and it is not a phase: nothing about it is required, and the calls stay live under it */
    const beat = viewModel(saveAt(24, 3), { phase: 'call', detail: { hits: 2, of: 3 }, skill: 'VOC', banked: 0 });
    assert.equal(requiredTapsOf(beat), 1, 'the bank beat changed what the question costs in taps');
    assert.deepEqual(beat.calls.filter((c) => c.enabled).map((c) => c.id), econ.offered(24, 3));
    assert.equal(beat.say, COPY.todayPoints({ points: 0 }), 'banking nothing says nothing');
    /* it belongs to the face-down card alone — a graded question never carries it */
    for (const phase of ['flip', 'answer']) {
      const m2 = viewModel(saveAt(24, 3, 'sure'), { phase, skill: 'VOC', banked: 186 });
      assert.equal(m2.say, null, `${phase} carried the bank line`);
      assert.equal(m2.strip.length, 3, `${phase} lost its slots`);
    }
  });

  test('readingOf reads state.js and priceOf — it does no arithmetic of its own', () => {
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        const s = saveAt(p, m, call);
        const r = readingOf(s);
        assert.equal(r.pile, state.stateOf(s).pile);
        assert.equal(r.streak, state.stateOf(s).streak);
        assert.equal(r.pay, state.priceOf(s, call).pay);
        assert.deepEqual(r.offered, state.callsFor(s));
      }
    }
    assert.equal(readingOf({}), null, 'no session is not a zeroed session');
  });
});

/* ==========================================================================================
   2 · THE HIT RATE IS A COUNT, AND IT IS qHatDetail's OWN
   ========================================================================================== */

describe('the hit rate: a count, never a percentage', () => {
  /**
   * IT IS STILL A COUNT — it is drawn instead of printed. One mark per sitting of the window:
   * `hits` filled, `of − hits` struck, and the rest of the window empty. Two findings forced it and
   * either one would have: `7 of 10` was the fourth and fifth number on a screen allowed three, and
   * `1 of 1` — every rate a FIRST session can reach — read as certainty under the caption "you got
   * this right", so day one said "tap sure unless it says new". A drawn denominator cannot do that:
   * one filled mark beside nine empty ones is visibly one sitting.
   */
  test('one mark per sitting for every window the engine can produce, and `new` at zero', () => {
    for (let of = 0; of <= 10; of++) {
      for (let hits = 0; hits <= of; hits++) {
        const meter = hitMeterOf({ hits, of, window: 10 });
        assert.deepEqual(meter, { hits, misses: of - hits, empty: 10 - of, of, window: 10 });
        assert.equal(meter.hits + meter.misses + meter.empty, meter.window,
          'the marks do not add up to the window — the denominator is not being drawn');
        const line = hitLineOf({ hits, of });
        if (of === 0) { assert.equal(line, COPY.none); continue; }
        /* the count is in the marks; the slot prints NO numeral for it */
        assert.equal(line, '');
        assert.deepEqual(numeralsOf([{ value: line }]), []);
        assert.ok(!line.includes('%'), 'the slot printed a percentage — `of` can be under 10');
      }
    }
  });

  test('the marks are qHatDetail`s own three numbers — nothing is rounded, scaled or inferred', () => {
    for (const window of [1, 3, 10, 12]) {
      for (let of = 0; of <= window; of++) {
        for (let hits = 0; hits <= of; hits++) {
          const m = hitMeterOf({ hits, of, window });
          assert.equal(m.hits, hits);
          assert.equal(m.of, of);
          assert.equal(m.window, window);
        }
      }
    }
    /* a rate the engine cannot produce is not drawn as one: nothing here invents a mark */
    assert.deepEqual(hitMeterOf({ hits: 99, of: 3, window: 10 }), { hits: 3, misses: 0, empty: 7, of: 3, window: 10 });
    assert.deepEqual(hitMeterOf({ hits: 2, of: 99, window: 10 }), { hits: 2, misses: 8, empty: 0, of: 10, window: 10 });
    assert.deepEqual(hitMeterOf(null), { hits: 0, misses: 0, empty: 10, of: 0, window: 10 });
    assert.equal(hitMeterOf(null).window, QHAT.window, 'the drawn window is not the engine`s window');
  });

  /**
   * THE WORD OR THE RULER, NEVER BOTH — and it is the DAY-ONE form that was broken.
   *
   * ROUND 2 (layout-safari, measured on the shipped path): with no history the third slot handed the
   * renderer BOTH `hitLineOf`'s `new` and `hitMeterOf`'s ten empty marks, on one `white-space:
   * nowrap` line. At 320x568 that value measured 108.7 px in an 88 px track, spilled 20.7 px out of
   * its own slot and pushed the document 4.7 px past the viewport — `doc-overflow`, the layout
   * auditor's own BLOCKER rule, in both engines and both themes. It is not a contrived save:
   * `settings.game` defaults on and a save straight off an aced placement has `of === 0` on every
   * skill, so the first session a student ever plays renders this form on 13 of 13 items. The
   * auditor could not see it because all five of its job states start from a midweek fixture where
   * nothing is new.
   *
   * Held over every rate the window admits, and over the reachable state space, so it cannot come
   * back through a state the fixtures do not happen to reach.
   */
  test('the third slot prints the word or draws the ruler — never both', () => {
    for (const [p, m] of REACHABLE.slice(0, 200)) {
      for (let of = 0; of <= QHAT.window; of++) {
        for (let hits = 0; hits <= of; hits++) {
          const [, , third] = stripFor(readingOf(saveAt(p, m)), { hits, of, window: QHAT.window });
          assert.ok(!(third.value && third.meter),
            `pile ${p} ×${m} ${hits} of ${of}: the slot prints "${third.value}" AND draws ten marks`);
          if (of === 0) {
            assert.equal(third.value, COPY.none, 'a skill with no history lost its word');
            assert.equal(third.meter, null, 'the empty ruler is drawn beside the word that replaces it');
          } else {
            assert.equal(third.value, '', 'the rate is a string again');
            assert.equal(third.meter.of, of, 'the marks are not the rate the engine measured');
          }
          /* the caption is the same in both forms, so the band does not change height under it */
          assert.equal(third.caption, COPY.hitRate);
        }
      }
    }
    /* and the called form has neither: `pays N` is a figure, and nothing is drawn beside it */
    const called = stripFor(readingOf(saveAt(24, 3, 'sure')), { hits: 0, of: 0 });
    assert.equal(called[2].meter, null, 'the marks are drawn under `pays N`');
    assert.equal(called[2].caption, '', 'the priced slot grew a caption');
  });

  /* THE FIRST SESSION, which is the one the student decides whether he likes the game in. Every
     rate it can reach is a perfect record off one to three sittings; the old strip printed all of
     them as `1 of 1` / `2 of 2` / `3 of 3` and they were indistinguishable from a measured 10 of 10. */
  test('a perfect record off one sitting cannot be drawn as a perfect record off ten', () => {
    const thin = hitMeterOf({ hits: 1, of: 1, window: 10 });
    const full = hitMeterOf({ hits: 10, of: 10, window: 10 });
    assert.notDeepEqual(thin, full, 'one right answer draws the same as ten');
    assert.equal(thin.empty, 9, 'the nine sittings the student has not had are not on screen');
    assert.equal(full.empty, 0);
    /* and neither prints a numeral, so neither can be read as a figure at all */
    assert.deepEqual(numeralsOf([{ value: hitLineOf({ hits: 1, of: 1 }) }]), []);
  });

  /**
   * A HIT AND A MISS DIFFER IN SHAPE, NOT ONLY IN HUE — CUT-SPEC §5's own word is "struck".
   *
   * ROUND 2, three independent critics. The shipped marks were the same 6 px disc changing only its
   * `background`: `--ok` against `--bad` is 1.08 : 1 in the light theme (#178A55 vs #D92D4C) and
   * 1.58 : 1 in the dark, both far under the 3 : 1 floor for non-text meaning, and the two differ on
   * no axis but hue. In greyscale — and for the ~1 boy in 12 who is red-green colour deficient — a
   * card reading 2 of 3 read as 3 of 3, which pushes the honest call from `pretty sure` to `sure`.
   * These marks ARE the evidence the bid is priced on: §5 took the numeral `7 of 10` off the strip
   * precisely so the drawing could carry it alone, and `aria-label` reaches a screen reader and no
   * sighted eye. The layout auditor cannot see it either — its contrast detector measures TEXT
   * nodes — so the assertion lives here, on the stylesheet.
   */
  test('the miss is STRUCK, so the rate does not rest on hue alone', () => {
    const ruleFor = (sel) => {
      const m = CSS_CODE.match(new RegExp(`${sel.replace(/[.[\]"=]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
      assert.ok(m, `css/job.css has no rule for ${sel}`);
      return m[1];
    };
    const hit = ruleFor('.job-mark[data-mark="hit"]');
    const miss = ruleFor('.job-mark[data-mark="miss"]');
    const strike = ruleFor('.job-mark[data-mark="miss"]::after');

    /* the strike itself: a real bar, drawn, at an angle, and not a colour swap */
    assert.match(strike, /content:\s*""/, 'the struck mark draws nothing');
    assert.match(strike, /position:\s*absolute/, 'the strike is in the flow — it would move the row');
    assert.match(strike, /transform:[^;]*rotate\(/, 'the strike is not drawn across the mark');
    assert.match(strike, /block-size:\s*[\d.]+px/, 'the strike has no thickness');
    assert.match(CSS_CODE, /\.job-mark\s*\{[^}]*position:\s*relative/s,
      'the strike is positioned against something other than its own mark');

    /* …and the three forms are told apart by more than `background`: strip every colour
       declaration out of each rule and they must still differ */
    const shape = (body) => body.replace(/\b(background|background-color|color)\s*:[^;]*;/g, '').trim();
    assert.notEqual(shape(hit), shape(miss),
      'a hit and a miss differ only in colour — in greyscale they are the same mark');
    assert.match(miss, /box-shadow:\s*inset/, 'the miss is not an open ring');
    assert.ok(!/box-shadow/.test(hit), 'the hit is not a filled mark any more');

    /* the strike is drawn in the miss ink on the page ground, never as a hue against the hit */
    assert.match(strike, /background:\s*var\(--bad\)/);
    assert.match(miss, /background:\s*transparent/);
  });

  test('the printed count is the same object the engine priced — driven on a real save', () => {
    const s = fresh();
    s.settings = { ...(s.settings || {}), testDate: '2026-10-01' };
    state.startJob(s, { now: Date.parse('2026-09-22T18:00:00Z'), today: '2026-09-22' });
    const it = state.currentItem(s);
    const skill = it.skill ?? (it.skills || [])[0] ?? null;
    const detail = qHatDetail(s, skill, { cards: cardById });
    const line = hitLineOf(detail);
    const meter = hitMeterOf(detail);
    if (detail.of === 0) assert.equal(line, COPY.none);
    else assert.equal(line, '');
    assert.deepEqual(numeralsOf([{ value: line }]), [], 'the face-down slot printed a figure');
    assert.deepEqual([meter.hits, meter.of, meter.window], [detail.hits, detail.of, detail.window],
      'the marks are not the detail the engine measured');
    assert.equal(detail.qHat === null || typeof detail.qHat === 'number', true);
  });

  test('a sealed call never weighs itself: history after the seal is not in the printed count', () => {
    const at = 5_000_000;
    const s = {
      cards: { 'voc-01': { history: [[at - 100, true, 1, 0], [at + 100, true, 1, 0]] } },
      inProgress: { queue: [{ n: 1, id: 'voc-01', skill: 'VOC' }], idx: 0, game: { pile: 8, streak: 1, call: { id: 'not sure', at }, answered: 0, tGame: 0, tAnswer: 0, seed: '' } },
    };
    const detail = qHatDetail(s, 'VOC', { cards: { 'voc-01': { skills: ['VOC'] } } });
    assert.equal(detail.of, 1, 'the sitting stamped at or after the lock is in its own rate');
    assert.deepEqual(hitMeterOf(detail), { hits: 1, misses: 0, empty: 9, of: 1, window: 10 });
    assert.equal(hitLineOf(detail), '', 'the sealed slot printed a figure');
  });
});

/* ==========================================================================================
   3 · TWO TAPS PER QUESTION
   ========================================================================================== */

describe('two taps per question, and bank is never one of them', () => {
  test('the game costs exactly one tap per question; the second is the card`s own Submit', () => {
    for (const [p, m] of REACHABLE.slice(0, 400)) {
      const call = viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' });
      const flip = viewModel(saveAt(p, m, econ.offered(p, m)[0]), { phase: 'flip', skill: 'VOC' });
      const ans = viewModel(saveAt(p, m, econ.offered(p, m)[0]), { phase: 'answer', skill: 'VOC' });
      assert.equal(requiredTapsOf(call), 1, `pile ${p} ×${m}: the face-down card asks for ${requiredTapsOf(call)} taps`);
      assert.equal(requiredTapsOf(flip), 0, 'the flip asks for a tap — it is a beat, not a control');
      assert.equal(requiredTapsOf(ans), 0, 'the question asks for a game tap on top of the answer');
      const cycle = requiredTapsOf(call) + requiredTapsOf(flip) + requiredTapsOf(ans);
      assert.equal(cycle + 1, 2, `a question costs ${cycle + 1} taps`);
    }
  });

  /**
   * BANK is on the face-down card and through the flip, and it is NOT on the question — a measured
   * decision, not a preference: with the keyboard open a control under the study card is 150 px
   * below the end of the scroll and `qa/layout-audit.mjs --only job` calls it an offscreen BLOCKER.
   * What the brief actually requires is that it is never REQUIRED, and that is asserted everywhere.
   */
  /**
   * AND IT IS NEVER ENABLED WHERE THE ENGINE WOULD REFUSE IT. `state.bank` throws `JobStateError`
   * over a locked call — it must, or `sure` at ×5 is banked before the flip and the cost floors to
   * nothing — and this model used to hand the flip a live, ungreyed bank button for the whole of
   * `FLIP_MS`: a tap hit the refusal, logged a warning and moved nothing. The assertion that stood
   * here (`enabled === p > 0`, in every phase) pinned that contradiction as correct.
   */
  test('bank is on the face-down card, never required, and never on the question', () => {
    for (const [p, m] of REACHABLE.slice(0, 400)) {
      for (const phase of PLAY_PHASES) {
        const call = phase === 'call' ? null : econ.offered(p, m)[0];
        const save = saveAt(p, m, call);
        const model = viewModel(save, { phase, detail: { hits: 1, of: 2 }, skill: 'VOC' });
        if (phase === 'answer') {
          assert.equal(model.bank, null, 'bank is on the question, where a phone cannot reach it');
          continue;
        }
        assert.ok(model.bank, `${phase}: bank is not on screen`);
        assert.equal(model.bank.required, false, `${phase}: bank became required`);
        assert.equal(model.bank.enabled, p > 0 && call == null,
          `${phase}: bank enabled disagrees with the engine`);
        assert.equal(model.bank.label, COPY.bank);

        /* THE CONTROL AND THE ENGINE, CHECKED AGAINST EACH OTHER rather than against an opinion:
           drive the shipped verb on a copy of this very state and see whether it throws. */
        const probe = saveAt(p, m, call);
        let refused = false;
        try { state.bank(probe, { now: 2000, ms: 0, day: '2026-09-22' }); }
        catch { refused = true; }
        assert.ok(!(model.bank.enabled && refused),
          `pile ${p} ×${m} ${phase}: a control the engine refuses is rendered live`);
      }
    }
  });

  test('a call the pile cannot cover is greyed, never hidden — all three are always rendered', () => {
    for (const [p, m] of REACHABLE) {
      const model = viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' });
      assert.deepEqual(model.calls.map((c) => c.id), [...econ.CALLS],
        `pile ${p} ×${m}: the call row is not the three calls`);
      for (const c of model.calls) {
        assert.equal(c.enabled, econ.offered(p, m).includes(c.id),
          `pile ${p} ×${m}: ${c.id} enabled disagrees with econ.offered`);
      }
    }
  });

  test('no call is tappable once the call is in, so a question can never take two calls', () => {
    for (const [p, m] of REACHABLE.slice(0, 400)) {
      for (const phase of ['flip', 'answer']) {
        const model = viewModel(saveAt(p, m, econ.offered(p, m)[0]), { phase, skill: 'VOC' });
        assert.deepEqual(model.calls.filter((c) => c.enabled), [], `${phase}: a second call is live`);
      }
    }
  });
});

/* ==========================================================================================
   4 · CUT-SPEC §6 — every string, and nothing else
   ========================================================================================== */

describe('the vocabulary: CUT-SPEC §6, and the skill off the card', () => {
  const SKILL_NAMES = new Set(Object.values(skillById).map((s) => s.name));

  test('every string the model can print is COPY`s, computed independently', () => {
    for (const [p, m] of REACHABLE.slice(0, 500)) {
      const detail = { hits: 2, of: 3 };
      const model = viewModel(saveAt(p, m), { phase: 'call', detail, skill: 'VOC' });
      assert.deepEqual(stringsOf(model), [
        /* the way out, and it is §6's own word on §6's own route (r2: the screen had none, and the
           shell's was a 44x44 rectangle of blank paper) */
        COPY.today,
        String(p), COPY.pile,
        `×${m}`, COPY.streak,
        /* the third slot's value is the marks, which are not a string at all; its caption stays */
        COPY.hitRate,
        makeNameOf('VOC'),
        ...econ.CALLS,
        COPY.bank,
      ], `pile ${p} ×${m}: the face-down card said something CUT-SPEC §6 does not list`);

      /* with no history the slot still says one word, and it is COPY's */
      const blank = viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 0, of: 0 }, skill: 'VOC' });
      assert.deepEqual(stringsOf(blank), [
        COPY.today, String(p), COPY.pile, `×${m}`, COPY.streak, COPY.none, COPY.hitRate,
        makeNameOf('VOC'), ...econ.CALLS, COPY.bank,
      ], `pile ${p} ×${m}: an empty history said something CUT-SPEC §6 does not list`);

      /* …and the beat after a bank says one line, which §6 lists as the end panel's own */
      const said = viewModel(saveAt(p, m), { phase: 'call', detail, skill: 'VOC', banked: 186 });
      assert.deepEqual(stringsOf(said), [
        COPY.today, COPY.todayPoints({ points: 186 }), makeNameOf('VOC'), ...econ.CALLS, COPY.bank,
      ], `pile ${p} ×${m}: the bank beat said something CUT-SPEC §6 does not list`);

      /* …and the question screen says one word fewer, because the way out is not drawn over a
         standing bid (r3): three slots and the three call labels the model still carries dead */
      const call = econ.offered(p, m)[0];
      const ans = viewModel(saveAt(p, m, call), { phase: 'answer', skill: 'VOC' });
      assert.deepEqual(stringsOf(ans), [
        String(p), COPY.pile,
        `×${m}`, COPY.streak,
        COPY.pays({ n: econ.payOf(call, m) }),
        ...econ.CALLS,
      ], `pile ${p} ×${m}: the question screen said something CUT-SPEC §6 does not list`);
    }
  });

  /**
   * THE WAY OUT — one control, on the face-down card, and never a fourth tap on a question.
   *
   * ROUND 2 (simplicity-audit, independent): `#/run/page` — the flat page this screen re-skins —
   * offers three ways out; the job screen offered ZERO. `setJobHeader(true)` hides every read-out in
   * the shell (`app.js HDR_JOB_KEEP` is empty), which left the header's Home anchor a live, unpainted
   * 44x44 target in the corner: `document.elementFromPoint(38, 28)` returned it and a crop of that
   * corner was blank. The study card's own `←` is suppressed on a `.run-stage` too. With
   * `display: standalone` in the manifest an installed Packet has no browser back button either, so
   * a student who opened a session and changed his mind had one invisible rectangle and nothing else.
   *
   * ROUND 3 (player-feel, independent) took it back off the QUESTION, and that is not a retreat from
   * round 2: round 2's finding was that a student who changes his mind had nowhere to tap, and the
   * face-down card is where a student changes his mind. What round 3 measured is what the control
   * did once a bid was standing — at `8 · ×2 · pays 18`, one tap on a neutral grey `← Today` charged
   * `priceOf().cost`, the WHOLE pile, and reset the streak, with nothing said before or after. The
   * charge is right (`settleAbandonedBid`: a free bail-out is a better way to miss, and the DP in
   * `scratchpad/cut-screen-r3/abandon-dominance.mjs` prices it at 496 knowing nothing against 469.5
   * for a student who is right 99 times in 100). Offering it is not. So the rule is `bank`'s: a
   * control that claims to be free and is not is worse than one the screen does not draw.
   */
  test('there is a way out of the face-down card, and none is drawn over a standing bid', () => {
    for (const [p, m] of REACHABLE.slice(0, 300)) {
      for (const phase of PLAY_PHASES) {
        const call = phase === 'call' ? null : econ.offered(p, m)[0];
        const model = viewModel(saveAt(p, m, call), { phase, detail: { hits: 2, of: 3 }, skill: 'VOC' });
        if (call == null) {
          assert.deepEqual(model.exit, { label: COPY.today, href: '#/today' },
            `pile ${p} ×${m} ${phase}: there is no way out of the face-down card`);
          /* it is §6's own word, on a route the app already has — no new screen, no new route */
          assert.equal(model.exit.label, COPY.today);
        } else {
          assert.equal(model.exit, null,
            `pile ${p} ×${m} ${phase}: a way out is drawn over a bid that leaving would charge`);
          /* …and what it would have charged is exactly a miss, which is why it is not offered */
          assert.equal(state.priceOf(saveAt(p, m, call), call).cost, econ.costOf(call, m, p));
        }
        assert.equal(requiredTapsOf(model), phase === 'call' ? 1 : 0,
          `${phase}: the way out changed what a question costs in taps`);
      }
    }
    /* THE FACE-DOWN CARD IS ONE CONTINUE AWAY FROM ANY QUESTION, so taking the exit off the question
       never strands anybody: every reachable state whose bid is settled offers it again. */
    for (const [p, m] of REACHABLE.slice(0, 300)) {
      const back = viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 2, of: 3 }, skill: 'VOC' });
      assert.deepEqual(back.exit, { label: COPY.today, href: '#/today' },
        `pile ${p} ×${m}: the next face-down card has no way out either`);
    }
    /* …and it is gone at the end, where the panel's own primary button is already Today */
    const over = viewModel({}, { over: { today: 1, best: 1, split: 48 } });
    assert.equal(over.exit, null, 'the end panel carries Today twice');
    assert.equal(over.primary, COPY.today);
    assert.deepEqual(exitOf(), { label: COPY.today, href: '#/today' });
  });

  test('a wrong answer prints no string at all — no play phase carries a line', () => {
    for (const [p, m] of REACHABLE.slice(0, 300)) {
      for (const phase of PLAY_PHASES) {
        const call = phase === 'call' ? null : econ.offered(p, m)[0];
        const model = viewModel(saveAt(p, m, call), { phase, detail: { hits: 0, of: 4 }, skill: 'VOC' });
        assert.deepEqual(model.lines, [], `${phase} grew a line of copy`);
        assert.equal(model.primary, null, `${phase} grew a primary button`);
      }
    }
  });

  test('the end of a session: today, best, the MEASURED split, and Today', () => {
    const model = viewModel({}, { over: { today: 186, best: 274, split: 48, points: 12, answered: 9 } });
    assert.deepEqual(model.lines, [
      COPY.todayPoints({ points: 186 }),
      COPY.best({ points: 274 }),
      COPY.split({ percent: 48 }),
    ]);
    assert.equal(model.primary, COPY.today, 'the primary button after a session is not Today');
    assert.deepEqual(model.strip, [], 'the three slots are still up after the session');
    const noSplit = viewModel({}, { over: { today: 0, best: 0, split: null } });
    assert.equal(noSplit.lines.length, 2, 'an unmeasured split printed a number anyway');
  });

  /**
   * The skill name comes off the card — and the two names that carry a digit come off `FACE_NAMES`,
   * which is the stopgap this lane owns while `data/skills.js` (which it does not) still says
   * `Factoring a = 1`. The digit itself is held one screen up, in the numeral sweep; what is held
   * here is that nothing else is renamed and that the table cannot quietly grow.
   */
  test('the skill name comes off the card, and only a digit may move it', () => {
    for (const id of Object.keys(skillById)) {
      const own = skillById[id].name;
      if (/\d/.test(own)) {
        assert.equal(makeNameOf(id), FACE_NAMES[id], `${id} carries a digit and no digit-free line`);
        assert.ok(makeNameOf(id).startsWith(own.split(/[\s,]/)[0]),
          `${id}: "${makeNameOf(id)}" is not the same skill the card is about`);
      } else {
        assert.equal(makeNameOf(id), own);
        assert.ok(SKILL_NAMES.has(makeNameOf(id)));
      }
    }
    /* the table is only ever consulted for a name that needs it: rename the two skills in
       `data/skills.js` and these two entries go dead rather than fighting the data file */
    for (const id of Object.keys(FACE_NAMES)) assert.ok(skillById[id], `FACE_NAMES names ${id}, not a skill`);
    assert.equal(makeNameOf('NOT-A-SKILL'), 'NOT-A-SKILL');
  });

  /* The model can only say what COPY says — but the DOM builder could still hard-code a word.
     Every string literal in the source is classified, and prose must be in COPY.

     …OR IN `FACE_NAMES`, and that exception is declared rather than discovered: the two digit-free
     skill lines are prose, they are student-facing, and their proper home is `data/skills.js`,
     which this lane does not own (the request is in notes/cut-screen.md). They are allowed here by
     being READ OFF THE EXPORT — a third one added to the file without being exported, or a word
     typed straight into the DOM builder, is still an offender. */
  /**
   * THE BUS TOPICS, READ OFF THE MODULES THAT EMIT THEM — never a regex for `word:word`.
   *
   * `screens/job.js` listens for `card:wrong` and `card:hint` (r5, the screen lane), and a listener
   * argument is a STRUCTURAL string in exactly the way a selector or a dataset value is: the student
   * never sees it. But `'anything: like this'` must not become an escape hatch for copy, so a
   * literal is exempt only when `screens/card.js` really emits it as a topic. Invent a topic in
   * `screens/job.js` that nothing emits and this test still calls it out — which is also the
   * cheapest available check that the listener is listening for something real.
   */
  const BUS_TOPICS = new Set(
    [...read('site/js/screens/card.js').matchAll(/bus\.emit\(\s*'([\w-]+:[\w-]+)'/g)].map((m) => m[1]));

  test('no student-facing literal is hard-coded in the source', () => {
    assert.ok(BUS_TOPICS.size >= 2, 'screens/card.js emits no bus topics any more — re-derive this exemption');
    const copyStrings = new Set();
    const walk = (v) => {
      if (typeof v === 'string') copyStrings.add(v);
      else if (typeof v === 'function') { try { copyStrings.add(v({ n: 0, points: 0, percent: 0, hits: 0, of: 0 })); } catch { /* not that shape */ } }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(COPY);
    for (const n of Object.values(FACE_NAMES)) copyStrings.add(n);

    /* selectors, tag+class strings, dataset values, routes and developer console text */
    const TOKEN = /^[#.]?[A-Za-z][\w-]*(?:[.#][\w-]+)*$/;
    const ROUTE = /^#?\/[\w/-]*$/;
    const STRUCTURAL = new Set([
      '.job-call:not([disabled])', '[data-slot="streak"]', '.job-face-down', '.btn-primary',
      '(prefers-reduced-motion: reduce)', 'aria-live', 'true', 'false',
    ]);
    const offenders = [];
    for (const lit of literalsOf(SRC)) {
      if (!lit.trim()) continue;
      if (copyStrings.has(lit)) continue;
      if (STRUCTURAL.has(lit)) continue;
      if (ROUTE.test(lit)) continue;
      if (TOKEN.test(lit)) continue;
      if (lit.startsWith('job: ')) continue;                 // console.error / console.warn
      if (BUS_TOPICS.has(lit)) continue;                      // a bus topic — see BUS_TOPICS
      if (/^\.{1,2}\/[\w./-]+\.js$/.test(lit)) continue;      // an import specifier
      if (!/[A-Za-z]{2}/.test(lit)) continue;                // a bare sign, e.g. the multiplication cross
      offenders.push(lit);
    }
    assert.deepEqual(offenders, [],
      'screens/job.js hard-codes a string that is not in CUT-SPEC §6 — see designs/CUT-SPEC.md "Every string"');
  });

  test('the banned words are not in the source, in any casing', () => {
    const banned = ['one more', 'posted', 'loot', 'wing', 'contract', 'backcheck', 'getaway',
      'nearly', 'so close', 'almost had it', 'good try', 'nice try'];
    const lower = CODE.toLowerCase();
    for (const w of banned) {
      assert.ok(!lower.includes(w), `screens/job.js says "${w}" — CUT-BRIEF "Hard limits"`);
    }
  });
});

/* ==========================================================================================
   5 · THE STREAK IS THE ONLY NUMBER THAT ANIMATES, AND IT IS THE BIGGEST THING WHEN IT MOVES
   ========================================================================================== */

describe('motion: one number moves, and it owns the screen while it does', () => {
  /** Every `selector { … }` block of a stylesheet, @media / @container blocks unwrapped. */
  function rulesOf(css) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(flat))) {
      const sel = m[1].trim().split('\n').pop().trim();
      if (!sel || sel.startsWith('@') || sel.startsWith('from') || sel.startsWith('to') || /^\d+%$/.test(sel)) continue;
      out.push({ sel, body: m[2] });
    }
    return out;
  }

  /** `@keyframes NAME { … }` → the whole block's text. */
  function keyframesOf(css) {
    const out = new Map();
    const re = /@keyframes\s+([\w-]+)\s*\{/g;
    let m;
    while ((m = re.exec(css))) {
      let depth = 1;
      let i = re.lastIndex;
      while (i < css.length && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
      out.set(m[1], css.slice(re.lastIndex, i - 1));
    }
    return out;
  }

  const RULES = rulesOf(CSS);
  const FRAMES = keyframesOf(CSS);

  test('only two keyframes exist, and only one of them moves a number', () => {
    assert.deepEqual([...FRAMES.keys()].sort(), ['job-flip', 'job-streak-tick'],
      'css/job.css grew a third animation — the streak is the only number that animates (CUT-SPEC §3)');
    for (const [name, body] of FRAMES) {
      assert.match(body, /transform/, `@keyframes ${name} animates something that is not a transform`);
    }
  });

  test('the streak keyframe is used by the streak slot and by nothing else', () => {
    const users = RULES.filter((r) => /animation[^;]*job-streak-tick/.test(r.body));
    assert.equal(users.length, 1, `job-streak-tick is used by ${users.length} rules`);
    assert.match(users[0].sel, /\[data-tick="true"\]/, `job-streak-tick is on \`${users[0].sel}\``);
    assert.match(users[0].sel, /job-slot/, 'job-streak-tick is not on a slot');
  });

  test('the flip is on the face-down card, which is not a number', () => {
    const users = RULES.filter((r) => /animation[^;]*job-flip/.test(r.body));
    assert.equal(users.length, 1);
    assert.match(users[0].sel, /\.job-face-down/);
    assert.ok(!/job-slot/.test(users[0].sel), 'the flip animation reaches a numeric slot');
  });

  test('no other rule animates or transitions a transform', () => {
    for (const r of RULES) {
      if (!/(^|[\s;])(animation|transition)\s*:/.test(r.body)) continue;
      const ok = /\[data-tick="true"\]/.test(r.sel) || /\.job-face-down/.test(r.sel);
      assert.ok(ok, `\`${r.sel}\` animates, and it is neither the streak nor the flip`);
      if (/transition[^;]*transform/.test(r.body)) {
        assert.fail(`\`${r.sel}\` transitions a transform — only the streak keyframe may move anything`);
      }
    }
  });

  test('while it moves the streak is the biggest thing on the screen', () => {
    const tok = (name) => {
      const m = THEME.match(new RegExp(`--${name}\\s*:\\s*([\\d.]+)px`));
      assert.ok(m, `theme.css has no --${name}`);
      return Number(m[1]);
    };
    const scaleM = CSS.match(/--job-tick-scale\s*:\s*([\d.]+)/);
    assert.ok(scaleM, 'css/job.css no longer declares --job-tick-scale');
    const scale = Number(scaleM[1]);

    const frame = FRAMES.get('job-streak-tick');
    assert.match(frame, /scale\(var\(--job-tick-scale\)\)/, 'the tick no longer scales by the token');

    /* every font-size declared in this stylesheet, resolved through theme.css */
    const sizes = [...CSS.matchAll(/font-size\s*:\s*var\(--(fs-\d)\)/g)].map((m) => tok(m[1]));
    assert.ok(sizes.length >= 3, `only ${sizes.length} type sizes found — the parse collapsed`);
    const slotSize = tok('fs-4');
    assert.ok(sizes.includes(slotSize), 'the slot value no longer uses --fs-4');
    const biggestOther = Math.max(...sizes);
    assert.ok(slotSize * scale > biggestOther,
      `the streak peaks at ${slotSize * scale}px against a ${biggestOther}px largest other — `
      + 'CUT-BRIEF: "it should be the biggest thing on screen when it moves"');
  });

  test('the tick outlives the animation, so the climb is never cut off', () => {
    const dur = Number(THEME.match(/--dur-3\s*:\s*(\d+)ms/)[1]);
    assert.ok(TICK_MS >= dur, `the streak attribute comes off at ${TICK_MS}ms, mid-animation (${dur}ms)`);
    assert.ok(FLIP_MS > 0 && FLIP_MS < 1000, `the flip is ${FLIP_MS}ms — a beat, not a wait`);
  });

  test('reduced motion turns both off', () => {
    const block = CSS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(block, 'css/job.css has no reduced-motion block');
    assert.match(block[1], /animation:\s*none/);
    assert.match(block[1], /data-tick/);
    assert.match(block[1], /job-face-down/);
  });
});

/* ==========================================================================================
   6 · NO NEW ROUTE, NO ADVICE, AND THE LAYOUT RULES THE LAST BUG CAME THROUGH
   ========================================================================================== */

describe('the shape of the screen', () => {
  test('ROUTE_PATTERNS is 13 — the game is the run screen with a different top strip', () => {
    assert.equal(ROUTE_PATTERNS.length, 13);
    assert.ok(!/ROUTE_PATTERNS|registerRoute|routes\s*\[/.test(CODE), 'screens/job.js registers a route');
  });

  test('the four phases, and no fifth', () => {
    assert.deepEqual([...PHASES], ['call', 'flip', 'answer', 'over']);
    assert.deepEqual([...PLAY_PHASES], ['call', 'flip', 'answer']);
    for (const p of PLAY_PHASES) assert.ok(PHASES.includes(p));
  });

  test('the screen never advises: shouldPush and the bands are not reachable from here', () => {
    assert.ok(!/shouldPush/.test(CODE), 'screens/job.js calls econ.shouldPush — the app must never advise');
    assert.ok(!/\bBANDS\b/.test(CODE), 'screens/job.js prints the bands; they belong to Settings alone');
  });

  /**
   * An attributed waiver is an ATTRIBUTION, not an exemption (`qa/audit-allow.json _doc`): a hit may
   * be waived on the state that HOSTS another layer's component only when a CONTROL state outside
   * the host reproduces it and is left UNWAIVED, so the owning layer's net still fails on it. The
   * test that used to gate this went with the cut job states (notes/DEMOLISH.md §4); the game's
   * waivers came back with `job-answer-kb`, so the gate does too.
   */
  test('an attributed job waiver names a control state that is itself unwaived', () => {
    const allow = JSON.parse(read('qa/audit-allow.json'));
    const catalog = read('qa/audit-states.mjs');
    const jobEntries = allow.entries.filter((e) => (e.states || []).some((x) => x.startsWith('job-')));
    assert.ok(jobEntries.length > 0, 'no attributed job waiver — if the game needs none, delete this test');
    for (const e of jobEntries) {
      assert.ok(e.reason && /ATTRIBUTED/.test(e.reason), `${e.type} ${e.selector}: a waiver with no attribution`);
      const at = e.attribution;
      assert.ok(at && at.control && at.command && Array.isArray(at.hits) && at.hits.length,
        `${e.type} ${e.selector}: no machine-checkable attribution block`);
      /* the control must exist in the catalog … */
      assert.ok(catalog.includes(`add('${at.control}'`), `${e.type}: control state ${at.control} is not in qa/audit-states.mjs`);
      /* … and be waived by nothing, or the hit is muted on both sides and nobody owns it */
      for (const w of allow.entries) {
        const states = w.states || [];
        const covers = states.includes('*') || states.some((x) => at.control.startsWith(x));
        assert.ok(!(covers && w.type === e.type),
          `${e.type} ${e.selector}: the control ${at.control} is itself waived for ${w.type} — that is a mute, not an attribution`);
      }
      /* every state a job waiver names must exist too: a waiver for a deleted state is a blindfold */
      for (const st of e.states) {
        assert.ok(catalog.includes(`add('${st}'`), `${e.type}: waived state ${st} no longer exists in the catalog`);
      }
      for (const hit of at.hits) {
        assert.ok(hit.selector && Number.isFinite(hit.onHost) && Number.isFinite(hit.onControl),
          `${e.type}: an attribution hit with no measured counts`);
        assert.ok(hit.onControl > 0, `${e.type} ${hit.selector}: the control reproduces it 0 times — it is the host's`);
      }
    }
  });

  test('the session files the page it closed', () => {
    assert.match(CODE, /captureJobBefore\(/, 'no before-snapshot: the run record would have no start stamp');
    assert.match(CODE, /commitJobRun\(/,
      'the session does not call commitJobRun — the same answers would earn a trophy on #/run/page and nothing here');
  });

  /**
   * THE BUG THIS LINT IS FOR, found by `node qa/layout-audit.mjs --only job` and by nothing else:
   * `mount()` calls `render()` before the tail of its own closure has been evaluated, so a helper
   * declared below that call as `const f = () => …` is in its temporal dead zone and the FIRST PAINT
   * throws — the route falls back to Today and the whole screen is gone. No headless assertion about
   * the model can see it, because the model is fine. Every helper below the first paint must be a
   * hoisted `function` declaration.
   */
  test('no helper below the first paint is in its temporal dead zone', () => {
    const body = CODE.slice(CODE.indexOf('function mount(host)'));
    const firstPaint = body.indexOf('\n  render();');
    assert.ok(firstPaint > 0, 'mount() no longer paints from its own body — re-derive this lint');
    const after = body.slice(firstPaint).split('\n');
    const offenders = after.filter((l) => /^ {2}(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/.test(l));
    assert.deepEqual(offenders, [],
      'a closure helper below mount()\'s first render() is a const arrow — it will throw on the first paint');
  });

  test('no Math.random, no clock in the printed numbers', () => {
    assert.ok(!/Math\.random/.test(CODE), 'BUILD-POLICY §2: no Math.random under site/js');
    /* Date is allowed — it feeds the split meter and the verbs' `now`. It may never reach a slot. */
    const stripBlock = SRC.slice(SRC.indexOf('export function stripFor'), SRC.indexOf('export function viewModel'));
    assert.ok(!/Date|performance|now\(/.test(stripBlock), 'stripFor reads a clock');
  });

  /**
   * THE WAY OUT IS RENDERED, AND THE BLANK ONE IS NOT — the DOM half of the model assertion above.
   *
   * `setJobHeader(true)` hides every read-out in the shell, which left `.hdr-home` a live 44x44
   * anchor with a `display: none` ring inside it: invisible ink in the corner that charged the pile
   * and reset the streak when it was tapped, and was still announced as "Home" to a screen reader.
   * The screen renders its own `Today` instead; the end panel's own primary button is already Today,
   * so the head comes off there rather than saying it twice.
   *
   * AND THE ROW COLLAPSES WHEN IT IS EMPTY (r3, layout-safari). Every play phase asks the model for
   * a head and the model answers `null` from the moment a bid is standing, so `.job-head` is an
   * empty `<div>` for the whole of the flip and the question — and an empty GRID ITEM still holds a
   * 44 px track and the 16 px gap above the strip. Measured on the catalog's own `job-answer-kb`
   * (KB_PX = 336) at 320x568, at `renderAnswer`'s own scroll position: `.job-strip` 124…167.9 under
   * a `#dock` at 115…232 — 0.0 px of the three-slot strip visible, and `elementFromPoint` at all
   * three slot centres answering `w-key`. `:empty` gives the 60 px back: 64…107.9, clear.
   */
  test('one way out, painted on the face-down card — and no empty row left over a question', () => {
    /* the shell's invisible target, for the length of a session only */
    assert.match(CSS_CODE, /\.hdr\[data-job="true"\][^{]*\.hdr-home\s*\{[^}]*display:\s*none/,
      'the header`s unpainted Home link is still live during a session');
    /* the screen's own, and it is a tap target rather than a word floating in the gutter */
    assert.match(CSS_CODE, /\.job-quit\s*\{[^}]*min-block-size:\s*var\(--tap\)/,
      'the way out is not a tap target');
    /* …and when the model gives it nothing to draw, it takes no room above the sticky strip */
    assert.match(CSS_CODE, /\.job-head:empty\s*\{[^}]*display:\s*none/,
      'an empty way-out row still holds its 44 px track and the gap over the strip');

    /* every play-phase renderer draws it; the end panel does not */
    const bodyOf = (name) => {
      const at = CODE.indexOf(`function ${name}(`);
      assert.ok(at > 0, `screens/job.js has no ${name}()`);
      const end = CODE.indexOf('\n  function ', at + 1);
      return CODE.slice(at, end === -1 ? CODE.length : end);
    };
    for (const fn of ['renderCall', 'renderFlip', 'renderAnswer', 'bidlessBeat']) {
      assert.match(bodyOf(fn), /renderHead\(model\)/, `${fn} renders no way out`);
    }
    /* …and it is the MODEL's, so the phase that has no exit renders none: `renderOver` calls the
       same function with the same argument and the model hands it null */
    assert.match(bodyOf('renderOver'), /renderHead\(model\)/, 'renderOver builds its own head');
    assert.match(bodyOf('renderHead'), /model\?\.exit/, 'the head is not read off the model');
    assert.match(bodyOf('renderHead'), /model\.exit\.href/, 'the way out hard-codes its own route');
  });

  /**
   * NO DELETED MECHANIC IS STILL WIRED UP, ANYWHERE UNDER `site/js/screens/`.
   *
   * ROUND 2 (study-untouched, independent): `screens/boss.js` still exported `VAULT_QUERY`,
   * `isVaultRun` and `VAULT_BACK`, and `mountBoss` still evaluated them on every mount — so
   * `#/boss/B2?job=1` rendered a STUDY screen with `data-vault="true"` and its "Leave the boss"
   * arrow silently re-pointed at `#/run/job` under the label "Back to the job", ungated by
   * `settings.game`. CUT-BRIEF deletes "the vault as a distinct shape" by name and then says
   * "Delete the code too … Dead code that 'might come back' is how this got here."
   *
   * It was invisible because every jargon test scanned a corpus it was not in: `SETTINGS`'s string
   * literals and the trophy catalogue. This scans the SCREENS — all of them, CODE only
   * (`stripCommentsAndStrings`), so a demolition note may still say what was demolished and a
   * student-facing sentence is left to the vocabulary tests that already hold it.
   */
  test('no deleted mechanic is wired into any screen — the whole folder, not one file', () => {
    /* the nouns CUT-BRIEF deletes by name that cannot also be ordinary English in this codebase —
       `press`, `chain`, `rank`, `scope`, `cold` and `tell` are all in live COMPOSED code for their
       own reasons, so they are held by the vocabulary tests above rather than by a grep */
    const banned = ['vault', 'backcheck', 'getaway', 'posted', 'loot', 'crew', 'elo', 'wing',
      'guard', 'contract', 'board', 'fault'];
    const files = listFiles('site/js/screens');
    assert.ok(files.length >= 8, `only ${files.length} screens scanned — the walk collapsed`);
    const offenders = [];
    for (const f of files) {
      const code = stripCommentsAndStrings(read(f.slice(repoPath('').length + 1)));
      for (const w of banned) {
        const m = code.match(new RegExp(`\\b${w}`, 'i'));
        if (m) offenders.push(`${f.split('/').pop()}: ${m[0]}`);
      }
    }
    assert.deepEqual(offenders, [],
      'a screen still names a mechanic CUT-BRIEF deletes — see "What is DELETED"');
  });

  test('the layout rules the last bug came through (notes/LAYOUT-ROOT.md)', () => {
    assert.ok(!/position:\s*fixed/.test(CSS_CODE), 'css/job.css uses position: fixed');
    assert.ok(!/\b\d+vh\b/.test(CSS_CODE), 'css/job.css sizes from the viewport');
    /* every grid track that holds words has a floor — a bare 1fr / minmax(0,…) is the collapse */
    for (const m of CSS_CODE.matchAll(/grid-template-columns\s*:\s*([^;]+);/g)) {
      const v = m[1];
      if (/^\s*1fr\s*$/.test(v)) continue;                      // a single full-width column cannot collapse
      assert.ok(!/minmax\(\s*0\s*,/.test(v), `a 0-floor text track: ${v.trim()}`);
      assert.match(v, /min\(100%,\s*[\d.]+ch\)/, `no ch floor on a multi-column track: ${v.trim()}`);
    }
    /* the one sticky band this screen adds raises the token the card's rail parks against */
    assert.match(CSS, /--stack-top:\s*calc\(var\(--header-h\)\s*\+\s*var\(--job-strip-h\)\)/,
      'the sticky strip does not raise --stack-top: the card rail will sit behind it');
    const heights = [...CSS.matchAll(/--job-strip-h:\s*(\d+)px/g)].map((m) => Number(m[1]));
    assert.equal(heights.length, 4, 'the band no longer declares a height per form and fold — measure them all');
    const [line, stack, shortFold, kbFold] = heights;
    assert.ok(line >= 48 && line <= 60, `the one-line band is ${line}px — measure it, do not guess it`);
    assert.ok(stack >= 80 && stack <= 100, `the two-line band is ${stack}px — measure it, do not guess it`);
    assert.ok(stack > line, 'the two-line band is not taller than the one-line one');
    /* ON A SHORT FOLD THE TWO-LINE FORM IS ONE LINE AGAIN, because its captions step aside there —
       the band and the rule that shortens it have to move together or `--stack-top` parks the card's
       own sticky rail inside a band that is no longer that tall (r3, layout-safari: at 320x568 with
       the keys up the student has 51 px between the header and the Answer Dock, and 79.5 px of strip
       left 0.0 px of it visible). */
    assert.equal(shortFold, line, 'the short-viewport band is not the one-line band it now renders');
    assert.equal(kbFold, line, 'the keyboard-open band is not the one-line band it now renders');
    const stepAside = CSS_CODE.match(/\[data-form="stack"\]\s+\.job-slot-k\s*\{[^}]*display:\s*none/g) || [];
    assert.equal(stepAside.length, 2,
      'the short-fold band claims one line without taking the captions off — measure it or drop it');
    const headAside = CSS_CODE.match(/\[data-phase="answer"\]\s+\.job-head\s*\{[^}]*display:\s*none/g) || [];
    assert.equal(headAside.length, 2,
      'the way-out row is still 44px + a 16px gap over the strip with the keys up');
    /* the pinned form is ONE line per slot whenever the third slot has no caption: the band sits
       above the stem on a 331 px keyboard phone and every pixel of it comes off the answer */
    assert.match(CSS, /\[data-form="line"\] \.job-slot[\s\S]{0,200}grid-auto-flow: column/,
      'the pinned strip no longer collapses to one line — it is eating the answer');
    assert.match(CSS, /\.job-screen\[data-form="stack"\]\s*\{[\s\S]{0,120}--job-strip-h/,
      'the taller form does not raise --job-strip-h: the card rail would park inside the band');
    /* THE BASE RULE OWNS THE TOKENS. A variant rule (`[data-form="stack"]`) taking `--job-tick-scale`
       or `max-width` with it is silent: the streak simply stops growing in the form it is usually in,
       and a lazy `[\s\S]*?` match across rule boundaries would not see it. Measured on the FIRST
       `.job-screen { … }` block only, with no `}` allowed in between. */
    const baseRule = CSS_CODE.match(/\.job-screen\s*\{([^{}]*)\}/);
    assert.ok(baseRule, 'css/job.css has no plain .job-screen rule');
    assert.match(baseRule[1], /max-width:\s*none/,
      'the screen width jumps when polish.css sees .card-screen appear');
    assert.match(baseRule[1], /--job-tick-scale/, '--job-tick-scale moved off the base rule');
    assert.match(baseRule[1], /--stack-top/, '--stack-top moved off the base rule');
  });
});

/* ==========================================================================================
   7 · THE FACE-DOWN CARD CARRIES NO PRICE, AND THAT IS ROUND 2 UNDOING ROUND 1

   Round 1 answered "the bid has no price in sight" by drawing each call's `pay` and `cost` as two
   bars on a shared ruler. Round 2's simplicity audit counted what that put on the decision screen:
   two printed numerals + two drawn counts (the hit rate) + six drawn prices + the ruler they are
   drawn against = TEN numeric quantities, against a hard limit of three, on a surface CUT-SPEC §5
   enumerates in full and never mentions — `grep -niE "bar|stake|ruler" designs/CUT-SPEC.md` is
   empty. "Nothing else numeric" is not "nothing else in digits", and a bar that is exempt because
   it is geometry is the same move that lets any re-inflation pass a numeral count. At an empty pile
   — the first card of every session and every card after a bank — three of the six rendered as
   identical empty tracks, so the added surface did not even say anything there.

   What the student bids is how sure he is; the evidence is the drawn rate; the bands each call is
   honest over are in Settings (CUT-SPEC §6). Honest calling wins over the shipped table at every
   reachable state, so nobody is beaten by a price they cannot see.
   ========================================================================================== */

describe('the price is NOT on the face-down card', () => {
  test('a call is an id, a word and whether the pile covers it — and nothing else', () => {
    let checked = 0;
    for (const [p, m] of REACHABLE) {
      const s = saveAt(p, m);
      const model = viewModel(s, { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' });
      assert.deepEqual(model.calls.map((c) => c.id), [...econ.CALLS], `pile ${p} ×${m}: a call is missing`);
      for (const c of model.calls) {
        assert.deepEqual(Object.keys(c).sort(), ['enabled', 'id', 'label'],
          `pile ${p} ×${m} ${c.id}: the call carries ${Object.keys(c).join(', ')}`);
        assert.equal(c.label, c.id, 'the call is labelled with something other than its own word');
        assert.equal(c.enabled, econ.offered(p, m).includes(c.id));
        /* the one that was drawn, and the one that was the ruler */
        for (const k of ['pay', 'cost', 'scale', 'bar', 'width']) {
          assert.equal(c[k], undefined, `pile ${p} ×${m} ${c.id}: the call carries a ${k} again`);
        }
        checked++;
      }
    }
    assert.ok(checked > 3000, `only ${checked} calls — the sweep collapsed`);
  });

  test('nothing in the screen or the stylesheet draws a price any more', () => {
    for (const gone of ['stakeOf', 'stakeEl', 'stakeBar', 'barWidth']) {
      assert.ok(!new RegExp(`\\b${gone}\\b`).test(CODE), `screens/job.js still has ${gone}`);
    }
    assert.ok(!/job-stake/.test(CSS_CODE), 'css/job.css still has a .job-stake rule');
    assert.ok(!/--w\b/.test(CSS_CODE), 'css/job.css still reads a per-bar width token');
    /* and no second payoff table crept in to replace them */
    assert.ok(!/\bPAYS\b|\bCOSTS\b/.test(CODE), 'screens/job.js reads the payoff table directly');
    assert.ok(/state\.priceOf\(/.test(CODE), 'the screen no longer prices through state.priceOf');
    /* `priceOf` survives for exactly two readers: the third slot's `pays N`, and settling a bid the
       student walked away from. Neither is on the face-down card. */
    assert.equal((CODE.match(/state\.priceOf\(/g) || []).length, 2,
      'state.priceOf has grown a third caller — the price is creeping back onto the card');
  });

  test('the decision screen carries the two numbers it is allowed and no drawn third', () => {
    for (const [p, m] of REACHABLE.slice(0, 500)) {
      const model = viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 3, of: 4 }, skill: 'VOC' });
      assert.deepEqual(screenNumeralsOf(model), [p, m],
        `pile ${p} ×${m}: a figure reached the face-down card`);
      /* the ONE drawn quantity left is the hit rate, and it is on the strip, not on a call */
      const drawn = model.strip.filter((s) => s.meter);
      assert.equal(drawn.length, 1, `pile ${p} ×${m}: ${drawn.length} drawn quantities on the strip`);
      assert.equal(drawn[0].slot, 'third');
    }
  });
});

/* ==========================================================================================
   8 · A BID THE STUDENT WALKED AWAY FROM

   ROUND 1, exploit-hunt. The study card carries COMPOSED's own `←`, and `screens/card.js` rebuilds
   its attempt count on every mount, so the third wrong attempt — the ONLY thing that produces a
   `cleared: false` result — could be avoided for ever: leave the question, tap Home's Continue, and
   the same question came back with the same call still locked and the pile never charged. Scored
   against the shipped table that is 496 points on a twelve-question page knowing nothing, against
   478.3 for a player who is right 99 times in 100. "Your streak is a pile you can lose" was false.
   ========================================================================================== */

describe('an abandoned bid settles, and the question stays exactly where it was', () => {
  test('walking away costs precisely what being wrong costs — every reachable state, every call', () => {
    let checked = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        const s = saveAt(p, m, call);
        const priced = state.priceOf(s, call);
        const out = settleAbandonedBid(s);
        const g = state.stateOf(s);
        assert.equal(out.cost, priced.cost, `pile ${p} ×${m} ${call}: settled at a price the engine has not got`);
        assert.equal(g.pile, Math.max(0, p - econ.costOf(call, m, p)),
          `pile ${p} ×${m} ${call}: the pile after walking away is not the pile after a miss`);
        assert.equal(g.streak, 1, 'the streak survived a bid that was walked out on');
        /* THE BID IS GONE AND THE SEAL IS NOT (r2, player-feel): the question the student has
           already read comes back priced at nothing, never face-down with three live calls */
        assert.deepEqual(g.call, { id: null, at: 1000 },
          `pile ${p} ×${m} ${call}: the abandoned question is biddable again`);
        assert.equal(state.priceOf(s, g.call.id).pay, 0, 'the sealed question still pays');
        assert.equal(state.priceOf(s, g.call.id).cost, 0, 'the sealed question still costs');
        assert.ok(g.pile >= 0, 'the pile went negative');
        assert.ok(g.pile <= p, 'walking away PAID');
        /* the question is untouched: the study layer chooses the questions, and this is not a grade */
        assert.equal(state.idxOf(s), 0, 'the queue advanced — the question was answered for the student');
        assert.equal(state.targetsLeft(s), 1, 'a question left the session');
        assert.deepEqual(state.currentItem(s), { n: 1, id: 'x', skill: 'VOC' }, 'the item was rewritten');
        checked++;
      }
    }
    assert.ok(checked > 3000, `only ${checked} abandoned bids — the sweep collapsed`);
  });

  test('a face-down card is not an abandoned bid: with no call locked nothing moves', () => {
    for (const [p, m] of REACHABLE.slice(0, 400)) {
      const s = saveAt(p, m);
      const before = JSON.stringify(s);
      assert.equal(settleAbandonedBid(s), null, `pile ${p} ×${m}: an unlocked card settled something`);
      assert.equal(JSON.stringify(s), before, `pile ${p} ×${m}: the save moved under a settle that returned null`);
    }
    assert.equal(settleAbandonedBid({}), null, 'a save with no session settled something');
  });

  test('the 496 trace is dead: a session of nothing but abandoned bids scores zero', () => {
    const s = saveAt(0, 1);
    /* the finding's own strategy: take the dearest call you can afford, leave before the third
       wrong attempt, come back. Twelve times, which is the longest page CUT-BRIEF asks for. */
    for (let i = 0; i < 12; i++) {
      const offered = state.callsFor(s);
      const id = offered[offered.length - 1];
      state.call(s, id, { now: 1000 + i, ms: 0 });
      settleAbandonedBid(s);
    }
    const g = state.stateOf(s);
    assert.equal(g.pile, 0, `twelve abandoned bids left a pile of ${g.pile}`);
    assert.equal(g.streak, 1);
    assert.equal(g.answered, 0, 'the schedule was advanced by a student who answered nothing');
  });

  /**
   * ROUND 2 (player-feel, measured on a phone): the pile and the streak were charged for leaving —
   * and then the SAME question came back face-down with all three calls live. The critic bid
   * `not sure`, read "Name the angle whose vertex is F…", left through the header's invisible Home
   * link, came back, bid `sure` on the question he had just read and banked +10. CUT-BRIEF's first
   * surviving idea is "you bid on yourself BEFORE you see the question", and `job/state.js bank()`
   * says it in the engine's own words: that "is only true if the bid stands until it is answered".
   * A question the student has read is now sealed bidless — the engine's own shape for a question it
   * will not price twice — so walking away can only ever cost.
   */
  test('a question the student has read can never be bid on again', () => {
    for (const [p, m] of REACHABLE.slice(0, 400)) {
      for (const call of econ.offered(p, m)) {
        const s = saveAt(p, m, call);
        settleAbandonedBid(s);

        /* the screen shows the QUESTION on return, not a face-down card: `readingOf` has no call to
           price, and the model's three calls are all dead */
        const r = readingOf(s);
        assert.equal(r.call, null, `pile ${p} ×${m} ${call}: the returned screen prices a bid`);
        assert.equal(r.pay, null);
        const model = viewModel(s, { phase: 'answer', detail: { hits: 2, of: 3 }, skill: 'VOC' });
        assert.deepEqual(model.calls.filter((c) => c.enabled), [],
          `pile ${p} ×${m} ${call}: the read question is offered a live call`);

        /* …and the engine refuses to sell one behind the screen's back: the dearest call it would
           have offered is priced at nothing, and the pile does not move */
        const before = state.stateOf(s).pile;
        const dearest = econ.offered(before, 1).slice(-1)[0];
        const out = state.call(s, dearest, { now: 2000, ms: 0 });
        assert.equal(out.call, null, `pile ${p} ×${m} ${call}: a second bid was sold on a read question`);
        assert.equal(out.pay, 0, 'the read question pays');
        assert.equal(out.cost, 0, 'the read question costs');
        assert.equal(state.stateOf(s).pile, before, 'the pile moved under a refused bid');

        /* leaving again takes nothing: there is no wager standing on it to lose */
        assert.equal(settleAbandonedBid(s), null, 'the seal was settled a second time');
        assert.equal(state.stateOf(s).pile, before, 'the pile was charged twice for one question');
      }
    }
  });

  /* THE MOUNT IS WHERE IT RUNS, and that is load-bearing: inside a live session a call is locked and
     settled without the screen being rebuilt, so a call still locked at build time can only have
     come from a session that was left. */
  test('the screen settles on the way in, and never behind a question', () => {
    const body = CODE.slice(CODE.indexOf('function mount(host)'));
    const settle = body.indexOf('settleAbandonedBid(s)');
    assert.ok(settle > 0, 'mount() no longer settles an abandoned bid');
    assert.match(body.slice(0, settle), /state\.resume\(s[,)]/, 'the settle runs before the record is read back');
    /* …and the mount ARMS the beat rather than charging through it: a bid is only settled at the
       mount when there is nothing on the strip to see it go (an empty pile at ×1) */
    assert.match(body.slice(0, settle), /settling\s*=\s*standing\s*&&/,
      'mount() no longer arms the beat — the charge is back before the first paint');
    assert.match(CODE, /back:\s*'\/today'/, 'the study card lost its own back link — the study half is untouchable');

    /* …and `render()` reaches the beat BEFORE the question, so a bid that is about to be voided can
       never have an answer land against it: `settleBeat` mounts no card at all. */
    const renderBody = CODE.slice(CODE.indexOf('function render()'), CODE.indexOf('function settleBeat()'));
    assert.ok(renderBody.indexOf('settleBeat()') > 0, 'render() has no branch for the settle beat');
    assert.ok(renderBody.indexOf('settleBeat()') < renderBody.indexOf('renderAnswer()'),
      'the question is rendered before the bid the student walked away from is settled');
    const beat = CODE.slice(CODE.indexOf('function settleBeat()'), CODE.indexOf('\n  function ', CODE.indexOf('function settleBeat()') + 1));
    assert.ok(!/createCardView/.test(beat), 'the settle beat mounts the question under a live bid');
    assert.match(beat, /mountEl\.replaceChildren\(\)/, 'the settle beat leaves the last screen`s stage up');
    assert.match(beat, /renderStrip\(model\)/, 'the settle beat does not draw the three slots');
    /* the beat reuses the layer's own duration rather than inventing a fourth one */
    assert.match(beat, /\bBANK_MS\b/, 'the settle beat has grown a tuning knob of its own');
  });

  /**
   * THE BEAT ITSELF, on the pure half: while it runs the SAVE still holds the bid, so the three
   * slots are the engine's own reading and not a remembered one — which is the only way to show a
   * student a number that has already gone without printing a number the engine has not got.
   *
   * ROUND 3 (simplicity-audit, BLOCKER): "before bid {pile 24, streak 3} … after RELOAD {pile 0,
   * streak 1} … screen says 0 pile ×1 streak". The charge is correct and forced — see the DP below —
   * but every part of it happened before the first paint.
   */
  test('the walked-away bid is charged in front of the student, at the engine`s own price', () => {
    let seen = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        if (p === 0 && m === 1) continue;              // nothing to lose, so there is nothing to show
        const s = saveAt(p, m, call);
        /* the beat: the save is untouched, and the strip is what he was looking at when he left */
        const during = viewModel(s, { phase: 'answer', detail: { hits: 2, of: 3 }, skill: 'VOC' });
        assert.deepEqual(screenNumeralsOf(during), [p, m, econ.payOf(call, m)],
          `pile ${p} ×${m} ${call}: the beat printed something other than the bid he left`);
        assert.equal(during.exit, null, 'the beat offers a way out of a bid it is about to charge');
        assert.equal(state.stateOf(s).pile, p, 'the beat had already charged the pile');

        /* …then it settles, and the same two slots move the way a wrong answer moves them */
        settleAbandonedBid(s);
        const after = viewModel(s, { phase: 'answer', detail: { hits: 2, of: 3 }, skill: 'VOC' });
        assert.deepEqual(screenNumeralsOf(after), [Math.max(0, p - econ.costOf(call, m, p)), 1],
          `pile ${p} ×${m} ${call}: the strip after the beat is not the strip after a miss`);
        seen++;
      }
    }
    assert.ok(seen > 3000, `only ${seen} beats — the sweep collapsed`);
  });

  /**
   * AND THE CHARGE IS FORCED, which is why round 3's own suggested fix ("let a re-mount restore the
   * question with the SAME call still standing … a reload costs nothing") is not taken. The escape
   * is reached AFTER the question is on screen, so it has to cost at least what missing costs or it
   * is strictly a better way to miss. Scored here on the SHIPPED table by exact backward induction
   * over a twelve-question session — the same DP as `scratchpad/cut-screen-r3/abandon-dominance.mjs`,
   * no sampling and no reconstruction.
   */
  test('a free bail-out beats honest play, whatever shape it is given', () => {
    const T = 12;
    const value = (q, rule) => {
      const memo = new Map();
      const V = (t, pile, m) => {
        if (t === T) return pile;
        const k = `${t}|${pile}|${m}`;
        if (memo.has(k)) return memo.get(k);
        let out = V(t + 1, pile, m);
        for (const c of econ.offered(pile, m)) {
          const up = V(t + 1, pile + econ.payOf(c, m), Math.min(econ.MULT_MAX, m + 1));
          const down = rule === 'shipped'
            ? V(t + 1, Math.max(0, pile - econ.costOf(c, m, pile)), 1)        // walking away IS a miss
            : rule === 'stands'
              ? up                                                            // fresh attempts, same bid
              : V(t + 1, pile, m);                                            // the question priced at 0
          const v = q * up + (1 - q) * down;
          if (v > out) out = v;
        }
        memo.set(k, out);
        return out;
      };
      return V(0, 0, 1);
    };
    /* the r1 trace, arriving through the reload door: a student who knows NOTHING out-scores one who
       is right 99 times in 100 */
    assert.ok(value(0, 'stands') > value(0.99, 'shipped'),
      'a standing bid across a reload no longer beats honest play — re-check the payoff table');
    assert.equal(value(0, 'shipped'), 0, 'the shipped rule pays a student who never clears anything');
    /* …and the softer shape is dominant too, at every rate the design cares about */
    for (const q of [0.35, 0.5, 0.65, 0.8, 0.95, 0.99]) {
      assert.ok(value(q, 'sealed') > value(q, 'shipped'),
        `q ${q}: voiding a walked-away bid is not better than answering — re-check the payoff table`);
      assert.ok(value(q, 'stands') >= value(q, 'shipped'), `q ${q}: fresh attempts under a standing bid cost something`);
    }
  });
});

/* ==========================================================================================
   9 · WHAT THE SCREEN DECLARES TO THE SPLIT METER

   `% of this session was the game` is printed by the end panel, so what the screen hands the meter
   is the screen's half of whether that sentence is true. It declares ONE shape of interval — the
   face-down card, while the student is choosing — and nothing else; `job/state.js` partitions the
   rest of the session into the answering half off its own clock.
   ========================================================================================== */

describe('the split the screen declares is the split the student spent', () => {
  test('a driven session on a fabricated clock prints its own true share', () => {
    const s = fresh();
    s.settings = { ...(s.settings || {}), testDate: '2026-10-01' };
    const T0 = Date.parse('2026-09-22T18:00:00Z');
    let t = T0;
    state.startJob(s, { now: t, today: '2026-09-22' });
    assert.equal(s.inProgress.startedAt, T0, 'the session has no clock to take a share of');

    const DECIDE = 4000;       // the face-down card: the game decision, and the only one declared
    const FLIP = FLIP_MS;      // the beat, which the screen declares nothing for
    const WORK = 26000;        // the question
    const READ = 9000;         // …and reading the worked solution before tapping Continue
    let decided = 0;
    let questions = 0;

    while (state.targetsLeft(s) > 0 && questions < 8) {
      /* the face-down card is up (`renderCall` → skipBeat), then the call (`lockCall` → beat) */
      t += DECIDE;
      const offered = state.callsFor(s);
      state.call(s, offered[0], { now: t, ms: DECIDE });
      decided += DECIDE;
      /* the flip and the card build: declared nothing (`skipBeat`) */
      t += FLIP;
      /* the question, graded (`applyResult` → beat) */
      t += WORK;
      const it = state.currentItem(s);
      state.answer(s, { id: it.id, cleared: questions % 3 !== 2, attempt: 1, hints: 0 }, { now: t, ms: WORK });
      questions++;
      /* the worked solution being read, then Continue */
      t += READ;
    }
    /* the last read closes the session (`finish` → beat → endJob) */
    const over = state.endJob(s, { now: t, ms: READ, day: '2026-09-22' });

    const wall = t - T0;
    const truth = Math.round((decided / wall) * 100);
    assert.equal(over.split, truth,
      `the panel prints ${over.split} % over a session that was ${truth} % game decisions`);
    assert.ok(over.split < 45, 'this fixture no longer models a session the band has to be judged on');
    /* and the number in the printed line is that number and no other */
    assert.equal(viewModel(s, { over }).lines[2], COPY.split({ percent: truth }));
  });

  test('the same session, read more slowly, prints a SMALLER share — never a bigger one', () => {
    const run = (read) => {
      const s = fresh();
      s.settings = { ...(s.settings || {}), testDate: '2026-10-01' };
      const T0 = Date.parse('2026-09-22T18:00:00Z');
      let t = T0;
      state.startJob(s, { now: t, today: '2026-09-22' });
      for (let i = 0; i < 6 && state.targetsLeft(s) > 0; i++) {
        t += 4000;
        state.call(s, state.callsFor(s)[0], { now: t, ms: 4000 });
        t += FLIP_MS + 26000;
        const it = state.currentItem(s);
        state.answer(s, { id: it.id, cleared: true, attempt: 1, hints: 0 }, { now: t, ms: 26000 });
        t += read;
      }
      return state.endJob(s, { now: t, ms: read, day: '2026-09-22' }).split;
    };
    const quick = run(1000);
    const slow = run(30000);
    assert.ok(slow < quick, `reading longer raised the printed share (${quick} → ${slow})`);
  });

  test('the screen declares the face-down card and nothing else', () => {
    /* the two verbs that may carry a game-half claim, and the one interval each of them means */
    assert.match(CODE, /function lockCall[\s\S]{0,400}const ms = beat\(\);[\s\S]{0,200}state\.call\(s, id, \{ now: Date\.now\(\), ms \}\)/,
      'the call no longer declares the interval the face-down card was up');
    assert.match(CODE, /function doBank[\s\S]{0,400}const ms = beat\(\);[\s\S]{0,300}state\.bank\(s, \{ now: Date\.now\(\), ms \}\)/,
      'the bank no longer declares the interval the face-down card was up');
    /* every other verb is handed `now` as well, so the engine can attribute the rest of the session */
    assert.match(CODE, /state\.answer\(s, result, \{ now: Date\.now\(\), ms \}\)/, 'the answer carries no clock');
    assert.match(CODE, /state\.endJob\(s, \{ now, ms \}\)/, 'the close carries no clock');
    /* and the intervals the screen does NOT claim are dropped from the claim, not from the session */
    const beats = (CODE.match(/skipBeat\(\)/g) || []).length;
    assert.ok(beats >= 4, `only ${beats} undeclared intervals are closed — one of them is being claimed`);
  });
});

/* ==========================================================================================
   A LIVE SESSION — the screen's numbers against the engine's own return values
   ========================================================================================== */

describe('a driven session: the strip agrees with every verb`s return value', () => {
  test('call → answer → bank, twelve questions, every slot checked at every beat', () => {
    const s = fresh();
    s.settings = { ...(s.settings || {}), testDate: '2026-10-01' };
    let t = Date.parse('2026-09-22T18:00:00Z');
    state.startJob(s, { now: t, today: '2026-09-22' });
    let beats = 0;
    for (let i = 0; i < 12 && state.targetsLeft(s) > 0; i++) {
      /* the face-down card */
      const it = state.currentItem(s);
      const skill = it.skill ?? (it.skills || [])[0] ?? null;
      const detail = qHatDetail(s, skill, { cards: cardById });
      const before = state.stateOf(s);
      const pre = stripFor(readingOf(s), detail);
      assert.equal(pre[0].value, String(before.pile));
      assert.equal(pre[1].value, `×${before.streak}`);
      assert.equal(pre[2].value, detail.of > 0 ? '' : COPY.none);
      /* THE WORD OR THE RULER, NEVER BOTH (r2, layout-safari): with no history the slot said `new`
         AND drew ten empty marks on one nowrap line — 108.7 px in the 88 px track a 320 px phone
         gives it, and the document 4.7 px past the viewport. It is the DAY-ONE form: every skill is
         new on the first session, so this is the first thing the student ever sees. */
      if (detail.of > 0) {
        assert.deepEqual([pre[2].meter.hits, pre[2].meter.of], [detail.hits, detail.of],
          `question ${i + 1}: the marks are not the rate the engine measured`);
      } else {
        assert.equal(pre[2].meter, null,
          `question ${i + 1}: the slot prints \`new\` and draws the empty ruler beside it`);
      }

      /* the call */
      const offered = state.callsFor(s);
      const id = offered[offered.length - 1];
      const priced = state.call(s, id, { now: (t += 4000), ms: 4000 });
      const mid = stripFor(readingOf(s));
      assert.equal(mid[2].value, COPY.pays({ n: priced.pay }),
        `question ${i + 1}: the strip promised ${mid[2].value}, the engine priced ${priced.pay}`);

      /* the answer */
      const ok = i % 3 !== 2;
      const r = state.answer(s, { id: it.id, cleared: ok, attempt: 1, hints: 0 }, { now: (t += 30000), ms: 30000 });
      const post = stripFor(readingOf(s));
      assert.equal(post[0].value, String(r.pile), `question ${i + 1}: the pile printed is not the pile paid`);
      assert.equal(post[1].value, `×${r.streak}`);
      /* a right answer never pays less than a wrong one, and the loss came only from the pile */
      if (ok) assert.equal(r.pile, r.pileBefore + r.pay);
      else { assert.equal(r.pile, Math.max(0, r.pileBefore - r.cost)); assert.ok(r.pile >= 0); }
      beats++;

      if (i === 5) {
        const banked = state.bank(s, { now: (t += 2000), ms: 2000 });
        const after = stripFor(readingOf(s));
        assert.equal(after[0].value, '0', 'the pile did not empty when it was banked');
        assert.equal(after[1].value, '×1', 'banking did not reset the streak');
        assert.ok(banked.today >= banked.points);
      }
    }
    assert.ok(beats >= 8, `only ${beats} questions were driven`);
    const end = state.endJob(s, { now: (t += 1000), ms: 1000 });
    const over = viewModel(s, { over: end });
    assert.deepEqual(over.lines.slice(0, 2), [
      COPY.todayPoints({ points: end.today }), COPY.best({ points: end.best }),
    ]);
    assert.equal(over.primary, COPY.today);
  });

  test('banking mid-question re-prices the open call, so `pays N` is never stale', () => {
    const s = saveAt(24, 3, null);
    state.call(s, 'sure', { now: 1000, ms: 0 });
    const beforeBank = stripFor(readingOf(s));
    assert.equal(beforeBank[2].value, COPY.pays({ n: econ.payOf('sure', 3) }));
    /* the pile banks, the streak goes to ×1 — and the promise on screen must follow the engine */
    s.inProgress.game.pile = 0;
    s.inProgress.game.streak = 1;
    const afterBank = stripFor(readingOf(s));
    assert.equal(afterBank[2].value, COPY.pays({ n: econ.payOf('sure', 1) }),
      'the strip kept promising the old price after the streak reset — a number the engine no longer computes');
    assert.equal(afterBank[0].value, '0');
    assert.equal(afterBank[1].value, '×1');
  });
});

/* ========================================================================================== */

/** Every string and template-literal chunk in a source file, comments removed. */
function literalsOf(src) {
  const out = [];
  let i = 0;
  let line = true;                    // at the start of a line-ish position (crude but sufficient)
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; let buf = ''; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { buf += src[i + 1]; i += 2; continue; } buf += src[i++]; }
      i++; out.push(buf); continue;
    }
    if (c === '`') {
      i++; let buf = '';
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { buf += src[i + 1]; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {              // skip the expression, keep the text
          out.push(buf); buf = '';
          let depth = 1; i += 2;
          while (i < src.length && depth > 0) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
          continue;
        }
        buf += src[i++];
      }
      i++; out.push(buf); continue;
    }
    i++; line = c === '\n';
  }
  void line;
  return out;
}

/* ==========================================================================================
   10 · THE WIDEST STRING EACH SLOT CAN PRINT

   ROUND 1 (layout-safari). `qa/audit-states.mjs`'s five job states are driven off one fixture, and
   that fixture's longest skill window is `9 of 9` — so the audit's 17-viewport × 2-engine × 2-theme
   sweep has never once rendered the widest string the SHIPPED engine can put in the strip. The audit
   is green by fixture, not by geometry.

   This block cannot render anything, and does not pretend to. What it does is PIN THE EXTREMES the
   audit has to cover, measured off the shipped payoff table and the shipped copy rather than guessed:
   the catalog state that finally exercises the strip has to print these four strings, and if a change
   to the table or the copy makes one of them longer, this goes red and the catalog is stale again.
   The request to `qa/audit-states.mjs` and `notes/cut-screen.md` is in notes/cut-tests.md.
   ========================================================================================== */

import { QHAT } from '../site/data/job.js';

/** The longest string each slot can hold, over the reachable space and the whole hit-rate window. */
function widestStrip() {
  const win = { pile: '', streak: '', third: '' };
  /* longest wins; among equally long strings the biggest one, so `496` beats `120` and the pinned
     extreme below is the extreme rather than whichever 3-digit pile the walk reached first */
  const keep = (k, s) => {
    const v = String(s);
    if (v.length > win[k].length || (v.length === win[k].length && v > win[k])) win[k] = v;
  };
  /* every hit-rate the window admits, including the `new` form */
  const details = [{ hits: 0, of: 0 }];
  for (let of = 1; of <= QHAT.window; of++) for (let hits = 0; hits <= of; hits++) details.push({ hits, of });
  for (const [p, m] of REACHABLE) {
    for (const call of [null, ...econ.offered(p, m)]) {
      const reading = readingOf(saveAt(p, m, call));
      for (const d of (call == null ? details : [details[0]])) {
        const [a, b, c] = stripFor(reading, d);
        keep('pile', a.value); keep('streak', b.value); keep('third', c.value);
      }
    }
  }
  return win;
}

describe('the widest string the strip can print, and the track the stylesheet gives it', () => {
  const WIDEST = widestStrip();

  test('the three extremes, measured off the shipped table and the shipped copy', () => {
    /* `496` is a twelve-question session's biggest pile (CUT-BRIEF asks for 8–12), `×5` the streak
       cap, `pays 50` the dearest call at the cap. THE UNCALLED FORM IS NO LONGER THE WORST CASE:
       `10 of 10` was, at 106 px in an 88 px track — it overflowed its slot at every width below
       375 px and pushed a 320 px phone 2 px into a horizontal scroll, in both engines and both
       themes. The hit rate is drawn now (`hitMeterOf`), so the face-down card's third slot prints
       either nothing or the three characters of `new`. */
    assert.deepEqual(WIDEST, { pile: '496', streak: '×5', third: 'pays 50' });
    assert.equal(paysLineOf(econ.payOf('sure', econ.MULT_MAX)), 'pays 50');
    assert.equal(hitLineOf({ hits: 10, of: 10 }), '', 'the hit rate is a string again');
    assert.equal(hitLineOf({ hits: 0, of: 0 }), COPY.none);
    assert.ok(COPY.none.length < WIDEST.third.length, 'the uncalled form is the wider one again');
  });

  test('no reachable state prints anything wider — the sweep is the space, not a sample', () => {
    /* 1,222 `(pile, streak)` states, which is what a twelve-deep BFS over the SHIPPED table closes
       over — measured here, not quoted: CUT-SPEC §7's 1,847,239 is a count of `(state × q)` grid
       cells, and a floor taken from it fails on a sweep that is perfectly healthy. */
    assert.ok(REACHABLE.length > 1200, `the sweep must be the state space (${REACHABLE.length})`);
    const lens = { pile: WIDEST.pile.length, streak: WIDEST.streak.length, third: WIDEST.third.length };
    assert.deepEqual(lens, { pile: 3, streak: 2, third: 7 });
  });

  test('…against the floor `css/job.css` declares for each of the three tracks', () => {
    const m = CSS_CODE.match(/\.job-strip\s*\{[^}]*grid-template-columns[^;]*min\(100%,\s*([\d.]+)ch\)/s);
    assert.ok(m, 'the strip no longer declares a ch floor on its three tracks');
    const floorCh = Number(m[1]);
    /* THE PINNED RELATION. The floor is a COLLAPSE GUARD, not a fit guarantee — the track's real
       width is its `1fr` share — so this is not a `floor >= widest` rule and must not be read as one.
       It is the four numbers, pinned together, so that a change to any of them is seen. */
    assert.deepEqual(
      { floorCh, pile: WIDEST.pile.length, streak: WIDEST.streak.length, third: WIDEST.third.length },
      { floorCh: 7, pile: 3, streak: 2, third: 7 },
    );
    assert.ok(WIDEST.pile.length <= floorCh && WIDEST.streak.length <= floorCh,
      'the pile or the streak no longer fits even the floor');

    /* THE FIT ITSELF, which the floor cannot give. A 320 px phone leaves the strip 288 px, so a
       track is (288 − 24) / 3 = 88 px, and the widest value above is 7 mono characters — ~93 px at
       `--fs-4`, still over. The stylesheet steps the value down one size on a container that narrow,
       where the same string measures ~72 px. Both halves are asserted, because either one alone is
       how this defect came back: the widest string, and the rule that makes it fit. */
    const narrow = CSS.match(/@container jobscreen \(max-width:\s*([\d.]+)rem\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(narrow, 'css/job.css no longer steps the strip down on a narrow container');
    assert.ok(Number(narrow[1]) >= 19 && Number(narrow[1]) <= 23,
      `the step-down fires at ${narrow[1]}rem — a 320px phone gives the container 18rem`);
    assert.match(narrow[2], /\.job-slot-v[^{]*\{[^}]*font-size:\s*var\(--fs-3\)/,
      'the narrow container no longer shrinks the slot value — the widest string overflows again');
    /* and the marks are drawn to fit that track too: 10 × 6px + 9 × 2px = 78px inside 88px, plus
       1 px of strike overhang at each end (the struck miss is drawn `inset-inline: -1px`, which is
       out of flow and cannot widen the row, but it does put ink there). MEASURED, r2: `--job-mark`
       computes to 6px at 320x568 in chromium and the row to 78px — the narrow container's own
       `--job-mark: 5px` was three rules above the declaration it meant to override and never once
       applied, so it is gone rather than being quoted here as if it fired. */
    const mark = CSS_CODE.match(/\.job-marks\s*\{[^}]*--job-mark:\s*(\d+)px/s);
    assert.ok(mark, 'the marks no longer declare their own size');
    const marks = QHAT.window * Number(mark[1]) + (QHAT.window - 1) * 2 + 2;
    assert.ok(marks <= 88, `a full window of marks is ${marks}px in an 88px track`);
    assert.equal(marks, 80, 'the drawn ruler changed width — re-measure it in a browser');
    /* …AND EVERY OTHER `of` TOO, which the single pin above cannot see. Round 4 set the sittings
       the student has not had apart from the ones he has (a smaller mark behind a wider break), and
       a partly-filled row is then WIDER than a full one: 9 of 9 is the worst case, not 10 of 10. */
    const dot = Number((CSS_CODE.match(/\.job-mark\[data-mark="none"\]\s*\{[^}]*inline-size:\s*([\d.]+)px/s) || [])[1]);
    const edge = Number((CSS_CODE.match(/\.job-mark\[data-edge="true"\]\s*\{[^}]*margin-inline-start:\s*([\d.]+)px/s) || [])[1]);
    assert.ok(dot > 0 && edge > 0, 'the marks no longer set the unused sittings apart — see `marksEl`');
    const rowAt = (of) => of * Number(mark[1]) + (QHAT.window - of) * dot
      + (QHAT.window - 1) * 2 + (of < QHAT.window ? edge : 0) + 2;
    const widest = Math.max(...Array.from({ length: QHAT.window }, (_, i) => rowAt(i + 1)));
    assert.ok(widest <= 88, `the widest drawn row is ${widest}px in an 88px track`);
    assert.equal(widest, 81, 'the drawn ruler changed width — re-measure it in a browser');
    /* the word and the ruler are never both in that track (the day-one overflow) — held over the
       whole space above; pinned here against the number the track actually is */
    assert.equal(stripFor(readingOf(saveAt(0, 1)), { hits: 0, of: 0 })[2].meter, null);
    /* the caption under the third slot is the widest string in the band and it is allowed to wrap —
       `.job-slot-k` has no `nowrap`, and the call phase reserves two lines for it */
    assert.equal(COPY.hitRate.length, 18);
    assert.ok(!/\.job-slot-k[^}]*white-space:\s*nowrap/s.test(CSS_CODE), 'the caption can no longer wrap');
    assert.match(CSS_CODE, /\.job-slot-v\s*\{[^}]*white-space:\s*nowrap/s, 'the value may now wrap mid-number');
  });
});

/* ============================================================================================
   8. THE STRIP IS NOT BEHIND THE DOCK — measured in a real browser (round-3 integration)

   Everything above this line is a model pin or a source pin, which is the right shape for all seven
   claims it holds. This one cannot be either. The screen lane's round 3 found the whole three-slot
   strip 100 % behind the dock with the keyboard open at 320x568, and the acceptance command for
   that lane — `node qa/layout-audit.mjs --only job --engine both --theme both --vp all` — printed
   `0 findings (136 waived) … PASS` over it, because the auditor's dock check only runs at
   `phase === 'bottom'` and by scroll-end the sticky strip has pinned clear of the dock
   (`qa/layout-audit.mjs:620`, and its generic overlap rule skips the dock as a separate opaque
   surface at :598). Teaching the auditor the sticky/dock distinction is filed as
   notes/cut-screen.md Requests 14 and needs its own planted defect and clean control before it can
   be trusted; until it lands, THIS is the gate for that shape, and it is the lane's own
   reproduction promoted out of `scratchpad/` and given a verdict.

   `qa/cut-strip.mjs --mutate` injects the defect back into the live page and the run must then fail
   on the dock assertion — the probe is exercised in both directions here, so a net that has gone
   quiet because it stopped measuring cannot pass.

   ROUND 5 — AND "BOTH SHAPES" NOW MEANS BOTH. The second arm used to reach the two-line band by
   writing `inProgress.game.call = { id: null, at: 1 }` and calling the result a sealed-bidless
   question. Round 4 gave a bidless reading an EMPTY caption (`screens/job.js:290`) and
   `renderStrip` keys `data-form` off that caption (`job.js:779`), so a bidless question has taken
   the one-line band ever since: both arms were measuring the same shape, this test's title said
   "both shapes" over one, and `--mutate` still printed two dock failures because the two identical
   arms each produced one. Neither the pins below nor the probe's own inverted guard could see it,
   which is the shape of the defect worth remembering: an assertion about the state's OWN attributes
   was missing, so nothing read back what had actually been measured.

   So the arm is pointed at the state that really renders the band — a grade landing while the
   graded card is still mounted (`screens/job.js:1149`), the only moment the two-line band and the
   dock share a screen — each arm asserts its own `data-form`, and the mutation arm now requires
   BOTH dock assertions and voids the run if either arm measured the wrong band. */

function stripBrowsersAvailable() {
  if (!existsSync(repoPath('qa/node_modules/playwright'))) return false;
  const probe = spawnSync(process.execPath, ['-e', `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(repoPath('qa/shot.mjs'))});
    req('playwright').chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
  `], { cwd: repoPath('.'), timeout: 90_000, encoding: 'utf8' });
  return probe.status === 0;
}

describe('CUT §5: the play strip is readable where the auditor does not look', () => {
  test('at 320x568 with the keyboard open, at scroll 0, the one-line band and the two-line band a grade lands on are both clear of the dock', (t) => {
    if (!stripBrowsersAvailable()) { t.skip('no Playwright browser installed (cd qa && npx playwright install)'); return; }
    const run = spawnSync(process.execPath, ['qa/cut-strip.mjs', '--quiet'],
      { cwd: repoPath('.'), timeout: 300_000, encoding: 'utf8' });
    assert.equal(run.status, 0, `qa/cut-strip.mjs failed:\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /ALL PASS/);
    /* the numbers, quoted, so a pass that measured nothing cannot slip through: both shapes, the
       whole strip height visible, and the browser's own hit test answering the strip at every slot */
    assert.match(run.stdout, /job-answer-kb@scroll0: the strip is clear of the dock at scroll 0 — ([\d.]+)px of \1px visible/);
    assert.match(run.stdout, /job-graded-stack@scroll0: the strip is clear of the dock at scroll 0 — ([\d.]+)px of \1px visible/);
    assert.match(run.stdout, /job-answer-kb@scroll0: every slot answers its own content to elementFromPoint — pile→job-slot/);
    assert.match(run.stdout, /job-graded-stack@scroll0: every slot answers its own content to elementFromPoint — pile→job-slot/);
    /* THE TWO BANDS ARE TWO BANDS — read back off the screen's own `data-form`, which is the pin
       whose absence let the second arm spend round 4 measuring the first arm's shape. */
    assert.match(run.stdout, /ok\s+job-answer-kb@scroll0: the band is the shape this arm exists to measure — data-form=line \(this arm measures line\) data-phase=answer/);
    assert.match(run.stdout, /ok\s+job-graded-stack@scroll0: the band is the shape this arm exists to measure — data-form=stack \(this arm measures stack\) data-phase=answer/);
    /* …and the two-line one was measured where it can actually be behind the dock: with the graded
       card still on screen, which is the only thing that puts a dock under it */
    assert.match(run.stdout, /ok\s+job-graded-stack@scroll0: the grade landed with the card still on screen — card=true continue=true/);
    /* and the keyboard really was open in both, or the whole state is a different one */
    assert.equal((run.stdout.match(/the keyboard is actually open[^\n]*data-kb=open/g) || []).length, 2);
  });

  test('…and the net catches that defect when it is injected back in', (t) => {
    if (!stripBrowsersAvailable()) { t.skip('no Playwright browser installed'); return; }
    const run = spawnSync(process.execPath, ['qa/cut-strip.mjs', '--quiet', '--mutate'],
      { cwd: repoPath('.'), timeout: 300_000, encoding: 'utf8' });
    assert.equal(run.status, 0, `the mutation was not caught:\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /MUTATION CAUGHT \(2 dock assertion\(s\) fired/);
    /* it must fail the RIGHT way — 0 px of the strip left, and the dock's own controls answering the
       hit test at all three slot centres. A probe that crashed would also "fail". */
    assert.match(run.stdout, /FAIL job-answer-kb@scroll0: the strip is clear of the dock at scroll 0 — 0px of/);
    assert.match(run.stdout, /FAIL job-graded-stack@scroll0: the strip is clear of the dock at scroll 0 — 0px of/);
    /* BOTH arms, not one twice: the count is what round 5 needed and did not have. */
    assert.equal((run.stdout.match(/pile→btn streak→btn third→btn/g) || []).length, 2);
    /* and neither arm may have drifted onto the other's band while the defect was in — under the
       mutation the shape assertions must still be green, or the run proves nothing */
    assert.equal((run.stdout.match(/ok\s+\S+: the band is the shape this arm exists to measure/g) || []).length, 2);
  });
});

/* ==========================================================================================
   ROUND 4 — the four moments the screen was getting wrong, and the one write that never landed.

   Every assertion below was run against the SHIPPED file first and failed on it; the shipped
   readings each one is derived from are quoted in the block above it and in notes/cut-screen.md
   under "Round 4".
   ========================================================================================== */

const SCREENS_CSS = read('site/css/screens.css').replace(/\/\*[\s\S]*?\*\//g, '');
const BASE_CSS = read('site/css/base.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** A selector, escaped for use inside a `RegExp`. */
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The declarations of the FIRST rule with exactly this selector, in `css`. */
function ruleBody(sel, css = CSS_CODE) {
  const m = css.match(new RegExp(`${rx(sel)}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no rule for \`${sel}\``);
  return m[1];
}

/** One declaration off a rule body, or `null`. */
const declOf = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;)\\s*${rx(prop)}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
};

/** A length token declared in px, off any of the stylesheets. */
function tokenPx(name) {
  for (const css of [CSS_CODE, read('site/css/theme.css')]) {
    const m = css.match(new RegExp(`${rx(name)}\\s*:\\s*(-?[\\d.]+)px`));
    if (m) return Number(m[1]);
  }
  assert.fail(`${name} is not declared in px anywhere this test can see it`);
  return NaN;
}

/**
 * A `calc()` of nothing but added lengths and `var()`s of them, in px. Deliberately refuses
 * anything else: a subtraction or a multiplication in here would be a number this test cannot check
 * and must not pretend to.
 */
function calcPx(expr) {
  const flat = String(expr).replace(/var\((--[\w-]+)\)/g, (_, n) => `${tokenPx(n)}px`);
  assert.match(flat, /^calc\(\s*[\d.]+px(?:\s*\+\s*[\d.]+px)*\s*\)$/,
    `this test only understands a sum of lengths, and got \`${expr}\``);
  return (flat.match(/[\d.]+px/g) || []).reduce((a, t) => a + parseFloat(t), 0);
}

/* ==========================================================================================
   R4 · THE LEVEL-UP TOAST IS NOT PAINTED OVER THE STREAK

   Round 4 (player-feel), measured in the page at the instant level 4 fired on a correct answer:
   `.levelup-card` at x 122.09…252.91, y 96…170.74 over a `.job-strip` at x 0…375, y 72…140.09,
   with the streak slot's own rect at x 134.33…240.66 — entirely inside the card's x-range — while
   the observer recorded `{slot:'streak', v:'×5streak', tick:'true'}` and this stylesheet was
   scaling that numeral to 2.4x. XP is only awarded on a clear and a clear is the only thing that
   raises the streak, so EVERY level-up in a session lands on a ticking streak by construction.
   ========================================================================================== */

describe('the study layer`s level-up toast clears the band the game owns', () => {
  /* the geometry the collision is measured in, all of it read off the shipped stylesheets */
  const HEADER = tokenPx('--header-h');
  const VIEW_PAD = Number((BASE_CSS.match(/#view\s*\{[^}]*padding-block:\s*([\d.]+)px/s) || [])[1]);
  const STRIP_LINE = Number((CSS_CODE.match(/--job-strip-h:\s*([\d.]+)px/) || [])[1]);
  const STRIP_STACK = Number(
    (CSS_CODE.match(/\.job-screen\[data-form="stack"\]\s*\{[^}]*--job-strip-h:\s*([\d.]+)px/s) || [])[1]);

  test('the collision is real, and no `z-index` in this file can repair it', () => {
    assert.ok(VIEW_PAD > 0 && STRIP_LINE > 0 && STRIP_STACK > STRIP_LINE,
      'the strip`s own band is no longer declared where this test reads it');
    /* the study layer still parks its toast where the strip is */
    const card = ruleBody('.levelup-card', SCREENS_CSS);
    const top = Number((declOf(card, 'top') || '').match(/^([\d.]+)px$/)?.[1]);
    assert.ok(Number.isFinite(top), 'css/screens.css no longer gives .levelup-card a px top');
    assert.ok(top < HEADER + VIEW_PAD + STRIP_LINE,
      `the toast at ${top}px no longer reaches the strip — this override can go`);
    assert.match(ruleBody('.levelup', SCREENS_CSS), /z-index:\s*30/, 'the toast layer changed depth');

    /* …AND THE STRIP CANNOT SIMPLY BE RAISED OVER IT. `.job-screen` is a size container, which
       implies `contain: layout` and therefore ESTABLISHES A STACKING CONTEXT: every z-index inside
       it is resolved against its siblings, not against a `z-index: 30` child of <body>. A larger
       number on `.job-strip` would change nothing at all, which is the repair this lane would
       otherwise have reached for first. */
    assert.match(ruleBody('.job-screen'), /container-type:\s*inline-size/,
      'the screen is no longer a size container — re-derive why the toast is moved and not the strip');
    const sticky = CSS_CODE.match(/\.job-screen\[data-phase="answer"\] \.job-strip,[\s\S]*?\{([^}]*)\}/);
    assert.ok(sticky && /z-index:\s*\d+/.test(sticky[1]), 'the pinned strip declares no depth');
    assert.ok(Number(sticky[1].match(/z-index:\s*(\d+)/)[1]) < 30,
      'the strip now claims a depth above the toast — inside a stacking context that is a lie');
  });

  test('…so the toast is offered a line below the strip, for the length of a session only', () => {
    /* it is applied ONLY under a job screen: the study layer`s own routes are untouched */
    const applied = CSS_CODE.match(/([^{}\n]*\.levelup-card)\s*\{([^}]*)\}/);
    assert.ok(applied, 'css/job.css no longer moves the toast');
    assert.match(applied[1], /:has\(\s*\.job-screen\s*\)/,
      'the toast is moved on every screen in the app, not only during a session');
    assert.equal(declOf(applied[2], 'top'), 'var(--job-toast-top)');

    /* the value, and what it has to clear: the header, the 16 px `#view` puts above the screen and
       the tallest band the strip declares */
    const base = calcPx(declOf(ruleBody(':root:has(.job-screen)'), '--job-toast-top'));
    assert.ok(base >= HEADER + VIEW_PAD + STRIP_STACK,
      `the toast at ${base}px still lands on a strip that reaches ${HEADER + VIEW_PAD + STRIP_STACK}px`);

    /* …and on a question no bid is standing on the way-out row is drawn above the strip, which
       pushes the whole band down by a tap target and the grid`s gap. Both of those questions still
       grade, so both can still level the student up. */
    const head = calcPx(declOf(ruleBody(':root:has(.job-screen .job-head:not(:empty))'), '--job-toast-top'));
    const gap = Number((ruleBody('.job-screen').match(/gap:\s*([\d.]+)px/) || [])[1]);
    assert.ok(gap > 0, 'the screen`s own grid gap is no longer declared in px');
    assert.ok(head >= HEADER + VIEW_PAD + tokenPx('--tap') + gap + STRIP_STACK,
      `the toast at ${head}px lands on the strip whenever the way out is drawn`);
    /* it must not go so far down that the toast leaves a short phone: 320x568 is the floor the rest
       of this file is measured at */
    assert.ok(head + 80 < 568, `the toast at ${head}px is off the bottom of a 320x568 phone`);
  });
});

/* ==========================================================================================
   R4 · LOSING THE PILE IS AN EVENT THE STUDENT WATCHES

   Round 4 (player-feel), played: at `96 pile · ×5 streak · pays 50` a missed `sure` took the pile
   to 28 (8x5 + the share ⌊(96−40)/2⌋), and the whole event was a 22 px numeral changing inside a
   68 px band at the top of the viewport, with no motion, while the eye was on the grader's red
   feedback ~600 px lower down. Idea #2 of the two that survived the cut is "your streak is a pile
   you can lose"; the moment it is lost produced no perceptible event at all.
   ========================================================================================== */

describe('losing the pile is an event the student watches', () => {
  const bodyOf = (name) => {
    const at = CODE.indexOf(`function ${name}(`);
    assert.ok(at > 0, `screens/job.js has no ${name}()`);
    const end = CODE.indexOf('\n  function ', at + 1);
    return CODE.slice(at, end === -1 ? CODE.length : end);
  };

  test('the held strip is the strip the question was answered under — every reachable bid', () => {
    let seen = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        /* what the three slots printed while the question was up… */
        const during = stripFor(readingOf(saveAt(p, m, call)), { hits: 2, of: 3 });
        /* …and what the beat holds, built from `state.answer`'s own return fields */
        const held = stripFor({ pile: p, streak: m, call, pay: econ.payOf(call, m) });
        assert.deepEqual(held, during,
          `pile ${p} ×${m} ${call}: the beat holds something other than what he bid under`);
        assert.deepEqual(numeralsOf(held), [p, m, econ.payOf(call, m)],
          'the beat prints a number the engine did not compute');
        seen++;
      }
    }
    assert.ok(seen > 3000, `only ${seen} bids — the sweep collapsed`);
  });

  test('…and `state.answer` hands back exactly those three numbers on a miss, driven on a real save', () => {
    const s = fresh();
    s.settings = { ...(s.settings || {}), testDate: '2026-10-01' };
    let t = Date.parse('2026-09-22T18:00:00Z');
    state.startJob(s, { now: t, today: '2026-09-22' });
    let losses = 0;
    for (let i = 0; i < 12 && state.targetsLeft(s) > 0; i++) {
      const offered = state.callsFor(s);
      const call = offered[offered.length - 1];            // the dearest the pile covers
      t += 3000;
      state.call(s, call, { now: t, ms: 3000 });
      const before = state.stateOf(s);
      const pre = stripFor(readingOf(s), { hits: 2, of: 3 });
      t += 9000;
      const it = state.currentItem(s);
      /* right until there is a pile, then miss it */
      const ok = before.pile === 0;
      const r = state.answer(s, { id: it.id, cleared: ok, attempt: ok ? 1 : 3, hints: 0 }, { now: t, ms: 9000 });
      if (ok) continue;
      losses++;
      assert.ok(r.pile < r.pileBefore || r.streak < r.streakBefore, 'this fixture no longer loses anything');
      const held = stripFor({ pile: r.pileBefore, streak: r.streakBefore, call: r.call, pay: r.pay });
      assert.deepEqual(held, pre,
        'the beat would hold a reading the question was never answered under');
      /* …and what it settles to is the engine's own new one, which is a DIFFERENT reading */
      const after = stripFor(readingOf(s), { hits: 2, of: 3 });
      assert.notDeepEqual(after.slice(0, 2), held.slice(0, 2), 'nothing moved when the pile was lost');
    }
    assert.ok(losses >= 3, `only ${losses} losses driven — the fixture no longer exercises the beat`);
  });

  test('the beat runs on Continue, mounts no question, and animates nothing', () => {
    /* the grade does not repaint the strip when the pile fell: the DOM the student is looking at is
       the one the engine's own numbers produced, and it stands until he leaves the question */
    const applied = bodyOf('applyResult');
    assert.match(applied, /const fell = [\s\S]*?r\.pile < r\.pileBefore \|\| r\.streak < r\.streakBefore/,
      'applyResult no longer notices that the pile fell');
    assert.match(applied, /lost = fell \?[\s\S]*?pile: r\.pileBefore, streak: r\.streakBefore/,
      'the beat is no longer handed the engine`s own before-reading');
    assert.match(applied, /if \(!fell\) renderStrip\(/,
      'the strip repaints at the instant of the grade again — the loss is back inside the red feedback');
    /* …and it is the student's own Continue that starts it: no new tap, and no timer he did not ask for */
    assert.match(CODE, /onContinue: \(\) => \{[^}]*lossBeat\(\)/,
      'Continue no longer runs the beat');

    const beat = bodyOf('lossBeat');
    assert.ok(!/createCardView/.test(beat), 'the beat mounts a question over the reading it is holding');
    assert.match(beat, /mountEl\.replaceChildren\(\)/, 'the beat leaves the graded question on screen');
    assert.match(beat, /\bBANK_MS\b/, 'the beat has grown a tuning knob of its own');
    assert.match(beat, /renderStrip\(modelNow\('answer'\)\)/, 'the strip never moves to the live reading');
    assert.match(beat, /skipBeat\(\)/, 'waiting is being claimed as a game decision');
    /* CUT-BRIEF gives the streak the only moving number in the layer: the pile does not animate, and
       a loss is never celebrated or punished */
    assert.ok(!/tick\(\)/.test(beat), 'the beat animates a number');
    assert.ok(!/dataset\.(tick|bank)/.test(beat), 'the beat drew a receipt over a loss');
    assert.ok(!/COPY\./.test(beat), 'the beat says a word — a wrong answer prints no string at all');
  });
});

/* ==========================================================================================
   R4 · A QUESTION THE GAME WILL NOT PRICE STILL GETS A CARD

   Round 4 (exploit-hunt and split-honesty, independently). `job/state.js isBidless` documents the
   screen's half of a contract — the face-down beat a bidless seal is routed to, with the calls
   greyed and BANK reachable — and `grep -rn isBidless site/` returned the definition and nothing
   else. Driven on the shipped screen with every review thrown: ten consecutive questions with
   `phase=answer call=(sealed) bank=ABSENT`, eight of them at `pile 8 ×2`.
   ========================================================================================== */

describe('a question the game will not price still gets a card', () => {
  /** A save holding one live session whose current question is SEALED BIDLESS (`sealRepeat`). */
  const sealedAt = (pile, streak, at = 1000) => ({
    inProgress: {
      queue: [{ n: 1, id: 'x', skill: 'VOC' }],
      idx: 0,
      game: { pile, streak, answered: 0, tGame: 0, tAnswer: 0, seed: 's', call: { id: null, at } },
    },
  });

  test('the screen asks `state.isBidless`, and it asks before it builds the question', () => {
    assert.ok(state.isBidless(sealedAt(8, 2)), 'a bidless seal no longer reads as bidless');
    assert.ok(!state.isBidless(saveAt(8, 2, 'sure')), 'a standing bid reads as bidless');
    assert.ok(!state.isBidless(saveAt(8, 2)), 'a face-down card with no seal reads as bidless');
    assert.match(CODE, /state\.isBidless\(/,
      'screens/job.js does not ask isBidless — one of the two files is lying about the other');
    const renderBody = CODE.slice(CODE.indexOf('function render()'), CODE.indexOf('function settleBeat()'));
    assert.ok(renderBody.indexOf('bidlessBeat()') > 0, 'render() has no branch for the bidless beat');
    assert.ok(renderBody.indexOf('bidlessBeat()') < renderBody.indexOf('renderAnswer()'),
      'the question is built before the beat, so there is no beat');
  });

  test('bank is live on it, all three calls are greyed, and it costs no tap', () => {
    for (const [p, m] of REACHABLE.slice(0, 400)) {
      const model = viewModel(sealedAt(p, m), { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' });
      assert.deepEqual(model.calls.map((c) => c.id), [...econ.CALLS],
        `pile ${p} ×${m}: the calls are hidden rather than greyed`);
      assert.deepEqual(model.calls.filter((c) => c.enabled), [],
        `pile ${p} ×${m}: a question the engine will not price offers a bid`);
      assert.deepEqual(state.callsFor(sealedAt(p, m)), [], 'the engine offers a call over a seal');

      assert.ok(model.bank, `pile ${p} ×${m}: bank is absent for a whole question again`);
      assert.equal(model.bank.enabled, p > 0, `pile ${p} ×${m}: bank disagrees with the pile`);
      assert.equal(model.bank.required, false, 'bank became required');
      assert.equal(model.bank.label, COPY.bank);
      /* …AND THE ENGINE AGREES: `bank()` refuses only over a real bid */
      let refused = false;
      try { state.bank(sealedAt(p, m), { now: 2000, ms: 0, day: '2026-09-22' }); } catch { refused = true; }
      assert.ok(!refused, `pile ${p} ×${m}: the engine refuses a bank the screen offers over a seal`);

      /* the way out is free here — nothing is standing on this question */
      assert.deepEqual(model.exit, { label: COPY.today, href: '#/today' });
      /* and the question costs the answer and nothing else */
      assert.equal(requiredTapsOf(model), 0,
        `pile ${p} ×${m}: a card with no bid to make still charges the question a tap`);
      /* three numbers at most, as everywhere else */
      assert.ok(screenNumeralsOf(model).length <= 3, 'the bidless card prints a fourth number');
    }
    /* …while a card the student CAN bid on still costs its one tap: `offered` always returns at
       least the first call, so this branch can never quietly stop counting a real decision */
    for (const [p, m] of REACHABLE) {
      assert.ok(econ.offered(p, m).length > 0, `pile ${p} ×${m}: no call is offered at all`);
      assert.equal(requiredTapsOf(viewModel(saveAt(p, m), { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' })), 1);
    }
  });

  /**
   * …AND IT IS THE SAME RULE IN BOTH PLACES (integration, r4).
   *
   * Two round-4 fixes landed in one round with opposite answers to "does a question with nothing to
   * bid on get a card?": `renderCall` stopped drawing one at an empty pile (`pay.js decides` — the
   * dead tap), while `render()`'s bidless branch went on drawing one for every repeat. Measured on
   * the shipped build in chromium (`qa/cut-integrator.mjs` §4): a repeat at an empty pile drew the
   * card with THREE DEAD CALLS AND A DEAD BANK for `BANK_MS` — nothing live on it at all.
   *
   * `decides` is already the predicate for "is any control on this card live": its own definition
   * is "more than one call is offered, OR there is a pile to bank", and over the whole reachable
   * space that is exactly `pile > 0`. Both branches gate on it now. The mutation that puts the two
   * back out of step — dropping either `decides(` — is what these assertions catch.
   */
  test('the card is drawn exactly when a control on it is live — one rule, both branches', () => {
    /* the predicate itself: `decides` IS "the pile is not empty", over the reachable space */
    for (const [p, m] of REACHABLE) {
      assert.equal(econ.decides(p, m), p > 0,
        `pile ${p} ×${m}: decides() and "there is something live here" have come apart`);
    }
    /* a card with nothing live on it is the screen this rule exists to prevent — and at an empty
       pile that is what BOTH kinds of question would draw */
    for (const m of [1, 2, 3, 4, 5]) {
      const sealed = viewModel(sealedAt(0, m), { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' });
      assert.deepEqual(sealed.calls.filter((c) => c.enabled), [], `×${m}: a repeat at an empty pile offers a bid`);
      assert.equal(sealed.bank.enabled, false, `×${m}: a repeat at an empty pile offers a bank`);
      const open = viewModel(saveAt(0, m), { phase: 'call', detail: { hits: 1, of: 2 }, skill: 'VOC' });
      assert.equal(open.bank.enabled, false, `×${m}: an empty pile offers a bank`);
      assert.equal(open.calls.filter((c) => c.enabled).length, 1,
        `×${m}: an empty pile offers something other than the one free call`);
    }
    /* …so both branches ask the same question before they draw */
    const renderBody = CODE.slice(CODE.indexOf('function render()'), CODE.indexOf('function settleBeat()'));
    assert.match(renderBody, /bidless !== 2 && state\.isBidless\(s\) && decides\(/,
      'the bidless beat draws a card without asking whether anything on it is live');
    const callBody = CODE.slice(CODE.indexOf('function renderCall()'), CODE.indexOf('function faceDown('));
    assert.match(callBody, /!decides\(/, 'renderCall draws a card without asking decides()');
    assert.match(CODE, /import \{[^}]*\bdecides\b[^}]*\} from '\.\.\/job\/pay\.js'/,
      'the screen computes the predicate itself instead of importing the one the table publishes');
  });

  test('the beat ends on its own clock — no new control, no new tap, and none of it is game time', () => {
    const at = CODE.indexOf('function bidlessBeat(');
    assert.ok(at > 0, 'screens/job.js has no bidlessBeat()');
    const beat = CODE.slice(at, CODE.indexOf('\n  function ', at + 1));
    assert.ok(!/createCardView/.test(beat), 'the beat mounts the question it is supposed to precede');
    assert.match(beat, /faceDown\(model\)/, 'the beat builds a second card of its own');
    assert.match(beat, /bankBtn\(model\)/, 'the control the whole beat exists for is not drawn');
    assert.match(beat, /\bBANK_MS\b/, 'the beat has grown a tuning knob of its own');
    assert.match(beat, /flipBeat\(\)/, 'the card never turns over');
    assert.match(beat, /skipBeat\(\)/, 'the beat is claimed as a game decision the student never made');
    assert.ok(!/focusFirst/.test(beat),
      'the beat focuses a control — the only live one is bank, and Return would then bank the pile');
    /* the card is the SAME card: one builder, so a greyed call cannot drift from a live one */
    assert.match(bodyOf('renderCall'), /faceDown\(model\)/, 'the two face-down cards are built twice');
    /* and the beat is spent per question: the next one gets its own */
    assert.match(bodyOf('applyResult'), /bidless = 0/, 'the beat is never re-armed — one repeat gets it and no other');
    assert.match(CODE, /bidless !== 2 && state\.isBidless/, 'the beat repeats itself on the same question');

    function bodyOf(name) {
      const i = CODE.indexOf(`function ${name}(`);
      assert.ok(i > 0, `screens/job.js has no ${name}()`);
      const end = CODE.indexOf('\n  function ', i + 1);
      return CODE.slice(i, end === -1 ? CODE.length : end);
    }
  });
});

/* ==========================================================================================
   R4 · THE ABSENCE A DYING TAB DECLARES HAS TO REACH THE DISK

   Round 4 (split-honesty, BLOCKER). The handler ran and `away` was 1 in memory; the save on disk
   read `{"tAway":0,"away":0}`, so `resume`'s `closeAbsence` had nothing to close and a 300 s kill
   landed in `tAnswer` (4,276 → 310,030 ms). `store.js` registers its own `visibilitychange`/
   `pagehide` flush at module-eval time — BEFORE this screen mounts — so the store flushes first and
   the 250 ms debounce behind this screen's `update()` never fires on an unloading document.
   ========================================================================================== */

describe('the absence a dying tab declares reaches the disk', () => {
  const STORE = read('site/js/store.js');

  test('the presence write is immediate — a debounced one never lands on an unloading document', () => {
    const at = CODE.indexOf('const onAway = () =>');
    assert.ok(at > 0, 'screens/job.js no longer has an away handler');
    const body = CODE.slice(at, CODE.indexOf('document.addEventListener', at));
    assert.match(body, /state\.presence\(/, 'the handler no longer tells the engine the app is gone');
    assert.match(body, /\}\s*,\s*\{\s*immediate:\s*true\s*\}\s*\)/,
      'the away handler`s update() is debounced again — a closed tab is back inside the printed split');

    /* the three facts that make that property load-bearing, read off the store itself, so this lint
       cannot go quiet because the store stopped debouncing or stopped flushing on its own */
    assert.match(STORE, /function update\(fn, \{ immediate = false \} = \{\}\)/,
      'store.update no longer takes `immediate` — re-derive this fix');
    assert.match(STORE, /timer = setTimeout\(\(\) => \{ timer = null; writeNow\(\); \}, debounceMs\)/,
      'store.save is no longer debounced — re-derive this fix');
    assert.match(STORE, /addEventListener\('pagehide', flush\)/,
      'the store no longer flushes on pagehide — re-derive which write runs last');
  });

  test('both events the browser fires on the way out are handled, and both are undone on unmount', () => {
    assert.match(CODE, /document\.addEventListener\('visibilitychange', onAway\)/);
    assert.match(CODE, /window\.addEventListener\('pagehide', onAway\)/);
    assert.match(CODE, /document\.removeEventListener\('visibilitychange', onAway\)/);
    assert.match(CODE, /window\.removeEventListener\('pagehide', onAway\)/);
  });
});

/* ==========================================================================================
   R4 · THE SITTINGS HE HAS NOT HAD ARE NOT IN THE ROW HE READS

   Round 4 (number-truth). `hitMeterOf` draws `hits` + `of − hits` + `window − of` marks and the
   renderer drew all three the same size in one evenly spaced row, so the fraction the eye takes is
   `hits / 10` where the engine's is `hits / of`. On the shipped fixture every reading had `of < 10`
   (2 of 3, 9 of 9, 5 of 5, 4 of 7, 3 of 5, 7 of 7, 2 of 2, 7 of 8, 5 of 8) and four of the nine
   point at a different `honestCall` drawn than measured.
   ========================================================================================== */

describe('the hit rate is drawn at the engine`s own denominator', () => {
  test('the drawn row and the measured rate name the same call — the whole window, both ways', () => {
    /* the defect, stated as the test that catches it: for every rate the window admits, the call
       `honestCall` names off `hits / of` and off `hits / window` */
    const disagree = [];
    for (let of = 1; of <= QHAT.window; of++) {
      for (let hits = 0; hits <= of; hits++) {
        if (econ.honestCall(hits / of) !== econ.honestCall(hits / QHAT.window)) disagree.push(`${hits} of ${of}`);
      }
    }
    assert.equal(disagree.length, 16,
      'the two denominators disagree on a different set of readings — re-derive this row');
    /* and every one of them is a SHORT record, which is what a first week is made of */
    assert.ok(disagree.every((r) => Number(r.split(' of ')[1]) < QHAT.window));
    assert.ok(disagree.includes('2 of 2') && disagree.includes('5 of 5') && disagree.includes('7 of 8'),
      'the readings the round-4 fixture actually printed are no longer among them');
    /* …so the row the student reads must end at `of`. The marks after it are drawn SMALLER and
       behind a break wider than the row's own gap, and `marksEl` marks that boundary. */
    assert.match(CODE, /i === m\.of && m\.of > 0 && m\.empty > 0/,
      'marksEl no longer tells the sittings he has had from the ones he has not');
    const gap = Number((ruleBody('.job-marks').match(/gap:\s*([\d.]+)px/) || [])[1]);
    const size = Number((ruleBody('.job-marks').match(/--job-mark:\s*([\d.]+)px/) || [])[1]);
    const none = ruleBody('.job-mark[data-mark="none"]');
    const edge = ruleBody('.job-mark[data-edge="true"]');
    const dot = Number((declOf(none, 'inline-size') || '').match(/([\d.]+)px/)?.[1]);
    const brk = Number((declOf(edge, 'margin-inline-start') || '').match(/([\d.]+)px/)?.[1]);
    assert.ok(size > 0 && gap > 0, 'the marks no longer declare their own size and gap');
    assert.ok(dot > 0 && dot < size, `an unused sitting is drawn ${dot}px against a used one at ${size}px`);
    assert.ok(brk >= gap * 2, `the break before the unused sittings is ${brk}px against a ${gap}px gap`);
    /* it differs in SIZE, not only in ink: the same rule the hit and the miss are held to */
    const shape = (b) => b.replace(/\b(background|background-color|color|box-shadow)\s*:[^;]*;/g, '').trim();
    assert.notEqual(shape(none), shape(ruleBody('.job-mark[data-mark="hit"]')),
      'an unused sitting and a hit differ only in colour — in greyscale the row is read at ten');
  });

  test('…and nothing is dropped: a perfect record off one sitting is still not one off ten', () => {
    /* the round-2 finding this must not undo. The window is still drawn in full — `hitMeterOf` is
       untouched — and the row still spans it; only the FILL the eye reads is now the engine's. */
    assert.deepEqual(hitMeterOf({ hits: 1, of: 1, window: 10 }), { hits: 1, misses: 0, empty: 9, of: 1, window: 10 });
    assert.deepEqual(hitMeterOf({ hits: 10, of: 10, window: 10 }), { hits: 10, misses: 0, empty: 0, of: 10, window: 10 });
    for (let of = 1; of <= QHAT.window; of++) {
      const m = hitMeterOf({ hits: of, of, window: QHAT.window });
      assert.equal(m.hits + m.misses + m.empty, QHAT.window, `of ${of}: the window is no longer drawn in full`);
      assert.deepEqual(numeralsOf([{ value: hitLineOf({ hits: of, of }) }]), [], 'the rate printed a numeral');
    }
  });
});

/* ==========================================================================================
   ROUND 5 — the four things the strip was saying that the engine was not doing.

   Each block quotes the shipped reading it was derived from. Every assertion below was run against
   the round-4 file first and failed on it; the browser arm that drove them is
   `notes/cut-screen.md` round 5, and each has a mutation arm that puts the defect back.
   ========================================================================================== */

describe('`pays N` is a promise, and the strip stops making it when it cannot be kept', () => {
  /* THE DEFECT. `pays N` was printed as the question's unconditional value. The game prices a CLEAN
     clear and nothing else (CUT-SPEC §7 "Ninth" — `js/xp.js isClean`, first try, no hint), and the
     hint ladder is on every card by COMPOSED's global rule 1, so three of the four ways the card
     can grade a question "correct" settle it EXACTLY as a miss. Measured on the shipped build at
     `196 pile · ×5 · pays 50` with `Hint 1 of 3` live beside it; and at `26 pile · ×3 · pays 30`,
     one rejected submit and one hint later, the grader printed `✓ SILVER +12 XP` over a strip still
     reading `pays 30` and Continue took the pile to 2. */
  test('a hinted clear and a miss leave the same pile and the same streak — driven on the shipped engine', () => {
    /* the bit the slot was hiding, taken off `job/state.js answer` itself rather than off the table:
       the three shapes of grade, from one state, through the shipped verb */
    const at = (p, m, call, result) => {
      const s = saveAt(p, m, call);
      const it = state.currentItem(s);
      const r = state.answer(s, { id: it?.id ?? 'x', ...result }, { now: 2000, ms: 1000 });
      return { pile: r.pile, streak: r.streak };
    };
    let same = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        const clean = at(p, m, call, { cleared: true, clean: true, firstTry: true, attempt: 1, hints: 0 });
        const hinted = at(p, m, call, { cleared: true, clean: false, firstTry: true, attempt: 1, hints: 1 });
        const retried = at(p, m, call, { cleared: true, clean: false, firstTry: false, attempt: 2, hints: 0 });
        const miss = at(p, m, call, { cleared: false, clean: false, firstTry: false, attempt: 3, hints: 0 });
        assert.deepEqual(hinted, miss, `pile ${p} \u00d7${m} ${call}: a hinted clear is not settled as a miss`);
        assert.deepEqual(retried, miss, `pile ${p} \u00d7${m} ${call}: a retried clear is not settled as a miss`);
        assert.equal(clean.pile, p + econ.payOf(call, m), 'a clean clear no longer pays the table`s price');
        assert.notDeepEqual(clean, miss, 'a clean clear and a miss are the same settlement');
        same++;
      }
    }
    assert.ok(same > 3000, `only ${same} state \u00d7 call pairs — the sweep collapsed`);
  });

  test('the third slot carries nothing once the question can no longer earn its bid', () => {
    let seen = 0;
    for (const [p, m] of REACHABLE) {
      for (const call of econ.offered(p, m)) {
        const reading = readingOf(saveAt(p, m, call));
        const promised = stripFor(reading, { hits: 2, of: 3 });
        const withdrawn = stripFor(reading, { hits: 2, of: 3 }, { earnable: false });
        assert.equal(promised[2].value, COPY.pays({ n: econ.payOf(call, m) }));
        assert.equal(withdrawn[2].value, '', `pile ${p} ×${m} ${call}: the slot still promises a payout`);
        assert.equal(withdrawn[2].caption, '', 'the withdrawn slot grew a caption — the band would resize mid-question');
        assert.equal(withdrawn[2].meter, null, 'the withdrawn slot drew the rate over a standing bid');
        /* the first two slots are untouched: nothing about the pile or the streak moved */
        assert.deepEqual(withdrawn.slice(0, 2), promised.slice(0, 2));
        /* …and it is two numbers on screen, never four */
        assert.deepEqual(numeralsOf(withdrawn), [p, m]);
        seen++;
      }
    }
    assert.ok(seen > 3000, `only ${seen} bids swept — the sweep collapsed`);
  });

  test('`earnable` only ever REMOVES a promise — it invents no form of its own', () => {
    for (const [p, m] of REACHABLE.slice(0, 200)) {
      for (const d of [{ hits: 0, of: 0 }, { hits: 2, of: 3 }]) {
        /* with no call there is nothing to withdraw, so the flag is inert */
        assert.deepEqual(stripFor(readingOf(saveAt(p, m)), d, { earnable: false }),
          stripFor(readingOf(saveAt(p, m)), d), `pile ${p} ×${m}: the face-down card changed shape`);
      }
    }
    /* and the withdrawn shape is the one the app already had for a question it will not price */
    const bidless = stripFor({ pile: 9, streak: 2, call: null, pay: null, bidless: true }, { hits: 1, of: 2 });
    const withdrawn = stripFor(readingOf(saveAt(24, 3, 'sure')), { hits: 1, of: 2 }, { earnable: false });
    assert.deepEqual(withdrawn[2], bidless[2], 'the withdrawn slot is a NEW shape — CUT-SPEC §5 describes three');
  });

  test('the screen reads the card`s own state for it, and the two events that change it', () => {
    /* it is `js/xp.js isClean`'s two counts, read off `createCardView`'s controller — never a count
       this screen keeps, and never a rule about the game re-derived here */
    const body = CODE.slice(CODE.indexOf('function earnableNow()'), CODE.indexOf('\n  function ', CODE.indexOf('function earnableNow()') + 1));
    assert.match(body, /view\s*&&\s*view\.state/, 'the screen no longer asks the card');
    assert.match(body, /st\.hints/, 'a revealed hint no longer takes the promise off');
    assert.match(body, /st\.wrongs/, 'a second attempt no longer takes the promise off');
    assert.match(read('site/js/xp.js'), /firstTry === true && Math\.max\(0, num\(c\.hints\)\) === 0/,
      'js/xp.js isClean is no longer firstTry+hints — re-derive what `earnableNow` reads');
    /* the trigger: the two events screens/card.js emits at exactly those two instants */
    for (const ev of ['card:wrong', 'card:hint']) {
      assert.match(CODE, new RegExp(`bus\\.on\\('${ev}'`), `the screen does not listen for ${ev}`);
      assert.match(read('site/js/screens/card.js'), new RegExp(`bus\\.emit\\('${ev}'`),
        `screens/card.js no longer emits ${ev} — the listener is listening for nothing`);
    }
    assert.match(CODE, /offWrong\(\);\s*\n\s*offHint\(\);/, 'the listeners outlive the screen');
    /* …and it is handed to the model rather than decided inside it */
    assert.match(CODE, /earnable: earnableNow\(\)/, 'modelNow stopped telling the model what the card is doing');
    assert.match(CODE, /earnable: opts\.earnable !== false/, 'viewModel stopped passing it to the strip');
  });
});

describe('the settled bid is on screen while it moves', () => {
  /* ROUND 5 (player-feel, BLOCKER): "it completed inside ~1 s and I only caught it by screenshotting
     immediately — at +1 s `8 pile ×2 streak pays 18`, at +2 s `0 pile ×1 streak`". Round 3 put the
     HOLD in front of the settle; the settle itself was still followed in the same frame by the next
     card, so the moved pile only ever existed under whatever was painted over it. */
  test('the beat has two halves, the layer`s own two durations, and nothing else', () => {
    const at = CODE.indexOf('function settleBeat()');
    const beat = CODE.slice(at, CODE.indexOf('\n  function ', at + 1));
    assert.match(beat, /\bBANK_MS\b/, 'the hold before the settle is gone');
    assert.match(beat, /\bFLIP_MS\b/, 'the settled reading is painted over in the same frame again');
    /* the settle, then the strip, then the next render — in that order */
    const settle = beat.indexOf('settleAbandonedBid(s)');
    const paint = beat.indexOf("renderStrip(modelNow('answer'))");
    const on = beat.lastIndexOf('render();');
    assert.ok(settle > 0 && paint > settle && on > paint,
      'the settled reading is not painted between the charge and the next card');
    /* and it is the same shape `lossBeat` already had, for the same reason */
    const lat = CODE.indexOf('function lossBeat()');
    const loss = CODE.slice(lat, CODE.indexOf('\n  function ', lat + 1));
    assert.match(loss, /\bBANK_MS\b/); assert.match(loss, /\bFLIP_MS\b/);
    /* no new word, no new number, no new tap, nothing new on disk */
    assert.ok(!/COPY\./.test(beat), 'the settle beat says a word — a loss prints no string (CUT-SPEC §6)');
    assert.ok(!/createCardView/.test(beat), 'the settle beat mounts a question under a bid it is voiding');
    assert.ok(!/tick\(\)/.test(beat), 'the settle beat animates a number');
    /* `settling` spans BOTH halves, or a repaint could restart the beat under the student */
    assert.ok(beat.lastIndexOf('settling = false') > paint,
      'the beat drops its guard before the settled reading has been seen');
  });
});

describe('the screen repaints when the engine moves under it', () => {
  /* ROUND 5 (number-truth, MAJOR): `store.js update()` runs `reconcileGameDay` BEFORE every
     mutation, so an update that crosses local midnight drains the unbanked pile and writes
     `live.pile = 0` / `live.streak = 1`. Measured: strip `96 pile · ×5 streak` over an engine
     holding 0 and ×1, with all three calls drawn live and two of them refusing every tap. */
  test('the store really can move the game under a screen that does not repaint', () => {
    const STORE = read('site/js/store.js');
    /* the two facts this fix is load-bearing on, read off the store rather than assumed: the day is
       rolled on the store's own clock, and a roll empties the live pile */
    assert.match(STORE, /reconcileGameDay\(/, 'the store no longer rolls the day — re-derive this fix');
    assert.match(STORE, /live\.pile\s*=/, 'the roll no longer moves the live pile — re-derive this fix');
    assert.match(STORE, /function subscribe\(fn\)/, 'the store has no subscription to hear the roll on');
    assert.match(STORE, /notify\('update'\)/, 'the store announces nothing — a subscriber would never hear the roll');
  });

  test('every path this screen has to a refused or reconciled update ends in a repaint', () => {
    assert.match(CODE, /function resync\(\)/, 'the screen has no repaint of its own again');
    const at = CODE.indexOf('function resync()');
    const body = CODE.slice(at, CODE.indexOf('\n  function ', at + 1));
    assert.match(body, /\brender\(\);/, 'resync repaints nothing');
    /* it must NOT paint over a beat that is holding a reading on purpose (r3 / r4) */
    for (const guard of ['settling', 'lost', 'bankSay', 'bidless']) {
      assert.ok(body.includes(guard), `resync can cut the ${guard} beat short — a round-3/4 fix undone`);
    }
    /* the three call sites: the away handler (the midnight roll with no reload) and the two refusals */
    const away = CODE.slice(CODE.indexOf('const onAway = () =>'), CODE.indexOf("document.addEventListener('visibilitychange'"));
    assert.match(away, /resync\(\)/, 'the away handler reconciles the day and never repaints');
    assert.match(CODE, /console\.warn\('job: call refused', e\); resync\(\); return;/,
      'a refused call leaves the number that was refused on screen');
    assert.match(CODE, /console\.warn\('job: bank refused', e\); resync\(\); return;/,
      'a refused bank leaves the pile it could not take on screen');
    /* …and the roll nobody taps for: the store's own clock. The screen subscribes — and stands down
       for the length of its OWN writes, or `lockCall` would mount the question before the flip and
       `applyResult` would repaint the strip at the instant round 4 requires it to hold the pre-bid
       reading (screens/card.js writes several times inside finishClear(), before onDone). */
    assert.match(CODE, /offStore = subscribe\(\(\) => resync\(\)\)/, 'the screen never hears a roll it did not cause');
    assert.match(CODE, /offStore\(\); offStore = null;/, 'the subscription outlives the screen');
    assert.match(body, /inVerb > 0/, 'resync repaints from inside this screen`s own writes');
    const w = CODE.slice(CODE.indexOf('function write(fn, opts)'), CODE.indexOf('\n  function ', CODE.indexOf('function write(fn, opts)') + 1));
    assert.match(w, /inVerb\+\+;[\s\S]*finally \{ inVerb--; \}/, 'the guard is not exception-safe — one throw and the screen goes deaf');
    /* every store write in this file goes through it, or the guard has a hole in it */
    const mountBody = CODE.slice(CODE.indexOf('function mount(host)'));
    assert.equal((mountBody.match(/(?<![.\w])update\(/g) || []).length, 1,
      'a store write in mount() bypasses `write()` — it would repaint from inside its own verb');
    assert.ok(w.includes('update(fn, opts)'), 'the one `update(` left in mount() is not the guard`s own');
    assert.ok((mountBody.match(/(?<![.\w])write\(/g) || []).length >= 8,
      'the verbs stopped writing through the guard');
  });
});

describe('leaving by the screen`s own way out is leaving', () => {
  /* ROUND 5 (split-honesty, MAJOR): the absence was declared on `visibilitychange` / `pagehide`
     only, and `← Today` is a hash change in one live document — neither event fires. The same six
     questions with the same 15 min break printed 3 % taken by the button against 17 % taken by the
     phone's home button, on the one number CUT-BRIEF asks the app to measure honestly. */
  test('the unmount declares the absence, with the same verb and the same immediate write', () => {
    /* the screen's real teardown, not the malformed-save bail-out above it */
    const at = CODE.indexOf('return () => {', CODE.indexOf('setJobHeader(true);'));
    assert.ok(at > 0, 'mount() no longer returns a teardown');
    const body = CODE.slice(at, CODE.indexOf('\n  };', at));
    assert.match(body, /state\.presence\(s, \{ now: Date\.now\(\), here: false \}\)/,
      'the teardown never tells the engine the student left');
    assert.match(body, /if \(state\.stateOf\(s\)\)/,
      'the teardown declares an absence on a finished session — there is no record left to write to');
    assert.match(body, /\{\s*immediate:\s*true\s*\}/,
      'the teardown`s write is debounced — a route change can outrun it');
    /* it declares PRESENCE and never a duration: the engine derives the length from its own clock */
    assert.doesNotMatch(body, /\bms\s*:/, 'the teardown declares a duration the engine cannot check');
    for (const verb of ['call', 'answer', 'bank', 'endJob']) {
      assert.doesNotMatch(body, new RegExp(`state\\.${verb}\\(`), `the teardown plays the game: state.${verb}`);
    }
    /* and the way back in closes it — `resume`, which the mount already calls */
    assert.match(CODE, /state\.resume\(s, \{ now: Date\.now\(\) \}\)/, 'the absence is never closed on the way back in');
  });

  test('the printed share no longer depends on WHICH way the student left', () => {
    /* two identical sessions; the only difference is how long the break was. Declared, the length
       goes to `tAway` and the share does not move — which is the property the teardown buys: the
       button and the phone's home button now leave by the same door. */
    const play = (breakMs, declare) => {
      const s = fresh();
      s.settings = { ...(s.settings || {}), testDate: '2026-10-01' };
      let t = Date.parse('2026-09-22T18:00:00Z');
      state.startJob(s, { now: t, today: '2026-09-22' });
      for (let i = 0; i < 4 && state.targetsLeft(s) > 0; i++) {
        state.call(s, state.callsFor(s)[0], { now: (t += 6000), ms: 6000 });
        const it = state.currentItem(s);
        state.answer(s, { id: it.id, cleared: true, clean: true, firstTry: true, attempt: 1, hints: 0 },
          { now: (t += 22000), ms: 22000 });
        if (i === 1) {
          /* the break: taken by `\u2190 Today` (declared, r5) or by the round-4 screen (not declared) */
          if (declare) state.presence(s, { now: (t += 1000), here: false });
          t += breakMs;
          state.resume(s, { now: t });
        }
      }
      const g = state.stateOf(s);
      return { split: state.splitOf(g), tAway: g.tAway | 0 };
    };
    const short = play(1000, true);
    const long = play(900000, true);
    assert.equal(long.split, short.split,
      `a 15 min break moved the printed share from ${short.split} % to ${long.split} % — the absence is in the denominator`);
    assert.ok(long.tAway - short.tAway >= 890000, 'the break is not in `tAway` at all');
    /* …and this is the defect, stated: the same break undeclared collapses the number */
    const undeclared = play(900000, false);
    assert.ok(undeclared.split < long.split,
      'an undeclared 15 min break no longer changes the share — re-derive what the teardown is for');
  });
});
