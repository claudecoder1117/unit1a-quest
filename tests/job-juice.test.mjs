// tests/job-juice.test.mjs — J12, the JUICE and A11Y lint. COMPOSED-GAME.md G6 "Four new visual
// objects" / "Animation budget", G10 #13 and #22, G11's rejected list.
//
// G6 spends the whole motion budget in one sentence: "six cues, all transform/opacity, all ≤ 600 ms,
// all 0 ms under `prefers-reduced-motion` (colour kept). Envelope flip 180 ms · call-lock chip snap
// 120 ms · loose counter tween 300 ms · chain tick fill 150 ms · guard bar redraw 250 ms · the bag
// drop 600 ms. Nothing full-screen." This file is the machine form of that sentence.
//
// WHERE THE CSS IS. The layer ships TWO stylesheets and this file reads both as one:
//   · `site/css/job.css`            — J6's, the job screen itself, and where all six cues live.
//   · the `/* === G-job === */` block appended to `site/css/screens.css` — J12's (this ticket), the
//     layer's surfaces on screens that file already styles: Home's Board, the three `#/stats` panels
//     and Settings' formula blocks.
// The six-keyframe count is over the UNION, which is the only count that means anything: J6's note
// warns that a second set in `screens.css` would ship twelve.
//
// The measured DOM walk (375×667, both engines) is `qa/job-screen.mjs`, driven by
// `tests/job-screen.test.mjs`. This file is static so it runs everywhere in milliseconds.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { read, listFiles, repoPath } from './_helpers.mjs';

const { ANIMATION, HEADER, KEYS, LAYOUT, SOUND_CUES } = await import('../site/data/job.js');

const JOB_CSS = read('site/css/job.css');
const SCREENS_CSS = read('site/css/screens.css');
const JOB_SCREEN = read('site/js/screens/job.js');

/* ------------------------------------------------------------------ the G-job block */

const OPEN_RE = /\/\*\s*===\s*G-job\s*===/;
const CLOSE_MARK = '/* === /G-job === */';
const openAt = SCREENS_CSS.search(OPEN_RE);
const closeAt = SCREENS_CSS.indexOf(CLOSE_MARK);
const G_JOB = openAt >= 0 && closeAt > openAt ? SCREENS_CSS.slice(openAt, closeAt + CLOSE_MARK.length) : '';

/** the two stylesheets of the game layer, read as one */
const LAYER_CSS = `${JOB_CSS}\n${G_JOB}`;

/* ------------------------------------------------------------------ a very small CSS reader */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** `@keyframes name { … }` → `{ name, body }`, brace-matched so a nested stop cannot end it early */
function keyframesOf(css) {
  const out = [];
  const re = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push({ name: m[1], body: css.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

/** every declaration block that is NOT an at-rule, with its selector and the at-rules around it */
function* rulesOf(css, at = '') {
  let i = 0, preludeStart = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const prelude = css.slice(preludeStart, i).trim();
      let depth = 1, j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const body = css.slice(i + 1, j - 1);
      if (prelude.startsWith('@')) {
        if (!prelude.startsWith('@keyframes')) yield* rulesOf(body, at ? `${at} ${prelude}` : prelude);
      } else {
        yield { selector: prelude.replace(/\s+/g, ' '), body, at };
      }
      i = j; preludeStart = j;
      continue;
    }
    if (ch === '}') { i++; preludeStart = i; continue; }
    i++;
  }
}

/** `prop: value` pairs of one declaration body */
const declsOf = (body) => body.split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const k = d.indexOf(':'); return k < 0 ? null : { prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim() }; })
  .filter(Boolean);

const LAYER_RULES = [...rulesOf(stripComments(LAYER_CSS))];
const LAYER_KEYFRAMES = keyframesOf(stripComments(LAYER_CSS));

/* ================================================================================================
   0. The block itself — append-only, tagged, and last  (BUILD-POLICY §2)
   ================================================================================================ */

describe('J12 — the /* === G-job === */ block is appended, tagged and last', () => {
  test('it exists exactly once, opened and closed', () => {
    assert.ok(openAt >= 0, 'no /* === G-job === */ block in screens.css');
    assert.equal((SCREENS_CSS.match(/\/\*\s*===\s*G-job\s*===/g) ?? []).length, 1);
    assert.equal((SCREENS_CSS.match(/\/\*\s*===\s*\/G-job\s*===\s*\*\//g) ?? []).length, 1);
    assert.ok(closeAt > openAt);
    assert.ok(G_JOB.length > 500, `the block is ${G_JOB.length} bytes`);
  });

  test('nothing follows it, so the file was appended to and never rewritten', () => {
    assert.equal(SCREENS_CSS.slice(closeAt + CLOSE_MARK.length).trim(), '');
  });

  test('every pre-existing block is still there, still balanced, and still before it', () => {
    const marks = [...SCREENS_CSS.matchAll(/\/\*\s*===\s*(\/?)([A-Za-z0-9-]+)\s*===/g)]
      .map((m) => ({ close: m[1] === '/', name: m[2], at: m.index }));
    const open = marks.filter((m) => !m.close).map((m) => m.name);
    const close = marks.filter((m) => m.close).map((m) => m.name);
    assert.deepEqual(open, close, 'every block opens and closes, in order');
    // T15 T10 T11 T09 T16 T12 T13 T14 W5 shipped before this ticket; G-job is the tenth and last
    assert.deepEqual(open.slice(0, -1), ['T15', 'T10', 'T11', 'T09', 'T16', 'T12', 'T13', 'T14', 'W5']);
    assert.equal(open.at(-1), 'G-job');
    for (const m of marks) if (m.name !== 'G-job') assert.ok(m.at < openAt, `${m.name} moved after G-job`);
  });

  test('the block declares no @keyframes of its own — the layer ships six, not twelve', () => {
    assert.deepEqual(keyframesOf(stripComments(G_JOB)).map((k) => k.name), []);
  });
});

/* ================================================================================================
   1. EXACTLY six new keyframes, all transform/opacity, all ≤ 600 ms
   ================================================================================================ */

describe('J12 — the animation budget is exactly six cues', () => {
  const EXPECTED = ANIMATION.cues.map((c) => `job-${c.id}`);

  test('data/job.js publishes six, and every one is transform or opacity at ≤ 600 ms', () => {
    assert.equal(ANIMATION.cues.length, 6);
    assert.deepEqual(ANIMATION.cues.map((c) => c.ms), [180, 120, 300, 150, 250, 600]);
    for (const c of ANIMATION.cues) {
      assert.ok(['transform', 'opacity'].includes(c.prop), `${c.id} animates ${c.prop}`);
      assert.ok(c.ms <= ANIMATION.maxMs, `${c.id} is ${c.ms} ms`);
    }
    assert.equal(ANIMATION.maxMs, 600);
  });

  test('the layer’s CSS declares exactly those six @keyframes and no others', () => {
    assert.equal(LAYER_KEYFRAMES.length, 6, LAYER_KEYFRAMES.map((k) => k.name).join(' '));
    assert.deepEqual(LAYER_KEYFRAMES.map((k) => k.name).sort(), [...EXPECTED].sort());
  });

  test('every property inside every keyframe is transform or opacity — nothing else', () => {
    const ALLOWED = new Set(['transform', 'opacity']);
    const bad = [];
    for (const kf of LAYER_KEYFRAMES) {
      for (const stop of kf.body.split('}')) {
        const body = stop.slice(stop.indexOf('{') + 1);
        if (!stop.includes('{')) continue;
        for (const d of declsOf(body)) if (!ALLOWED.has(d.prop)) bad.push(`${kf.name} → ${d.prop}`);
      }
    }
    assert.deepEqual(bad, [], 'a keyframe that moves layout or colour is not in the budget');
  });

  test('every `animation:` in the layer names one of the six and plays it at its published ms', () => {
    const byName = new Map(ANIMATION.cues.map((c) => [`job-${c.id}`, c.ms]));
    const seen = new Set();
    const bad = [];
    for (const r of LAYER_RULES) {
      for (const d of declsOf(r.body)) {
        if (d.prop !== 'animation' && d.prop !== 'animation-name') continue;
        if (/^none\b/.test(d.value)) continue;
        const name = d.value.match(/job-[a-z-]+/)?.[0];
        if (!name || !byName.has(name)) { bad.push(`${r.selector} → ${d.value}`); continue; }
        seen.add(name);
        const ms = Number(d.value.match(/(\d+(?:\.\d+)?)ms/)?.[1] ?? NaN);
        if (ms !== byName.get(name)) bad.push(`${r.selector} → ${name} at ${ms}ms, published ${byName.get(name)}ms`);
        if (!(ms <= ANIMATION.maxMs)) bad.push(`${r.selector} → ${ms}ms exceeds the 600 ms budget`);
      }
    }
    assert.deepEqual(bad, []);
    assert.deepEqual([...seen].sort(), [...EXPECTED].sort(), 'every declared cue is actually used');
  });

  test('every `transition:` in the layer is ≤ 600 ms too, and moves transform or opacity only', () => {
    const TOKEN_MS = { '--dur-1': 120, '--dur-2': 200, '--dur-3': 450 };
    const bad = [];
    for (const r of LAYER_RULES) {
      for (const d of declsOf(r.body)) {
        if (!d.prop.startsWith('transition')) continue;
        if (/^none\b/.test(d.value) || d.prop === 'transition-duration') continue;
        for (const part of d.value.split(',')) {
          const prop = part.trim().split(/\s+/)[0];
          if (!['transform', 'opacity'].includes(prop)) bad.push(`${r.selector} → transition ${prop}`);
        }
        const tok = d.value.match(/--dur-\d/)?.[0];
        const ms = tok ? TOKEN_MS[`${tok}`] : Number(d.value.match(/(\d+)ms/)?.[1] ?? 0);
        if (!(ms > 0 && ms <= ANIMATION.maxMs)) bad.push(`${r.selector} → ${d.value} (${ms}ms)`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('four sound cues, and not one of them is a sting, a voice or music (G6)', () => {
    assert.equal(SOUND_CUES.length, 4);
    assert.deepEqual(SOUND_CUES.map((c) => c.id), ['job-call-lock', 'job-chain-tick', 'job-vault', 'job-bag-drop']);
  });
});

/* ================================================================================================
   2. NO `transform: rotate` on the envelope — or anywhere  (G11, G12 #31)
   ================================================================================================ */

describe('J12 — the 0.4° envelope tilt stays dead', () => {
  test('data/job.js says so, and G11 is the reason', () => {
    assert.equal(ANIMATION.noRotateOnEnvelope, true);
  });

  test('no rotation function appears anywhere in the layer’s CSS', () => {
    const ROTATE = /\brotate(?:3d|x|y|z)?\s*\(/i;
    const bad = [];
    for (const r of LAYER_RULES) for (const d of declsOf(r.body)) if (ROTATE.test(d.value) || d.prop === 'rotate') bad.push(`${r.selector} → ${d.prop}: ${d.value}`);
    for (const kf of LAYER_KEYFRAMES) if (ROTATE.test(kf.body)) bad.push(`@keyframes ${kf.name}`);
    assert.deepEqual(bad, []);
  });

  test('specifically: the `.job-envelope` rule and the flip it plays', () => {
    const env = LAYER_RULES.filter((r) => /\.job-envelope\b/.test(r.selector));
    assert.ok(env.length > 0, 'the envelope must exist to be checked');
    for (const r of env) assert.equal(/rotate/i.test(r.body), false, r.selector);
    const flip = LAYER_KEYFRAMES.find((k) => k.name === 'job-envelope-flip');
    assert.ok(flip, 'the flip cue must exist');
    assert.equal(/rotate/i.test(flip.body), false, 'the flip is a scaleY, not a rotation');
    assert.match(flip.body, /scaleY/);
  });
});

/* ================================================================================================
   3. prefers-reduced-motion zeroes every duration and keeps every colour
   ================================================================================================ */

describe('J12 — reduced motion zeroes duration and changes no colour', () => {
  const COLOUR_PROPS = /^(?:color|background|background-color|border(?:-[a-z]+)?-color|fill|stroke|outline-color|box-shadow|opacity|filter|--.*)$/;
  const reduced = LAYER_RULES.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.at));

  test('data/job.js publishes 0 ms as the reduced-motion duration', () => {
    assert.equal(ANIMATION.reducedMotionMs, 0);
  });

  test('the layer carries its own reduced-motion block, on top of base.css’s global one', () => {
    assert.ok(reduced.length > 0, 'css/job.css must restate the rule so it travels with the cues');
    assert.match(read('site/css/base.css'), /@media \(prefers-reduced-motion: reduce\)/);
  });

  test('it zeroes animation-duration, animation-delay AND transition-duration', () => {
    const props = new Set(reduced.flatMap((r) => declsOf(r.body).map((d) => d.prop)));
    for (const p of ['animation-duration', 'animation-delay', 'transition-duration']) {
      assert.ok(props.has(p), `reduced motion does not zero ${p}`);
    }
    for (const r of reduced) {
      for (const d of declsOf(r.body)) {
        const n = Number(d.value.match(/^(\d+(?:\.\d+)?)m?s/)?.[1] ?? NaN);
        assert.equal(n, 0, `${r.selector} → ${d.prop}: ${d.value} is not zero`);
        assert.match(d.value, /!important/, `${d.prop} must beat the cue it is overriding`);
      }
    }
  });

  test('it changes no colour — reduced motion is about motion, never about contrast', () => {
    const bad = [];
    for (const r of reduced) for (const d of declsOf(r.body)) if (COLOUR_PROPS.test(d.prop)) bad.push(`${r.selector} → ${d.prop}`);
    assert.deepEqual(bad, []);
  });

  test('and it reaches every one of the six cues’ elements', () => {
    // the six cues play on `.job-screen` descendants and on the header's stake read-outs; both are
    // named by the reduced-motion selectors, so no cue can outlive the preference
    const sel = reduced.map((r) => r.selector).join(' ');
    assert.match(sel, /\.job-screen\s\*/, 'the screen and everything in it');
    assert.match(sel, /\.hdr-stake/, 'and the header column, where the bag drop plays');
  });
});

/* ================================================================================================
   4. NO `position: fixed` element on body during a job  (G10 #13, COMPOSED S9 #7)
   ================================================================================================ */

describe('J12 — the tile mint stays the product’s only full-screen moment', () => {
  test('the layer’s CSS contains no position: fixed and nothing that covers the viewport', () => {
    const bad = [];
    for (const r of LAYER_RULES) {
      for (const d of declsOf(r.body)) {
        if (d.prop === 'position' && /fixed/.test(d.value)) bad.push(`${r.selector} → position: fixed`);
        if (d.prop === 'inset' && /^0/.test(d.value)) bad.push(`${r.selector} → inset: 0`);
        if (/^(width|height|min-width|min-height)$/.test(d.prop) && /100v[wh]/.test(d.value)) bad.push(`${r.selector} → ${d.prop}: ${d.value}`);
      }
    }
    assert.deepEqual(bad, []);
    assert.equal(ANIMATION.bagDrop.fullScreen, false);
  });

  test('no class or id the job screen renders is targeted by a fixed rule in ANY stylesheet', () => {
    // The five `position: fixed` overlays the product ships (.set-msg, .sw-pill, .bnd-pop,
    // .t11-toasts, .levelup, the two Mock ones and the Answer Dock) all belong to the study layer
    // and are appended to <body> by their own screens. The claim this test makes is the one the
    // acceptance makes: NOTHING THE JOB RENDERS is one of them.
    const emitted = new Set();
    for (const m of JOB_SCREEN.matchAll(/h\('([a-zA-Z][\w.#-]*)'/g)) for (const t of m[1].split(/[.#]/).slice(1)) emitted.add(t);
    for (const m of JOB_SCREEN.matchAll(/classList\.(?:add|toggle)\('([^']+)'/g)) emitted.add(m[1]);
    assert.ok(emitted.size > 40, `the job screen renders ${emitted.size} classes`);

    const fixedTokens = new Set();
    for (const f of listFiles(repoPath('site/css'), /\.css$/)) {
      for (const r of rulesOf(stripComments(readFileSync(f, 'utf8')))) {
        if (!declsOf(r.body).some((d) => d.prop === 'position' && /fixed/.test(d.value))) continue;
        for (const t of r.selector.matchAll(/[.#]([A-Za-z][\w-]*)/g)) fixedTokens.add(t[1]);
      }
    }
    assert.ok(fixedTokens.size > 0, 'the product does ship fixed overlays; this test is not vacuous');
    const collisions = [...emitted].filter((t) => fixedTokens.has(t));
    assert.deepEqual(collisions, [], 'a job element would become a full-screen overlay');
  });

  test('the job screen appends nothing to <body>', () => {
    assert.equal(/document\.body/.test(JOB_SCREEN), false, 'every node the job makes lives inside #view');
    assert.equal(/position:\s*['"]?fixed/.test(JOB_SCREEN), false, 'and none of them is inline-fixed');
  });

  /**
   * ROUND 2 (layout-safari, BLOCKER). This test used to be four lines, and the load-bearing one was
   * `assert.equal(LAYOUT.boardSheetPx, 264)` — the literal 264 in `site/data/job.js:774` compared
   * with the literal 264 here. Nothing else in the tree consumed the constant:
   *
   *     $ grep -rn "boardSheetPx" site/ tests/ qa/
   *       site/data/job.js          the declaration
   *       tests/job-juice.test.mjs  this assertion
   *       qa/job-walk.mjs           warn() only — it could not fail a run
   *     $ grep -rn "264" site/css/
   *       (no output)
   *
   * …so this file reported green while the board rendered at 477 px (chromium) / 480 px (webkit) at
   * 375x667. The 36 px half of the same sentence was never in that position, because it greps the
   * stylesheet for the custom property that actually enforces it.
   *
   * The repair is not a bigger literal. It is the rule that EVERY px constant in `LAYOUT` naming a
   * box the student sees must have at least one consumer that can fail a run — a CSS rule, or a
   * rendered measurement in the QA harness. That is asserted below, per constant, by reading the
   * consumers. `boardSheetPx` is satisfied today by `qa/job-screen.mjs`'s measurement (round 2),
   * which is a warning until `job.css` publishes `--job-board-sheet` and a decision-phase rule
   * consumes it, and a hard failure the moment it does. See notes/tests-fix.md "Requests".
   */
  test('the board collapses instead of overlaying: 264 px open, 36 px at call-lock (G12 #22)', () => {
    assert.equal(LAYOUT.boardCollapsedPx, 36);
    assert.equal(LAYOUT.collapseAt, 'call-lock');
    assert.ok(LAYOUT.boardSheetPx > LAYOUT.boardCollapsedPx * 4,
      'the open sheet and the collapsed line are the two halves of one sentence');

    // the COLLAPSED half: published as a custom property and consumed by a rule
    assert.match(JOB_CSS, new RegExp(`--job-board-collapsed:\\s*${LAYOUT.boardCollapsedPx}px`));
    assert.match(JOB_CSS, /block-size:\s*var\(\s*--job-board-collapsed\s*\)/,
      'the property is published but no rule consumes it');
  });

  test('every LAYOUT px constant has a consumer that can FAIL a run — none is compared with itself', () => {
    const JOB_DATA = read('site/data/job.js');
    const SCREEN_QA = read('qa/job-screen.mjs');
    const WALK_QA = read('qa/job-walk.mjs');

    /** A CSS custom property carrying this constant's value, consumed by at least one rule. */
    const cssEnforces = (name, px) => {
      const prop = `--job-${name.replace(/Px$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
      return new RegExp(`${prop}:\\s*${px}px`).test(JOB_CSS) && new RegExp(`var\\(\\s*${prop}\\s*\\)`).test(JOB_CSS);
    };
    /** A rendered measurement in the QA harness that reads this constant and can report on it. */
    const qaMeasures = (name) => [SCREEN_QA, WALK_QA].some((src) =>
      src.includes(name) && /getBoundingClientRect\(\)\.height/.test(src));

    const pxKeys = Object.keys(LAYOUT).filter((k) => /Px$/.test(k) && Number.isFinite(LAYOUT[k]));
    assert.ok(pxKeys.length >= 2, `LAYOUT declares ${pxKeys.length} px constants — this test is not vacuous`);

    const orphans = [];
    for (const k of pxKeys) {
      // the declaration in data/job.js is not a consumer, and neither is this file
      assert.match(JOB_DATA, new RegExp(`${k}:\\s*${LAYOUT[k]}`), `${k} is not declared in site/data/job.js`);
      if (!cssEnforces(k, LAYOUT[k]) && !qaMeasures(k)) orphans.push(k);
    }
    assert.deepEqual(orphans, [],
      `these LAYOUT constants are compared with themselves and with nothing else: ${orphans.join(', ')}. `
      + 'Either publish the value as a CSS custom property and consume it in a rule (the way '
      + '`--job-board-collapsed` works), or measure the rendered box against it in qa/job-screen.mjs.');

    /* …and the sheet number specifically, BOTH ways round, because either alone can rot:
         · `job.css` publishes `--job-board-sheet: 264px` and a rule consumes it — the same shape
           the 36 px half has always had, and what makes the number a rule instead of a table entry.
         · `qa/job-screen.mjs` measures the rendered box against it at 375x667, and both QA
           harnesses arm that measurement from the CSS (`SHEET_RULE_SHIPPED`), so the day the rule
           is deleted the measurement drops back to a warning with the reason attached rather than
           failing every run for a rule that no longer exists. */
    assert.ok(cssEnforces('boardSheetPx', LAYOUT.boardSheetPx),
      'job.css must publish `--job-board-sheet: ' + LAYOUT.boardSheetPx + 'px` and consume it in a rule — '
      + 'without that, LAYOUT.boardSheetPx is a number in a table and the board can render at any height');
    assert.ok(qaMeasures('boardSheetPx'), 'qa/job-screen.mjs no longer measures the open board');
    assert.match(SCREEN_QA, /SHEET_RULE_SHIPPED/, 'the self-arming switch is gone from qa/job-screen.mjs');
    assert.match(WALK_QA, /SHEET_RULE_SHIPPED/, 'the self-arming switch is gone from qa/job-walk.mjs');
  });
});

/* ================================================================================================
   5. The bag drop plays at most once per job, and is the only thing animating while it runs
   ================================================================================================ */

describe('J12 — THE BAG DROP', () => {
  const dropRules = LAYER_RULES.filter((r) => declsOf(r.body).some((d) => /job-bag-drop/.test(d.value)));

  test('its published shape is G6’s, to the millisecond', () => {
    assert.deepEqual({ ...ANIMATION.bagDrop }, {
      ms: 600, staggerMs: 40, translate: '-1.2em', oncePerJob: true, fullScreen: false,
    });
  });

  test('exactly one rule plays it, and it needs the once-per-job flag to fire', () => {
    assert.equal(dropRules.length, 1, dropRules.map((r) => r.selector).join(' | '));
    const [r] = dropRules;
    assert.match(r.selector, /#hdr-bag\[data-drop="true"\]/, 'it plays in the header column, on a flag');
    assert.match(r.selector, /\.hdr-stake-v/, 'and on one element: the bag numeral');
    assert.equal(r.at, '', 'it is not inside a media or container query that could re-fire it');
  });

  test('the screen latches the flag, so a re-render cannot replay it', () => {
    assert.match(JOB_SCREEN, /let bagDropped\s*=\s*false/, 'a per-mount latch');
    assert.match(JOB_SCREEN, /if \(!bagDropped\) \{ bagDropped = true;/, 'set once, at the debrief');
    assert.equal((JOB_SCREEN.match(/bagDropped = true/g) ?? []).length, 1, 'and set in exactly one place');
    assert.match(JOB_SCREEN, /drop:\s*bagDropped/, 'the header reads the latch, never a fresh true');
  });

  test('nothing else can be animating: the debrief replaces the whole stage first', () => {
    const at = JOB_SCREEN.indexOf('function renderDebrief()');
    assert.ok(at > 0, 'renderDebrief must exist');
    const body = JOB_SCREEN.slice(at, JOB_SCREEN.indexOf('\n  }\n', at) + 4);
    assert.match(body, /stage\.replaceChildren\(/, 'the envelope, calls, payout and ticks are removed');
    assert.match(body, /beat\.hidden = true/, 'and the payout beat is hidden');
    // the five other cues play on these classes; none of them may survive into the debrief markup
    const OTHERS = ['job-envelope', 'job-call', 'job-payout', 'job-tick', 'job-bar-fill'];
    const still = OTHERS.filter((c) => body.includes(c));
    assert.deepEqual(still, [], 'the bag drop is the only element animating while it runs');
    assert.ok(body.indexOf('bagDropped = true') > body.indexOf('stage.replaceChildren('),
      'the drop is fired AFTER the stage is cleared, not before');
  });

  test('the debrief stays interactive underneath it (G10 #13)', () => {
    const at = JOB_SCREEN.indexOf('function renderDebrief()');
    const body = JOB_SCREEN.slice(at, JOB_SCREEN.indexOf('\n  }\n', at) + 4);
    assert.match(body, /btn-primary/, 'the primary action is on screen during the drop');
    assert.equal(/pointer-events:\s*none/.test(body), false);
    for (const r of LAYER_RULES) {
      for (const d of declsOf(r.body)) {
        assert.equal(d.prop === 'pointer-events' && /none/.test(d.value) && /debrief/.test(r.selector), false,
          `${r.selector} would block input during the drop`);
      }
    }
  });
});

/* ================================================================================================
   6. The header carries five items during a job and six outside one  (G6, G10 #22)
   ================================================================================================ */

describe('J12 — five header items during a job', () => {
  test('the arithmetic is 6 − 4 + 3 = 5', () => {
    assert.equal(HEADER.itemsOutsideJob, 6);
    assert.equal(HEADER.hiddenDuringJob.length, 4);
    assert.equal(HEADER.keptDuringJob.length, 2);
    assert.equal(HEADER.addedDuringJob.length, 3);
    assert.equal(HEADER.keptDuringJob.length + HEADER.addedDuringJob.length, HEADER.itemsDuringJob);
    assert.equal(HEADER.itemsDuringJob, 5);
    assert.equal(HEADER.itemsOutsideJob - HEADER.hiddenDuringJob.length + HEADER.addedDuringJob.length, 5);
  });

  test('the three added ones are styled, and the bag is the one that drops', () => {
    for (const id of HEADER.addedDuringJob) assert.ok(JOB_CSS.includes(`#${id}`) || JOB_CSS.includes('.hdr-stake'), id);
    assert.match(JOB_CSS, /#hdr-bag\[data-drop="true"\]/);
  });
});

/* ================================================================================================
   7. A11Y — the lint the ticket's name promises
   ================================================================================================ */

describe('J12 — a11y', () => {
  test('the layer never removes a focus ring', () => {
    const bad = [];
    for (const r of LAYER_RULES) for (const d of declsOf(r.body)) if (d.prop === 'outline' && /^(none|0)\b/.test(d.value)) bad.push(r.selector);
    assert.deepEqual(bad, []);
  });

  test('every colour in the layer is a theme token, so both themes clear 4.5:1 by construction', () => {
    const COLOURISH = /^(?:color|background|background-color|border(?:-[a-z]+)?-color|border|fill|stroke|outline|outline-color|caret-color|accent-color)$/;
    const LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;
    const bad = [];
    for (const r of LAYER_RULES) {
      for (const d of declsOf(r.body)) {
        if (!COLOURISH.test(d.prop)) continue;
        if (LITERAL.test(d.value)) bad.push(`${r.selector} → ${d.prop}: ${d.value}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('every interactive minimum size is var(--tap), never a literal', () => {
    const INTERACTIVE = /\.(?:job-(?:call|token-btn|commit-btn|bag|push|crack|walk|backcheck|callit|primary)|board-night)\b/;
    const bad = [];
    for (const r of LAYER_RULES) {
      if (!INTERACTIVE.test(r.selector)) continue;
      for (const d of declsOf(r.body)) {
        // `min-width: 0` is LAYOUT-ROOT's overflow idiom, not a tap size; the tap dimension on a
        // control in a flow row is its HEIGHT, and that one is never allowed to be a literal.
        if (d.prop === 'min-width' && d.value.trim() === '0') continue;
        if (!/^min-(?:height|width)$/.test(d.prop)) continue;
        if (!/var\(--tap\)/.test(d.value)) bad.push(`${r.selector} → ${d.prop}: ${d.value}`);
      }
    }
    assert.deepEqual(bad, []);
    assert.match(LAYER_CSS, /min-height:\s*var\(--tap\)/, 'and at least one of them declares it');
  });

  test('aria-live announces the payout, the guard draw and the bag (G6)', () => {
    assert.match(JOB_SCREEN, /aria-live['"]?\s*:\s*'polite'/, 'a polite live region');
    assert.match(JOB_SCREEN, /function say\(/, 'one funnel for everything announced');
    for (const k of ['COPY.guard', 'COPY.bag', 'COPY.clear']) {
      assert.ok(JOB_SCREEN.includes(k.replace('COPY.', 'COPY.')), `${k} must reach the live region`);
    }
  });

  test('the key map lives in data/job.js and the screen reads it rather than re-typing it', () => {
    assert.deepEqual(Object.keys(KEYS).sort(),
      ['bag', 'call', 'commit', 'crack', 'draft', 'push', 'tokens', 'walk', 'walkConfirm']);
    assert.match(JOB_SCREEN, /KEYS\.bag/);
    assert.match(JOB_SCREEN, /KEYS\.walk/);
    assert.equal(/case\s*'[bkw]'\s*:/.test(JOB_SCREEN), false, 'no hard-coded key literal in the handler');
  });
});
