// tests/cut-meta.test.mjs — the META lane of THE CUT (designs/CUT-BRIEF.md · designs/CUT-SPEC.md).
//
// Three surfaces, one rule each:
//
//   settings.js   prints the three bands (CUT-BRIEF math #2: "the bands are printed in Settings").
//                 The bands are a CLAIM ABOUT ARITHMETIC — "you get it right less than 2 times in 3" —
//                 so §1 below re-derives them from the SHIPPED payoff table by exhaustive grid search
//                 and asserts the words name exactly the numbers that search found. CUT-BRIEF's hard
//                 limit: "No number on any surface that is not exactly the number the engine computes."
//                 Prose fractions are numbers.
//
//   stats.js      prints NOTHING about the game (§3). A point buys nothing but beating
//                 `save.player.best`, and that is printed where it is earned.
//
//   trophies.js   prices NOTHING about the game (§4): every predicate is blind to `save.player`,
//                 `save.game` and `inProgress.game`, and no trophy can be taken away by getting
//                 better at the material (CUT-BRIEF math #6, "improving never costs").
//
// Every checker in this file is a PURE EXPORTED FUNCTION with a negative control beside it — a test
// that cannot fail is worse than no test, and the layer this replaced shipped several. The payoff
// module is reached through the import statement `settings.js` itself writes, so CUT-SPEC §8's
// rename of `job/econ.js` → `job/pay.js` (landed) moves this proof with the screen instead of orphaning it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
// §9 only — the claim `settings.game = false` is byte-identical COMPOSED is held against the
// pre-game tree by digest, so it needs a hash and the real file list, and nothing else.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { read, repoPath, stripCommentsAndStrings, listFiles } from './_helpers.mjs';
import { fresh } from '../site/js/store.js';
import { COPY } from '../site/data/job.js';
import { trophies, TROPHY_IDS, GROUPS, ORIGINAL_IDS, sheetOriginals, COUNTERS } from '../site/data/trophies.js';
import { summary, check } from '../site/js/trophies.js';
// §6 only — the two doors the switch used to leave open, and the study layer's own two verbs, so the
// exploit is replayed on the shipped route rather than on a description of it.
import { gameOn, hasLiveJob } from '../site/js/plan.js';
import { markItem, finishPage } from '../site/js/page.js';

const SETTINGS = read('site/js/screens/settings.js');
const STATS = read('site/js/screens/stats.js');

/* ------------------------------------------------------------------ the shipped payoff table
   Resolved from settings.js's OWN import line, so this suite prices whatever module the screen
   actually prints from — `job/pay.js` since CUT-SPEC §8's rename landed. */

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*'(\.\.\/job\/[^']+)'/g;
function payModuleSpecifier(src) {
  for (const m of src.matchAll(IMPORT_RE)) {
    if (/\bBANDS\b/.test(m[1])) return m[2];
  }
  return null;
}
const PAY_SPEC = payModuleSpecifier(SETTINGS);
const PAY = PAY_SPEC
  ? await import(new URL(PAY_SPEC, pathToFileURL(repoPath('site/js/screens/settings.js'))).href)
  : null;

/** The names a source imports from one specifier, sorted. `[]` when it does not import it at all. */
export function namedImports(src, spec) {
  for (const m of String(src).matchAll(IMPORT_RE)) {
    if (m[2] !== spec) continue;
    return m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).sort();
  }
  return [];
}

/* The state module Settings closes a live session with (§6). Resolved the same way as the payoff
   table — from the screen's own import line — so a rename moves the proof with the screen. */
const STATE_SPEC = [...SETTINGS.matchAll(IMPORT_RE)].map(m => m[2]).find(s => /\bstate\b/.test(s)) ?? null;
const STATE = STATE_SPEC
  ? await import(new URL(STATE_SPEC, pathToFileURL(repoPath('site/js/screens/settings.js'))).href)
  : null;

/* ================================================================== §1 the bands, re-derived */

/**
 * Expected points of one call at hit rate `k/D`, scaled by `D` so the whole sweep is integer
 * arithmetic: `pay·q − cost·(1−q)`, times D. No floats, so an edge is an edge and not a rounding.
 */
export const evScaled = (pay, cost, k, D) => pay * k - cost * (D - k);

/**
 * The index of the call that maximises expected points at `k/D`. A tie takes the LOWER call
 * (CUT-SPEC §2: "edge ties take the lower call"), which is what the strict `>` below encodes.
 */
export function argmaxCall(calls, pays, costs, k, D, m = 1) {
  let best = 0;
  let bestV = m * evScaled(pays[calls[0]], costs[calls[0]], k, D);
  for (let i = 1; i < calls.length; i++) {
    const v = m * evScaled(pays[calls[i]], costs[calls[i]], k, D);
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

/**
 * Sweep `q = k/D` for k = 1 … D−1 and return the maximal runs of constant argmax:
 * `[{ call, index, loK, hiK }]`, in q order. A call that is never optimal simply has no run, which
 * is the shape CUT-BRIEF math #2 forbids ("a call that is never optimal does not ship").
 */
export function measureBands(calls, pays, costs, { D = 1_500_000, m = 1 } = {}) {
  const runs = [];
  for (let k = 1; k < D; k++) {
    const i = argmaxCall(calls, pays, costs, k, D, m);
    const last = runs[runs.length - 1];
    if (last && last.index === i) last.hiK = k;
    else runs.push({ call: calls[i], index: i, loK: k, hiK: k });
  }
  return runs;
}

/**
 * The fractions a band line CLAIMS, read out of its own words: `2 times in 3` and `2 in 3` both
 * parse to 2/3. Returns `{ lo, hi }` as [numerator, denominator] pairs, using the sentence's shape
 * — "less than X" is an upper edge, "more than X" a lower one, "between X and Y" both.
 */
export function bandClaim(copy) {
  const fracs = [...String(copy).matchAll(/(\d+)\s*(?:times\s+)?in\s+(\d+)/g)].map(m => [+m[1], +m[2]]);
  const s = String(copy);
  if (/\bbetween\b/.test(s) && fracs.length === 2) return { lo: fracs[0], hi: fracs[1] };
  if (/\bless than\b/.test(s) && fracs.length === 1) return { lo: [0, 1], hi: fracs[0] };
  if (/\bmore than\b/.test(s) && fracs.length === 1) return { lo: fracs[0], hi: [1, 1] };
  return null;
}

/** k/D as a reduced [numerator, denominator]. */
export function reduce(k, D) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(k, D) || 1;
  return [k / d, D / d];
}

test('CUT §1: the three bands Settings prints are the shipped table’s own crossings', async (t) => {
  assert.ok(PAY_SPEC, 'settings.js must import BANDS from a module under js/job/');
  for (const name of ['CALLS', 'PAYS', 'COSTS', 'BANDS', 'honestCall', 'MULT_MAX']) {
    assert.ok(PAY[name] !== undefined, `${PAY_SPEC} must export ${name}`);
  }
  const { CALLS, PAYS, COSTS, BANDS, honestCall, MULT_MAX } = PAY;
  const D = 1_500_000;          // divisible by 3, 4 and 5 — 2/3, 3/4 and 4/5 are all exact grid points
  const runs = measureBands(CALLS, PAYS, COSTS, { D });

  await t.test('every call is uniquely optimal on one non-empty contiguous band, in call order', () => {
    assert.equal(runs.length, CALLS.length, `bands measured: ${runs.map(r => r.call).join(' | ')}`);
    assert.deepEqual(runs.map(r => r.call), [...CALLS], 'the bands run in call order, cheapest first');
    for (const r of runs) assert.ok(r.hiK >= r.loK, `${r.call}: empty band`);
  });

  await t.test('the two edges are exactly 2/3 and 4/5, and they come from the cost GAPS', () => {
    // CUT-SPEC §7.2: assert Δcost = 2·Δpay then 4·Δpay, not a tolerance on the crossing.
    const dPay = CALLS.slice(1).map((c, i) => PAYS[c] - PAYS[CALLS[i]]);
    const dCost = CALLS.slice(1).map((c, i) => COSTS[c] - COSTS[CALLS[i]]);
    assert.deepEqual(dPay, [1, 1], 'pay gaps');
    assert.equal(dCost[0], 2 * dPay[0], 'Δcost = 2·Δpay between not sure and pretty sure');
    assert.equal(dCost[1], 4 * dPay[1], 'Δcost = 4·Δpay between pretty sure and sure');
    // The crossing of two lines that differ by Δpay and Δcost is Δcost / (Δpay + Δcost).
    const edges = dPay.map((dp, i) => reduce(dCost[i], dp + dCost[i]));
    assert.deepEqual(edges, [[2, 3], [4, 5]], 'crossings from the gaps');
    // …and that is where the measured sweep actually turns over.
    assert.deepEqual(reduce(runs[0].hiK, D), [2, 3], 'not sure ends at 2/3');
    assert.deepEqual(reduce(runs[1].hiK, D), [4, 5], 'pretty sure ends at 4/5');
    assert.equal(runs[1].loK, runs[0].hiK + 1);
    assert.equal(runs[2].loK, runs[1].hiK + 1);
  });

  await t.test('the middle call is not dominated: not sure and sure cross at 3/4, inside its band', () => {
    const [a, , c] = CALLS;
    const dPay = PAYS[c] - PAYS[a], dCost = COSTS[c] - COSTS[a];
    assert.deepEqual(reduce(dCost, dPay + dCost), [3, 4], 'not sure vs sure');
    const k34 = (3 * D) / 4;
    assert.ok(k34 > runs[1].loK && k34 < runs[1].hiK, '3/4 lies strictly inside the pretty sure band');
  });

  await t.test(`the shipped honestCall() agrees on every one of ${(D - 1).toLocaleString('en-US')} grid points`, () => {
    let bad = 0, firstBad = null;
    for (let k = 1; k < D; k++) {
      const want = CALLS[argmaxCall(CALLS, PAYS, COSTS, k, D)];
      const got = honestCall(k / D);
      if (want !== got) { bad++; if (!firstBad) firstBad = { q: k / D, want, got }; }
    }
    assert.equal(bad, 0, `honestCall disagrees with the table ${bad} times, first ${JSON.stringify(firstBad)}`);
  });

  await t.test('the streak multiplier moves neither edge — ×1 … ×5 pick the same call everywhere', () => {
    const d = 15_000;
    let bad = 0;
    for (let m = 1; m <= MULT_MAX; m++) {
      for (let k = 1; k < d; k++) {
        if (argmaxCall(CALLS, PAYS, COSTS, k, d, m) !== argmaxCall(CALLS, PAYS, COSTS, k, d, 1)) bad++;
      }
    }
    assert.equal(bad, 0, `${bad} cells where the multiplier changed the best call`);
  });

  await t.test('BANDS — the rows Settings prints — carry those measured edges', () => {
    assert.equal(BANDS.length, 3);
    BANDS.forEach((b, i) => {
      assert.equal(b.call, CALLS[i], `BANDS[${i}].call`);
      const lo = i === 0 ? 0 : runs[i - 1].hiK / D;       // the crossing itself, not the first grid point past it
      const hi = i === BANDS.length - 1 ? 1 : runs[i].hiK / D;
      assert.ok(Math.abs(b.lo - lo) < 1e-9, `BANDS[${i}].lo = ${b.lo}, measured ${lo}`);
      assert.ok(Math.abs(b.hi - hi) < 1e-9, `BANDS[${i}].hi = ${b.hi}, measured ${hi}`);
    });
  });

  await t.test('and the WORDS name those same fractions — no number on the surface the engine did not compute', () => {
    const want = [
      { lo: [0, 1], hi: reduce(runs[0].hiK, D) },
      { lo: reduce(runs[0].hiK, D), hi: reduce(runs[1].hiK, D) },
      { lo: reduce(runs[1].hiK, D), hi: [1, 1] },
    ];
    BANDS.forEach((b, i) => {
      const claim = bandClaim(b.copy);
      assert.ok(claim, `BANDS[${i}].copy states no band: ${JSON.stringify(b.copy)}`);
      assert.deepEqual(claim, want[i], `BANDS[${i}].copy claims the wrong band: ${b.copy}`);
      assert.ok(b.copy.startsWith(`${b.call} — `), `BANDS[${i}].copy must name its own call`);
    });
  });

  await t.test('the band lines are CUT-SPEC §6 verbatim', () => {
    assert.deepEqual(BANDS.map(b => b.copy), [
      'not sure — you get it right less than 2 times in 3',
      'pretty sure — between 2 in 3 and 4 in 5',
      'sure — more than 4 in 5',
    ]);
  });
});

test('CUT §1 negative control: the band checkers can fail', async (t) => {
  const CALLS = ['not sure', 'pretty sure', 'sure'];
  const PAYS = { 'not sure': 8, 'pretty sure': 9, sure: 10 };
  const COSTS = { 'not sure': 2, 'pretty sure': 4, sure: 8 };
  const D = 60_000;

  await t.test('a call that is never optimal is MISSING from the measured bands', () => {
    // 'pretty sure' priced at cost 6 is dominated: 8 vs 6 is never worth 1 extra point of pay.
    const broken = { ...COSTS, 'pretty sure': 6 };
    const runs = measureBands(CALLS, PAYS, broken, { D });
    assert.equal(runs.length, 2, 'the checker did not notice the dominated call');
    assert.ok(!runs.some(r => r.call === 'pretty sure'));
    assert.equal(measureBands(CALLS, PAYS, COSTS, { D }).length, 3, 'the shipped table still has three');
  });

  await t.test('a moved cost moves the measured edge, so the printed words stop matching', () => {
    const broken = { ...COSTS, sure: 7 };                    // 4/5 → 3/4
    const runs = measureBands(CALLS, PAYS, broken, { D });
    assert.deepEqual(reduce(runs[1].hiK, D), [3, 4]);
    const claim = bandClaim('pretty sure — between 2 in 3 and 4 in 5');
    assert.notDeepEqual(claim.hi, reduce(runs[1].hiK, D), 'the words would still have passed');
  });

  await t.test('bandClaim reads the sentence, and refuses one it cannot read', () => {
    assert.deepEqual(bandClaim('not sure — you get it right less than 2 times in 3'), { lo: [0, 1], hi: [2, 3] });
    assert.deepEqual(bandClaim('pretty sure — between 2 in 3 and 4 in 5'), { lo: [2, 3], hi: [4, 5] });
    assert.deepEqual(bandClaim('sure — more than 4 in 5'), { lo: [4, 5], hi: [1, 1] });
    assert.deepEqual(bandClaim('pretty sure — between 3 in 4 and 4 in 5'), { lo: [3, 4], hi: [4, 5] });
    assert.equal(bandClaim('sure — you will probably get it'), null, 'a band line with no number must not pass');
    assert.equal(bandClaim('sure — 80 %'), null, 'a percentage is not a number this engine computes');
  });

  await t.test('a tie takes the lower call, and the sweep proves it', () => {
    assert.equal(argmaxCall(CALLS, PAYS, COSTS, 2, 3, 1), 0, 'q = 2/3 is not sure');
    assert.equal(argmaxCall(CALLS, PAYS, COSTS, 4, 5, 1), 1, 'q = 4/5 is pretty sure');
    assert.equal(argmaxCall(CALLS, PAYS, COSTS, 4001, 5000, 1), 2, 'just above 4/5 is sure');
  });
});

/* ================================================================== §2 what Settings may print */

/** Every string literal in `src`, in source order (template substitutions are not re-entered). */
export function stringLiterals(src) {
  const out = [];
  const s = String(src);
  let i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      let body = '';
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') { body += s[i + 1] ?? ''; i += 2; continue; }
        if (q !== '`' && s[i] === '\n') break;
        body += s[i++];
      }
      i++;
      out.push(body);
      continue;
    }
    i++;
  }
  return out;
}

/** The body of `function <name>(` … `)` by brace matching, or null. */
export function functionBody(src, name) {
  const at = String(src).indexOf(`function ${name}(`);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open + 1, i); }
  }
  return null;
}

/** Every `COPY.a.b` path a source reads, deduped and sorted. */
export const copyKeysUsed = (src) =>
  [...new Set([...String(src).matchAll(/\bCOPY\.([A-Za-z0-9_.]+)/g)].map(m => m[1]))].sort();

test('CUT §2: Settings prints the seven strings CUT-SPEC §6 allows it, and no eighth', async (t) => {
  await t.test('the game card exists and holds no hard-coded copy at all', () => {
    const body = functionBody(SETTINGS, 'gameCard');
    assert.ok(body, 'settings.js has no gameCard()');
    const lits = new Set(stringLiterals(body));
    // Everything a student reads comes from data; what is left is an element id and a toast tone.
    assert.deepEqual([...lits].sort(), ['ok', 'set-game'], `gameCard hard-codes copy: ${[...lits].join(' | ')}`);
    assert.match(body, /CALL_BANDS\.map/, 'the bands are printed from the shipped table');
    assert.match(body, /COPY\.settings\.greyed/, 'the greyed-call note is printed');
    assert.match(body, /s\.settings\.game !== false/, 'the toggle reads settings.game');
  });

  await t.test('Settings reads only the four Settings strings out of COPY', () => {
    assert.deepEqual(copyKeysUsed(SETTINGS), ['settings.greyed', 'settings.off', 'settings.on', 'settings.title']);
  });

  await t.test('and those four are CUT-SPEC §6 verbatim', () => {
    assert.deepEqual(COPY.settings, {
      title: 'The game',
      on: 'on',
      off: 'off',
      greyed: 'you can only pick one your pile can pay for',
    });
  });

  await t.test('the whole Settings vocabulary for the game is those four plus the three bands', () => {
    const printed = [COPY.settings.title, COPY.settings.on, COPY.settings.off, ...PAY.BANDS.map(b => b.copy), COPY.settings.greyed];
    assert.equal(printed.length, 7);
    assert.equal(new Set(printed).size, 7, 'a string is printed twice');
  });

  await t.test('turning the game off takes the bands with it', () => {
    const body = functionBody(SETTINGS, 'gameCard');
    const gated = [...body.matchAll(/\.\.\.\(on \?/g)].length;
    assert.equal(gated, 2, 'both the bands and the greyed note are gated on the toggle');
  });

  /* Settings reaches TWO modules under `js/job/`, and the second one is new (§6 below): the switch
     has to be able to CLOSE a live session, not merely stop offering one, or turning the game off
     mid-question hands the live queue to `#/run/page`. What has not changed is the rule this test
     was written for — Settings does not PLAY. It may not start a session, take a turn, or quote a
     price for a call the student has not made; the four verbs it may use are named exactly, so a
     fifth one appearing here fails rather than passing unnoticed. */
  await t.test('Settings reaches the payoff table it prints from and the four verbs it closes a session with', () => {
    const jobImports = [...SETTINGS.matchAll(IMPORT_RE)].map(m => m[2]);
    assert.deepEqual(jobImports, [PAY_SPEC, STATE_SPEC], `Settings imports ${jobImports.join(', ')}`);
    assert.deepEqual(namedImports(SETTINGS, STATE_SPEC), ['bank', 'priceOf', 'stateOf', 'writeGame']);
    const code = stripCommentsAndStrings(SETTINGS);
    for (const banned of ['startJob', 'endJob', 'shouldPush', 'payOf', 'costOf', 'offered', 'callsFor', 'answer']) {
      assert.ok(!new RegExp(`\\b${banned}\\b`).test(code), `Settings calls ${banned} — it prints, it does not play`);
    }
    // `call` is a real word in English prose, so it is checked where it would do damage: as a verb.
    assert.ok(!/\bcall\s*\(/.test(code), 'Settings locks a call');
  });

  await t.test('no cut mechanic is still named on the screen', () => {
    const lits = stringLiterals(SETTINGS).join('\n');
    for (const word of ['loot', 'posted', 'backchecks?', 'crew', 'guard', 'vault',
      'fault index', 'elo', 'wings?', 'contracts?', 'getaway', 'tokens?', 'rank']) {
      assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(lits), `Settings still prints "${word}"`);
    }
  });
});

/* ================================================================== §3 Stats says nothing */

test('CUT §3: Stats prints nothing about the game', async (t) => {
  await t.test('it imports no game module', () => {
    const imports = [...STATS.matchAll(/from\s*'([^']+)'/g)].map(m => m[1]);
    for (const spec of imports) {
      assert.ok(!/\/job\//.test(spec) && !/data\/job\.js$/.test(spec), `Stats imports ${spec}`);
    }
  });

  await t.test('it reads no game save key', () => {
    // Comments only: a read hidden in a template substitution (`${save.player.best}`) is still a read,
    // and stripCommentsAndStrings does not re-enter `${…}`.
    const code = STATS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of [/\.player\b/, /\bsave\.game\b/, /\binProgress\b/, /\bplayer\.best\b/]) {
      assert.ok(!re.test(code), `Stats reads ${re}`);
    }
  });

  await t.test('it prints none of the game’s strings', () => {
    const lits = stringLiterals(STATS);
    const joined = lits.join('\n');
    for (const phrase of ['pile', 'you got this right', 'not sure', 'pretty sure', 'bank',
      'of this session was the game', 'The game']) {
      assert.ok(!joined.includes(phrase), `Stats prints "${phrase}"`);
    }
    for (const exact of ['pays', 'sure', 'new', 'streak']) {
      assert.ok(!lits.includes(exact), `Stats prints the game's "${exact}"`);
    }
  });

  await t.test('and it names none of the game’s state, so a fourth number cannot arrive here by accident', () => {
    const code = stripCommentsAndStrings(STATS);
    for (const key of ['pile', 'tGame', 'tAnswer', 'honestCall', 'shouldPush', 'payOf']) {
      assert.ok(!code.includes(key), `Stats mentions ${key}`);
    }
  });
});

/* ================================================================== §4 trophies price nothing */

const AT = new Date(2026, 8, 16, 10, 0, 0).getTime();
const CUT_TROPHIES = ['crew-held', 'index-25', 'index-68', 'chain-8', 'calibrated', 'clean-getaway'];

function clear(s, id, { rarity = 'gold', at = AT } = {}) {
  s.cards[id] = {
    attempts: 1, cleared: true, rarity, foil: rarity === 'platinum', foilProgress: [],
    bucket: 1, lastAt: at, due: at + 86_400_000, hintsUsed: 0, solutionShown: false,
    bestMs: 30_000, placed: false, work: '',
    history: [{ at, ok: true, attempt: 1, hints: 0, ms: 30_000 }],
  };
  return s;
}
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, skill: 'VOC', tier: 1, raw: '', credit: 1, ms: 5000, clean: true, flagged: false }));
const addRun = (s, run) => {
  s.runs.push({ n: s.runs.length + 1, seed: 'seed', startedAt: AT - 600_000, submittedAt: AT, status: 'done', items: [], ...run });
  return s;
};

/** A save with the game played hard: a best day, points banked, a session mid-flight. */
function withGame(s) {
  // Deliberately enormous: a trophy thresholded ANYWHERE would move, so `shape(played) === shape(base)`
  // is a real claim about blindness rather than a claim about the size of these three numbers.
  s.player = { best: 9_999 };
  s.game = { today: 9_999, day: '2026-09-16' };
  s.inProgress = { ...(s.inProgress || {}), game: { pile: 9_999, streak: 5, call: { id: 'sure', at: AT }, answered: 99, tGame: 610_000, tAnswer: 740_000, seed: 'x' } };
  return s;
}

/** summary() reduced to what a tile shows: earned, and the meter under it. */
const shape = (save) => summary(save).map(t => `${t.id}:${t.earned ? 1 : 0}:${t.progress ? t.progress.have : '-'}`);

test('CUT §4: no trophy is denominated in the game', async (t) => {
  await t.test('the six cut trophies are gone and no group replaced them', () => {
    for (const id of CUT_TROPHIES) assert.ok(!TROPHY_IDS.includes(id), `${id} is still in the catalogue`);
    assert.deepEqual(GROUPS.map(g => g.id), ['firsts', 'sheets', 'craft', 'runs', 'bosses', 'habit']);
    assert.equal(new Set(TROPHY_IDS).size, TROPHY_IDS.length);
  });

  await t.test('no predicate, name or condition names a cut mechanic', () => {
    const banned = /\b(crew|guard|loot|chain|elo|vault|wing|backcheck|contract|token|posted|getaway|rank|bag|pile|Fault Index)\b/i;
    for (const t of trophies) {
      assert.ok(!banned.test(t.name), `${t.id}: name "${t.name}"`);
      assert.ok(!banned.test(t.cond), `${t.id}: cond "${t.cond}"`);
      const src = String(t.test);
      assert.ok(!/\bplayer\b|\bsave\.game\b|inProgress|\bpile\b|\bbanked?\b/.test(src), `${t.id}: predicate reads the game`);
    }
  });

  await t.test('every trophy is blind to save.player, save.game and inProgress.game', () => {
    const base = clear(fresh(AT), 'voc-01');
    addRun(base, { kind: 'page', items: items(10), xp: 540 });
    base.counters.rejects = 5;
    base.streak = { count: 4, best: 4 };
    const played = withGame(structuredClone(base));
    assert.deepEqual(shape(played), shape(base), 'a game record moved a trophy');
    assert.deepEqual(check(played), check(base));
  });

  await t.test('and the game cannot be spent on one: a maximal game record earns nothing at all', () => {
    assert.deepEqual(check(withGame(fresh(AT))), [], 'the game bought a trophy');
  });
});

test('CUT §4: improving never costs — no trophy or meter can go backwards', async (t) => {
  // Each step is strictly MORE study progress than the one before it and takes nothing away.
  const steps = [
    ['fresh', (s) => s],
    ['one card cleared', (s) => clear(s, ORIGINAL_IDS[0], { rarity: 'bronze' })],
    ['that card upgraded to gold', (s) => clear(s, ORIGINAL_IDS[0], { rarity: 'gold' })],
    ['a whole sheet cleared', (s) => { for (const id of sheetOriginals('ASN')) clear(s, id, { rarity: 'bronze' }); return s; }],
    ['that sheet taken to gold', (s) => { for (const id of sheetOriginals('ASN')) clear(s, id, { rarity: 'gold' }); return s; }],
    ['counters bumped', (s) => { for (const k of Object.keys(COUNTERS)) { s.counters[k] = 3; if (COUNTERS[k].best) s.counters[`${k}Best`] = 3; } return s; }],
    ['counters bumped again', (s) => { for (const k of Object.keys(COUNTERS)) { s.counters[k] = 40; if (COUNTERS[k].best) s.counters[`${k}Best`] = 40; } return s; }],
    ['a flawless Page', (s) => addRun(s, { kind: 'page', items: items(12), xp: 600 })],
    ['a 95 % Mock', (s) => addRun(s, { kind: 'mock', acc: 0.95, pred: 93, items: items(20) })],
    ['a three-day streak', (s) => { s.streak = { count: 3, best: 3 }; return s; }],
    ['a seven-day streak', (s) => { s.streak = { count: 7, best: 7 }; return s; }],
    ['every original cleared', (s) => { for (const id of ORIGINAL_IDS) clear(s, id, { rarity: 'gold' }); return s; }],
  ];

  await t.test(`${trophies.length} trophies over ${steps.length} strictly better saves`, () => {
    let save = fresh(AT);
    let prevEarned = new Set();
    let prevHave = new Map();
    let lost = 0, dropped = 0;
    const names = [];
    for (const [label, mutate] of steps) {
      save = mutate(save);
      const rows = summary(save);
      const earned = new Set(rows.filter(r => r.earned).map(r => r.id));
      for (const id of prevEarned) {
        if (!earned.has(id)) { lost++; names.push(`${id} un-earned at "${label}"`); }
      }
      for (const r of rows) {
        if (!r.progress) continue;
        const was = prevHave.get(r.id);
        if (was != null && r.progress.have < was) { dropped++; names.push(`${r.id} meter fell ${was} → ${r.progress.have} at "${label}"`); }
        prevHave.set(r.id, r.progress.have);
      }
      prevEarned = earned;
    }
    assert.equal(lost, 0, names.join('; '));
    assert.equal(dropped, 0, names.join('; '));
    assert.ok(prevEarned.size >= 20, `the ladder must actually climb — only ${prevEarned.size} earned at the top`);
  });
});

test('CUT §4 negative control: the monotone checker can fail', () => {
  // A predicate that reads the game is exactly what the old layer shipped: `calibrated` came and went
  // with a rolling window. Run the same comparison over a tile that un-earns itself and the checker
  // must catch it — if it does not, a green run above means nothing.
  const rows = [
    [{ id: 'x', earned: true, progress: { have: 5, need: 10 } }],
    [{ id: 'x', earned: false, progress: { have: 2, need: 10 } }],
  ];
  let lost = 0, dropped = 0;
  let prevEarned = new Set();
  const prevHave = new Map();
  for (const snap of rows) {
    const earned = new Set(snap.filter(r => r.earned).map(r => r.id));
    for (const id of prevEarned) if (!earned.has(id)) lost++;
    for (const r of snap) {
      const was = prevHave.get(r.id);
      if (was != null && r.progress.have < was) dropped++;
      prevHave.set(r.id, r.progress.have);
    }
    prevEarned = earned;
  }
  assert.equal(lost, 1, 'the un-earn check is dead');
  assert.equal(dropped, 1, 'the falling-meter check is dead');
});

test('CUT §2 negative control: the surface checkers can fail', async (t) => {
  await t.test('functionBody / stringLiterals find hard-coded copy', () => {
    const broken = "function gameCard(s) { return card('The game', hint('one more!')); }";
    assert.deepEqual([...new Set(stringLiterals(functionBody(broken, 'gameCard')))].sort(), ['The game', 'one more!']);
    assert.equal(functionBody('nothing here', 'gameCard'), null);
  });

  await t.test('copyKeysUsed notices a fifth key', () => {
    assert.deepEqual(copyKeysUsed("h('p', COPY.settings.title, COPY.pays({ n: 27 }))"), ['pays', 'settings.title']);
    assert.deepEqual(copyKeysUsed('nothing'), []);
  });
});

/* ================================================================== §5 nothing calls a hole

   The demolition of the old layer took `dataCard()` out of `settings.js` and left `paint()` still
   calling it: `#/settings` threw a ReferenceError on mount and the whole screen — theme, goal, test
   date, export, the game toggle — rendered nothing. No test in the suite could see it, because the
   screens have no DOM here. This one can, and it is the reason the export card is back.             */

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'delete',
  'void', 'in', 'of', 'do', 'else', 'case', 'await', 'yield', 'throw', 'instanceof', 'super', 'this',
  'class', 'extends', 'import', 'export', 'function', 'const', 'let', 'var', 'try', 'finally', 'with',
  'async', 'static', 'get', 'set']);

/** The globals a zero-build ES module in a browser may reach without declaring them. */
const GLOBALS = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Set',
  'Map', 'WeakMap', 'WeakSet', 'Promise', 'Error', 'TypeError', 'RangeError', 'RegExp', 'Symbol', 'BigInt',
  'Proxy', 'Reflect', 'Intl', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'structuredClone', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'console', 'document', 'window',
  'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'URL', 'URLSearchParams', 'Blob',
  'File', 'FileReader', 'fetch', 'Headers', 'Request', 'Response', 'AbortController', 'CustomEvent',
  'Event', 'Node', 'Element', 'HTMLElement', 'Image', 'Audio', 'AudioContext', 'IntersectionObserver',
  'MutationObserver', 'ResizeObserver', 'MediaQueryList', 'matchMedia', 'getComputedStyle', 'alert',
  'performance', 'crypto', 'TextEncoder', 'TextDecoder', 'Uint8Array', 'Float64Array']);

/**
 * Every bare `name(` call in `src` whose `name` is never bound anywhere in the file.
 *
 * A name counts as BOUND by any occurrence that is not itself a call — an import binding, a
 * `const`/`let`/`var`, a destructured field, a parameter — and by `function name(`. A name counts
 * as CALLED where it is followed by `(` and is not a property access. Comments and string bodies
 * are stripped first, so prose and copy can never trip it.
 */
export function undefinedCalls(src, { globals = GLOBALS } = {}) {
  const code = stripCommentsAndStrings(src);
  const called = new Set();
  const bound = new Set();
  const ID = /(\.\.\.|\??\.)?\b([A-Za-z_$][\w$]*)\b[ \t]*(\()?/g;
  let prevWord = '';
  for (const m of code.matchAll(ID)) {
    const [, access, name, call] = m;
    if (KEYWORDS.has(name)) { prevWord = name; continue; }
    if (access === '.' || access === '?.') { prevWord = name; continue; }   // a property, not a free name
    if (call && prevWord !== 'function') called.add(name);
    else bound.add(name);
    prevWord = name;
  }
  return [...called].filter(n => !bound.has(n) && !globals.has(n)).sort();
}

test('CUT §5: every screen this lane owns calls only what it has', async (t) => {
  const OWNED = [
    ['site/js/screens/settings.js', SETTINGS],
    ['site/js/screens/stats.js', STATS],
    ['site/data/trophies.js', read('site/data/trophies.js')],
  ];

  for (const [path, src] of OWNED) {
    await t.test(`${path} has no call to an undeclared name`, () => {
      assert.deepEqual(undefinedCalls(src), [], `${path} calls a hole`);
    });
  }

  await t.test('Settings still builds the export card COMPOSED S6 owes the student', () => {
    assert.ok(functionBody(SETTINGS, 'dataCard'), 'settings.js has no dataCard()');
    assert.match(SETTINGS, /dataCard\(\)/, 'paint() must still mount it');
    for (const wanted of ['exportJSON', 'importJSON', 'readBackup', 'reset']) {
      assert.ok(new RegExp(`\\b${wanted}\\b`).test(stripCommentsAndStrings(SETTINGS)), `no ${wanted}`);
    }
  });
});

test('CUT §5 negative control: the hole-finder can fail', async (t) => {
  await t.test('a call to a name nothing declares is reported', () => {
    assert.deepEqual(undefinedCalls('function paint() { return dataCard(); }'), ['dataCard']);
    assert.deepEqual(undefinedCalls('function dataCard() { return 1; }\nfunction paint() { return dataCard(); }'), []);
  });

  await t.test('declarations of every shape count as bound', () => {
    assert.deepEqual(undefinedCalls("import { h } from 'x';\nconst f = () => h();"), []);
    assert.deepEqual(undefinedCalls("import { isSupported as ok } from 'x';\nok();"), []);
    assert.deepEqual(undefinedCalls('let g = () => {};\ng();'), []);
    assert.deepEqual(undefinedCalls('function t({ onchange }) { onchange(1); }'), []);
    assert.deepEqual(undefinedCalls('function b(runs, keyOf) { return runs.map(r => keyOf(r)); }'), []);
    // Conservative on purpose: a name used only as a VALUE (a default, an argument) counts as bound.
    // The checker is here to catch a call to a name that exists nowhere, which is the bug it found.
    assert.deepEqual(undefinedCalls('function b({ fmt = n0 }) { return fmt(1); }'), []);
    assert.deepEqual(undefinedCalls('const f = async (e) => { await g(e); };\nfunction g() {}'), []);
  });

  await t.test('prose and copy never trip it', () => {
    assert.deepEqual(undefinedCalls("// call dataCard() here one day\nconst s = 'run paint() twice';"), []);
    assert.deepEqual(undefinedCalls('const x = Math.round(1) + String(2);'), []);
  });
});

/* ==========================================================================================
   §6 THE SWITCH IS A DOOR, AND IT CANNOT BE SHUT ON SOMEONE STANDING IN IT
   ==========================================================================================
   Round 1 exploit-hunt, `settings.js:287`. The game toggle used to be `st.settings.game = v` and
   nothing else, so flipping it mid-session left `inProgress.game` on the save while `plan.gameOn`
   went false. `plan.nextActionFor` then stopped rewriting the resume href, Home's primary button
   went to `#/run/page`, and `screens/run.js` reopened the very same page with the game's record
   still riding on it. Two holes fell out of that:

     (a) ANY QUESTION COULD BE DODGED FOR NOTHING. Toggle off, answer it on the flat page, toggle
         back on: `state.answer` never ran, so the locked bid and the ×5 streak were both still
         there, and the cost the bid promised was never paid.
     (b) FINISHING FLAT DESTROYED THE PILE. `page.finishPage` clears `inProgress` — and the record
         inside it — so the whole unbanked pile vanished with no message and no `commitJobRun`.

   The fix is `leaveSession()` in `settings.js`, and this section does not paraphrase it: it reads
   the SHIPPED function body out of the screen and runs it against the SHIPPED `job/state.js`. A
   rewrite of the fix that reopens either hole fails here, and a fix that drifts from the engine
   cannot drift silently — there is only one copy of it under test.

   What must hold after the switch goes off, in every reachable state:
     1. the record is gone, so `#/run/page` carries nothing;
     2. `inProgress` — the PAGE, its queue and its index — is untouched, so the study layer's own
        questions are still due and still in order, and `finishPage` still counts exactly one page;
     3. the pile came home through `bank()`, so nothing is destroyed and `game.today` never falls;
     4. a LOCKED BID IS SETTLED, NOT DODGED: leaving costs exactly what missing costs, so leaving
        never beats answering — CUT-BRIEF math #5, applied to the one exit that escaped it;
     5. nothing in Ledger A moved.                                                               */

/** The shipped `leaveSession(st)` out of `settings.js`, wired to the shipped engine. */
function shippedLeaveSession() {
  const body = functionBody(SETTINGS, 'leaveSession');
  assert.ok(body, 'settings.js has no leaveSession()');
  const fn = new Function('stateOf', 'writeGame', 'priceOf', 'bank', 'console', 'st', body);
  const quiet = { warn() {}, error() {}, log() {} };
  return (st) => fn(STATE.stateOf, STATE.writeGame, STATE.priceOf, STATE.bank, quiet, st);
}

const qitem = (n) => ({ n, id: `c${n}`, role: 'core', tier: 1, skill: 'sk', kind: 'card', done: false, result: null });
/** The smallest save with a live session on it, and a Ledger A worth watching. */
const jrig = ({ pile = 0, streak = 1, len = 3, today = 0, best = 0 } = {}) => ({
  profileId: 'cut-meta', cards: { c1: { seen: 2 } }, skills: { sk: { m: 0.5, n: 3 } }, xp: { total: 120 },
  errors: [{ id: 'e' }], counters: {}, runs: [], trophies: {}, streak: { n: 4 }, jumps: [],
  settings: { game: true }, player: { best }, game: { today, day: '2026-09-16' },
  inProgress: {
    kind: 'page', seed: 7, queue: Array.from({ length: len }, (_, i) => qitem(i + 1)), idx: 0,
    startedAt: 0, day: '2026-09-16',
    game: { pile, streak, call: null, answered: 0, tGame: 0, tAnswer: 0, seed: '7' },
  },
});
const LEDGER_A = (s) => JSON.stringify(
  Object.fromEntries(STATE.LEDGER_A_KEYS.map(k => [k, s[k]])));

test('CUT §6: turning the game off closes the session instead of handing it to #/run/page', async (t) => {
  const leaveSession = shippedLeaveSession();

  await t.test('the toggle closes the session and flips the setting in ONE update, close-out first', () => {
    const body = functionBody(SETTINGS, 'gameCard');
    assert.match(
      body,
      /update\(\(st\)\s*=>\s*\{\s*if\s*\(!v\)\s*leaveSession\(st\);\s*st\.settings\.game\s*=\s*v;\s*\}\)/,
      'the game toggle must close a live session before it writes settings.game, in one update()',
    );
    // …and it is the ONLY caller: a second one would be a second policy.
    assert.equal([...stripCommentsAndStrings(SETTINGS).matchAll(/\bleaveSession\(/g)].length, 2,
      'leaveSession is declared once and called once');
  });

  await t.test('the record never survives the switch — the flat runner carries nothing', () => {
    const s = jrig({ pile: 146, streak: 5 });
    STATE.call(s, 'sure', { now: 1000 });
    leaveSession(s); s.settings.game = false;
    assert.equal(STATE.stateOf(s), null, 'inProgress.game outlived the switch');
    assert.equal(hasLiveJob(s), false);
    assert.equal(gameOn(s), false);
  });

  await t.test('the PAGE is untouched: same queue, same index, still exactly one page', () => {
    const s = jrig({ pile: 60, streak: 3, len: 4 });
    const queueBefore = JSON.stringify(s.inProgress.queue);
    leaveSession(s);
    assert.equal(JSON.stringify(s.inProgress.queue), queueBefore, 'the game re-ordered the study queue');
    assert.equal(s.inProgress.idx, 0);
    assert.equal(s.inProgress.kind, 'page');
    finishPage(s);
    assert.equal(s.counters.pages, 1, 'the page was counted twice, or not at all');
  });

  await t.test('(b) the pile comes home — finishing flat destroys nothing', () => {
    const s = jrig({ pile: 146, streak: 5, today: 20, best: 90 });
    leaveSession(s); s.settings.game = false;
    assert.equal(s.game.today, 166, 'the unbanked pile was not banked');
    assert.equal(s.player.best, 166);
    markItem(s, { cleared: false, attempt: 3, hints: 2 });
    finishPage(s);
    assert.equal(s.game.today, 166, 'finishing on #/run/page moved a banked number');
  });

  await t.test('(a) the dodge is closed: the bid is settled and the game is over for that page', () => {
    const s = jrig({ pile: 146, streak: 5 });
    STATE.call(s, 'sure', { now: 1000 });
    /* The cost is the SHIPPED table's, never a number pinned here: the payoff table is still being
       tuned by the engine lane, and a fixture that hard-codes 40 breaks on a retune while proving
       nothing extra. What the fixture must guarantee is that the settle is observable at all. */
    const { cost } = STATE.priceOf(s, 'sure');
    assert.ok(cost > 0 && cost <= 146, `the fixture no longer exercises a settle (cost ${cost})`);
    leaveSession(s); s.settings.game = false;
    assert.equal(s.game.today, 146 - cost, 'the locked bid was dodged for nothing');
    // Toggling back on mid-page cannot restore it: the page is now a plain page in progress.
    s.settings.game = true;
    markItem(s, { cleared: false, attempt: 3, hints: 2 });
    assert.deepEqual(STATE.pageInProgress(s), { idx: 1, left: 2 });
    assert.throws(() => STATE.startJob(s, { now: 2000 }), /page-in-progress/,
      'the game restarted over a page that had been answered into');
  });

  await t.test('leaving never beats answering, over the whole reachable call × streak × pile space', () => {
    let beatsMiss = 0, beatsRight = 0, checked = 0;
    for (const cid of PAY.CALLS) {
      for (let m = 1; m <= PAY.MULT_MAX; m++) {
        for (const pile of [0, 1, 2, 5, 19, 20, 73, 146, 400, 999, 5000]) {
          const s = jrig({ pile, streak: m });
          if (!STATE.callsFor(s).includes(cid)) continue;      // an unaffordable call is greyed out
          STATE.call(s, cid, { now: 1 });
          const { pay, cost } = STATE.priceOf(s, cid);
          leaveSession(s);
          const left = s.game.today;                            // what walking out banks
          const miss = Math.max(0, pile - cost);                // what answering it WRONG leaves
          const right = pile + pay;                             // …and answering it RIGHT
          checked++;
          if (left > miss) beatsMiss++;
          if (left > right) beatsRight++;
          assert.equal(left, miss, `leaving ≠ missing at ${cid} ×${m} pile ${pile}`);
          assert.ok(left >= 0, 'the pile went below zero');
        }
      }
    }
    assert.ok(checked > 100, `only ${checked} states reached`);
    assert.equal(beatsMiss, 0);
    assert.equal(beatsRight, 0);
  });

  await t.test('with no bid on the table it is an ordinary bank — and the streak goes with it', () => {
    const s = jrig({ pile: 146, streak: 5 });
    leaveSession(s);
    assert.equal(s.game.today, 146, 'a pile with no bid on it must come home whole');
    assert.equal(STATE.stateOf(s), null);
  });

  await t.test('and it writes nothing in Ledger A', () => {
    for (const withCall of [false, true]) {
      const s = jrig({ pile: 146, streak: 4 });
      if (withCall) STATE.call(s, 'pretty sure', { now: 1000 });
      const before = LEDGER_A(s);
      leaveSession(s); s.settings.game = false;
      assert.equal(LEDGER_A(s), before, `the switch wrote Ledger A (call: ${withCall})`);
    }
  });

  await t.test('a malformed record is dropped rather than left for #/run/page', () => {
    const s = jrig({ pile: 10 });
    s.inProgress.game = { pile: 'nonsense', streak: null, call: { id: 'not-a-call', at: 'x' } };
    leaveSession(s);
    assert.equal(STATE.stateOf(s), null, 'a record the engine cannot read still outlived the switch');
    assert.ok(Number.isFinite(s.game.today) && s.game.today >= 0);
  });

  await t.test('no live session: the switch changes nothing at all', () => {
    const s = jrig({ pile: 0 });
    delete s.inProgress.game;
    const snap = JSON.stringify(s);
    leaveSession(s);
    assert.equal(JSON.stringify(s), snap, 'the switch touched a save with no session on it');
  });
});

test('CUT §6 negative control: the §6 rig can fail', async (t) => {
  await t.test('the old one-liner toggle is caught', () => {
    // What `settings.js:287` used to be: the setting, and nothing else.
    const old = (st) => { /* no close-out at all */ void st; };
    const s = jrig({ pile: 146, streak: 5 });
    STATE.call(s, 'sure', { now: 1000 });
    old(s); s.settings.game = false;
    assert.notEqual(STATE.stateOf(s), null, 'the control must leave the record behind');
    markItem(s, { cleared: false, attempt: 3, hints: 2 });
    assert.equal(s.inProgress.game.pile, 146, 'the control must leave the pile unpaid');
    assert.deepEqual(s.inProgress.game.call, { id: 'sure', at: 1000 }, 'the control must leave the bid locked');
    finishPage(s);
    assert.equal(s.game.today, 0, 'the control must destroy the pile');
  });

  /* The first version of the fix did exactly this — it voided the bid, on `endJob`'s reasoning that
     "an unanswered bid can neither pay nor cost". That reasoning does not hold here: `endJob` runs
     when the page is over, while the switch can be reached with the QUESTION ALREADY ON SCREEN. So
     voiding it sold back the free bail-out `bank`'s own refusal exists to prevent — lock `sure` on
     the last question of a page, look at it, and walk out with the pile whole. */
  await t.test('a close-out that VOIDED the bid instead of settling it would be caught', () => {
    const s = jrig({ pile: 146, streak: 5 });
    STATE.call(s, 'sure', { now: 1000 });
    const { cost } = STATE.priceOf(s, 'sure');
    STATE.writeGame(s, { ...STATE.stateOf(s), call: null });      // void, do not settle
    STATE.bank(s);
    delete s.inProgress.game;
    assert.equal(s.game.today, 146);
    assert.ok(s.game.today > Math.max(0, 146 - cost),
      'leaving would out-earn missing — the free bail-out this section exists to forbid');
  });
});

/* ==========================================================================================
   §9 THE CLAIM, HELD AGAINST COMPOSED
   ==========================================================================================
   CUT-BRIEF ("The Law of Two Ledgers") and CUT-SPEC §8 publish the same sentence:
   `settings.game = false` is byte-identical COMPOSED. Round 2's study-untouched critic found it
   false in three places, and — the part this section exists for — found that NOTHING IN THE SUITE
   COULD SEE IT.

   The three tests that carry the claim all compare game-ON against game-OFF inside the SHIPPED
   build (`cut-integrate` :247, `cut-home` :131, `job-ledger` :800). An ungated change is in BOTH
   arms, so it cancels, and `job-ledger` says the weaker reading out loud: "THE FLAG CHANGES
   NOTHING." A claim about COMPOSED cannot be held by a test that never looks at COMPOSED.

   THIS SECTION LOOKS AT COMPOSED. `3a57ff5` is the last commit before any game code exists
   (`ca53259` is the pre-REPAIR game commit and is the wrong baseline — it already carries the
   elaborate layer). Every constant below was measured off that tree, and the commands that
   reproduce them — including `notes/cut-meta-domdiff.mjs`, which renders both trees in a real
   browser and diffs `#view` — are in `notes/cut-meta.md`, "Round 2", §1.

   It is DOM-free and needs no git, no browser and no network: the pre-game bytes are carried here
   as digests, which is what makes this the one arm in the suite that cannot cancel.

   WHAT IT CANNOT DO. It holds the claim at the SOURCE. A behavioural change inside a file that is
   allowed to differ (`app.js`, `plan.js`, `store.js`, the screens) is out of its reach, and that is
   exactly where the three defects live — so the rest of this section pins them by name, with an
   owner, in a list that may shrink and may not grow. Fixing one is a deletion from `UNGATED`, never
   an edit to an assertion.                                                                        */

/** The last commit before any game code. Every §9 constant is measured off this tree. */
export const PREGAME = '3a57ff5';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * CUT-BRIEF: "The study layer is untouched: js/grader/*, js/gen/*, js/widgets/*, js/figure/*,
 * js/xp.js, js/mastery.js, js/schedule.js, js/readiness.js, js/rarity.js."
 *
 * Every one of those files at `3a57ff5`, as `sha256(utf8)[0..16)`. Sixty-one files, and the game
 * layer may not move one byte of one of them. A red line here is not a puzzle: run
 * `git show 3a57ff5:site/<path> | diff - site/<path>` and the whole change is on the screen.
 */
const UNTOUCHED = Object.freeze({
  'js/figure/model.js': 'd794722f3431e32a',
  'js/figure/svg.js': 'f111c050189a6258',
  'js/gen/classify.js': '258e8574faf5c290',
  'js/gen/contract.js': 'e05c36710bca2cc7',
  'js/gen/csarith.js': '2f2c5ce038f3cd6f',
  'js/gen/cslin.js': '568fe704abc5b878',
  'js/gen/csquad.js': '874f973734cb4920',
  'js/gen/csratio.js': '7d3efd00eaf642a3',
  'js/gen/factor.js': '92909cf79ed85b16',
  'js/gen/figbisect.js': '7ac2aa79b9b09259',
  'js/gen/figpairs.js': '9cc842ea2716b7e4',
  'js/gen/figsystem.js': 'c6e4c05e81ace5ec',
  'js/gen/figxlines.js': 'f4945e0971980e27',
  'js/gen/notation.js': '44547f1ec0f68ebb',
  'js/gen/quad.js': '97a55b486fabd794',
  'js/gen/segmid.js': '39f7ef66e0d35765',
  'js/gen/sys.js': 'f9139752f44a863d',
  'js/gen/vocab.js': '2886fe832357479e',
  'js/grader/asn.js': '1768ffb1eede14bb',
  'js/grader/cases.js': 'f9dfb22c4aa40daf',
  'js/grader/classify.js': '57a17567a53535a6',
  'js/grader/cloze.js': '35ad8aedcdd1562b',
  'js/grader/equation.js': '9e7de899017a5c5b',
  'js/grader/factored.js': 'e16cffef061aa031',
  'js/grader/index.js': 'af345bb0f8fa31f4',
  'js/grader/mc.js': '59a19bc41b7cce26',
  'js/grader/multi.js': '95f9a3d0798cdc60',
  'js/grader/normalize.js': '1f6fe90af9591cdf',
  'js/grader/notation.js': 'f32c7525a92992f0',
  'js/grader/num.js': '0279799c7d6703dc',
  'js/grader/pairs.js': '4c4f1cccd23671e8',
  'js/grader/poly.js': '1d970133e0e0f27c',
  'js/grader/ratio.js': '0f5c356bd4eaddba',
  'js/grader/reject.js': '88d129ce93375c42',
  'js/grader/roots.js': 'f3d7487b35cdab3f',
  'js/grader/strip.js': '1906034a5588e6a6',
  'js/grader/term.js': 'ef727d2091e5803a',
  'js/grader/termmatch.js': '54ccae618d609214',
  'js/mastery.js': 'f95baaa6cc5bade9',
  'js/rarity.js': '35d6f78bcd527cd3',
  'js/readiness.js': '4a1bb847da2a8b14',
  'js/schedule.js': '8024a30c28c43a82',
  'js/widgets/asn.js': '7e0cfd6e0f34a87d',
  'js/widgets/base.js': '5ddf3d178859763f',
  'js/widgets/classify.js': 'd60ad80baaa6874d',
  'js/widgets/cloze.js': '6d400b49b74348e1',
  'js/widgets/equation.js': '6043148a43c52037',
  'js/widgets/factored.js': '9ffa14b745424dac',
  'js/widgets/index.js': '5fbecdddc79dee25',
  'js/widgets/mc.js': '486369fed1dcc137',
  'js/widgets/multi.js': 'f1a251490311bc43',
  'js/widgets/notation.js': 'ba2e7ffc2cb60373',
  'js/widgets/num.js': '05687cccb56947c1',
  'js/widgets/pairs.js': '2da7c12ae26df386',
  'js/widgets/ratio.js': '387d0178026c84fa',
  'js/widgets/rootcase.js': '66ea64435752a6e3',
  'js/widgets/shortcuts.js': '435b56bfb13ede71',
  'js/widgets/strip.js': '9b5fb03bced67d81',
  'js/widgets/term.js': '4e5734391b1c3a8d',
  'js/widgets/termmatch.js': '8658ddde7974b361',
  'js/xp.js': 'd385d237509bed6d',
});

/** The directories and single files that list covers, so a NEW file in one of them is caught too. */
const UNTOUCHED_DIRS = Object.freeze(['js/figure', 'js/gen', 'js/grader', 'js/widgets']);
const UNTOUCHED_FILES = Object.freeze(['js/mastery.js', 'js/rarity.js', 'js/readiness.js', 'js/schedule.js', 'js/xp.js']);

/**
 * `js/gen/asn-reason.js` is the one deliberate deletion, and it is not a study file: it was BUILT
 * for the deleted RECALL wing and did not exist at `3a57ff5` (CUT-SPEC §8). It is named here so
 * that "the generator set is pre-game's" is an assertion and not an accident.
 */
const DELIBERATE_DELETIONS = Object.freeze(['js/gen/asn-reason.js']);

/**
 * `page.js` is on CUT-SPEC §8's **Untouched** line but is NOT byte-identical: the demolition left
 * three imports behind that nothing in the file uses (`rngFrom`, `overdueDays as overdueDaysOf`,
 * `isMastered`) plus the tombstone comment that says where `composeBundles` went.
 *
 * So the claim is held at the level it is actually true: strip comments and string bodies, strip
 * those three named specifiers, collapse whitespace — and what is left is pre-game's, to the byte.
 * A fourth dead import fails this, and so does one line of changed behaviour.
 */
const PAGE_DEAD_IMPORTS = Object.freeze(['rngFrom', 'overdueDays as overdueDaysOf', 'isMastered']);
const PAGE_PREGAME_CODE = 'fe89ec81c171ef54';

/** `code(src)` — what §9 compares: no comments, no string bodies, whitespace collapsed. */
export function code(src, drop = []) {
  let s = stripCommentsAndStrings(src);
  for (const d of drop) s = s.replace(new RegExp(',\\s*' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Every `document.` / `window.addEventListener('event'` in `src`, as `"<target> <event>"`, sorted.
 *
 * A global listener is the one construct that can change the study app's behaviour from a file the
 * flag is never read in — which is defect (a) exactly — so it is the construct §9 scans for. The
 * scan runs on the COMMENT-STRIPPED source and reads the event name off the RAW line at the same
 * index (`stripCommentsAndStrings` keeps line numbers honest, which is its documented contract).
 * `app.js` quotes `window.addEventListener('hashchange', route)` inside a doc comment, so a scanner
 * that cannot tell prose from a call site reports two and this one reports one — see the control.
 */
export function globalListeners(src) {
  const stripped = stripCommentsAndStrings(src).split('\n');
  const raw = String(src).split('\n');
  const CALL = /\b(document|window)\s*\.\s*addEventListener\s*\(/g;
  const NAMED = /\b(document|window)\s*\.\s*addEventListener\s*\(\s*['"`]([^'"`]*)/g;
  const out = [];
  for (let i = 0; i < stripped.length; i++) {
    const n = [...stripped[i].matchAll(CALL)].length;
    if (!n) continue;
    const names = [...(raw[i] ?? '').matchAll(NAMED)];
    for (let k = 0; k < n; k++) {
      const m = names[k];
      out.push(m ? `${m[1]} ${m[2]}` : `${[...stripped[i].matchAll(CALL)][k][1]} ?`);
    }
  }
  return out.sort();
}

/**
 * Every module specifier `src` actually imports, sorted. A prose mention can never be one: the
 * statement must BEGIN its line (after whitespace only) and that line must survive comment
 * stripping, so neither `// import … from '../job/pay.js'` nor a `*`-prefixed block-comment line
 * nor a trailing `// see ../job/pay.js` is counted. Dynamic `import('…')` counts — it is a reach.
 */
export function importsFrom(src) {
  const stripped = stripCommentsAndStrings(String(src)).split('\n');
  const raw = String(src).split('\n');
  // Code lines verbatim, comment-only lines blanked — so multi-line import statements still join up
  // and a JSDoc `{import('./normalize.js').Rat}` cannot be mistaken for one.
  const codeOnly = raw.map((l, i) => (stripped[i] && stripped[i].trim() ? l : '')).join('\n');
  const out = new Set();
  const scan = (re) => { for (const m of codeOnly.matchAll(re)) out.add(m[1]); };
  scan(/(?:^|\n)[ \t]*(?:import|export)\b[^;]*?\bfrom[ \t]*['"]([^'"]+)['"]/g);   // import … from '…'
  scan(/(?:^|\n)[ \t]*import[ \t]*['"]([^'"]+)['"]/g);                            // side-effect import '…'
  scan(/\bimport[ \t]*\([ \t]*['"]([^'"]+)['"]/g);                                // dynamic import('…')
  return [...out].sort();
}

/** The game's own files. Everything else under `site/js` is the study layer for §9's purposes. */
const GAME_FILES = (p) => p.startsWith('js/job/') || p === 'js/screens/job.js';

/** Every global listener the study layer installs at `3a57ff5`, as `"<file> <target> <event>"`. */
const PREGAME_GLOBAL_LISTENERS = Object.freeze([
  'js/app.js document DOMContentLoaded',
  'js/app.js window hashchange',
  'js/app.js window load',
  'js/screens/binder.js document keydown',
  'js/screens/binder.js document pointerdown',
  'js/screens/binder.js window resize',
  'js/screens/binder.js window scroll',
  'js/screens/run.js document keydown',
  'js/screens/run.js document visibilitychange',
  'js/sw-register.js document visibilitychange',
]);

/**
 * THE CLOSED LIST. Every place the shipped build differs from COMPOSED in a way the flag does not
 * gate, each with the lane that owns the file — because BUILD-POLICY §2 is what decides who edits
 * it, not who found it. `notes/cut-meta.md` §9 "Requests" carries the exact edit for each.
 *
 * The list MAY SHRINK AND MAY NOT GROW. Nothing below asserts that a delta is still present, so a
 * lane that lands its fix does not break this suite; it deletes its row. Four is the ceiling and it
 * is one this lane measured, not one it chose.
 */
export const UNGATED = Object.freeze([
  /* `app.js:same-route-click` and `plan.js:self-href` STOOD HERE AND ARE SPENT — both gated by the
     round-3 integrator, which is the shrink this register's own docstring describes, and the reason
     CUT-BRIEF:89 ("settings.game = false returns the app to byte-identical COMPOSED behaviour") is
     true of the shipped build again. `sameRouteClick` now returns on `settings.game === false`
     before it reads the event, and `plan.pillsFor` marks no pill `self` under the same condition,
     so with the game off every strip pill is a link and no same-route tap re-mounts a screen.
     The click LISTENER is still installed unconditionally and is therefore still declared, but it is
     declared as a GATED listener below, not as a delta — see GATED_GLOBAL_LISTENERS. */
  Object.freeze({
    id: 'screens.css:blitz-card-cap', file: 'site/css/screens.css', owner: 'the screen lane (tests/final-layout.test.mjs pins the unit)',
    why: '.blitz-card max-height 560px → 35rem on a STUDY screen. Identical at a 16 px root and it fixes a real '
       + 'text-zoom clip, so it is the one delta that is arguably worth keeping — but CSS reads no flag, so it '
       + 'is a delta and it is listed.',
  }),
  /* `page.js:dead-imports` STOOD HERE AND IS SPENT — deleted by the round-3 integrator, which is the
     shrink this register's own docstring describes. Both halves of its `why` had become false: the
     three specifiers are gone from the file (`grep -nE 'rngFrom|overdueDays|isMastered' site/js/page.js`
     is empty), and CUT-SPEC §8 no longer lists page.js among the Untouched — it says "page.js is
     pre-game's executable content to the byte, one tombstone comment apart", which is what the
     `PAGE_PREGAME_CODE` digest below proves. The digest test stays; only the delta row goes, because
     there is no longer a delta. Requested by notes/cut-spec.md → Requests 1. */
]);

/**
 * GLOBAL LISTENERS THE GAME LAYER ADDED AND THEN GATED. Separate from `UNGATED` on purpose: that
 * list means "behaves differently with the flag off", and a gated listener does not — but the
 * scanner below reads CALL SITES, not behaviour (its own negative control proves it counts
 * `if (a) f(); else window.addEventListener(…)`), so an installed-then-gated handler would read as
 * undeclared for ever. Declaring it here keeps the scan strict — an added global listener must be
 * either an ungated delta with an owner or a gated one with the line that gates it — without
 * pretending the app still differs when the switch is off.
 */
export const GATED_GLOBAL_LISTENERS = Object.freeze([
  Object.freeze({
    id: 'app.js:same-route-click', file: 'site/js/app.js', listener: 'js/app.js document click',
    gate: "getState()?.settings?.game === false  → return, first line of sameRouteClick()",
    why: 'boot() installs a document click handler that re-mounts the screen when an anchor resolves to the '
       + 'whole current URL — COMPOSED re-mounted nothing there. The handler now returns on the flag before it '
       + 'reads the event, so with the game OFF the tap falls through to the browser exactly as it used to. '
       + 'The flag is read in the handler and not at the install so that flipping the switch in Settings takes '
       + 'effect on the same paint that plan.pillsFor gives back the pill hrefs.',
  }),
]);

test('CUT §9: the study layer is byte-identical to COMPOSED, file by file', async (t) => {
  await t.test(`all ${Object.keys(UNTOUCHED).length} files CUT-BRIEF calls untouched still hash to ${PREGAME}`, () => {
    const bad = [];
    for (const [p, want] of Object.entries(UNTOUCHED)) {
      const got = sha(read(`site/${p}`));
      if (got !== want) bad.push(`${p}: ${got} (pre-game ${want}) — git show ${PREGAME}:site/${p} | diff - site/${p}`);
    }
    assert.deepEqual(bad, [], 'the game layer moved a file CUT-BRIEF says it may not touch');
  });

  await t.test('and the file SET is pre-game’s — nothing added, nothing removed but the declared deletion', () => {
    const seen = [];
    for (const d of UNTOUCHED_DIRS) {
      for (const abs of listFiles(`site/${d}`)) seen.push(abs.slice(abs.indexOf('/site/js/') + 6));
    }
    seen.push(...UNTOUCHED_FILES);
    const want = Object.keys(UNTOUCHED).sort();
    assert.deepEqual(seen.sort(), want, 'a file appeared in or vanished from the untouched study layer');
    for (const gone of DELIBERATE_DELETIONS) {
      assert.ok(!want.includes(gone), `${gone} is not a pre-game file and must not be on the untouched list`);
      assert.ok(!existsSync(repoPath(`site/${gone}`)), `${gone} is back; CUT-SPEC §8 deletes it`);
    }
  });

  await t.test('page.js: pre-game’s executable content, modulo three declared dead imports', () => {
    const src = read('site/js/page.js');
    assert.equal(sha(code(src, PAGE_DEAD_IMPORTS)), PAGE_PREGAME_CODE,
      `page.js differs from ${PREGAME} by more than the three imports PAGE_DEAD_IMPORTS names — `
      + 'git show ' + PREGAME + ':site/js/page.js | diff - site/js/page.js');
    /* `<= 1` and not `=== 1`: ONE occurrence is the import line itself and nothing else, which is
       the dead-import state this row describes; ZERO means the engine lane landed the fix and the
       import is gone, and a guard must never go red on the fix it asked for. TWO or more means the
       name is genuinely in use — then it is no longer dead, and the digest above is the assertion
       that fires, because stripping a live specifier leaves its call sites behind. */
    const bare = stripCommentsAndStrings(src);
    const left = [];
    for (const spec of PAGE_DEAD_IMPORTS) {
      const name = spec.split(/\s+as\s+/).pop();
      const uses = [...bare.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
      assert.ok(uses <= 1, `${name} is used now — it is not a dead import; re-measure PAGE_PREGAME_CODE`);
      if (uses === 1) left.push(name);
    }
    if (left.length) t.diagnostic(`page.js still carries dead imports: ${left.join(', ')}`);
  });
});

test('CUT §9: the flag’s ungated door list is closed', async (t) => {
  const listeners = [];
  for (const abs of listFiles('site/js')) {
    const rel = abs.slice(abs.indexOf('/site/') + 6);        // "js/…"
    if (GAME_FILES(rel)) continue;
    for (const l of globalListeners(readFileSync(abs, 'utf8'))) listeners.push(`${rel} ${l}`);
  }
  listeners.sort();
  const pregame = new Set(PREGAME_GLOBAL_LISTENERS);
  const declared = new Set([...UNGATED, ...GATED_GLOBAL_LISTENERS].map(d => d.listener).filter(Boolean));

  await t.test('the game layer removed no listener the study app had', () => {
    assert.deepEqual(PREGAME_GLOBAL_LISTENERS.filter(x => !listeners.includes(x)), [],
      `a global listener COMPOSED installs is gone (measured at ${PREGAME})`);
  });

  await t.test('and every global listener it ADDED is one the closed list names', () => {
    const added = listeners.filter(x => !pregame.has(x));
    const undeclared = added.filter(x => !declared.has(x));
    assert.deepEqual(undeclared, [],
      'a study-layer module installs a global listener that neither UNGATED nor GATED_GLOBAL_LISTENERS names. '
      + 'This is defect (a)\'s exact shape: gate it and declare the gate, or add it to UNGATED with an owner '
      + 'and file the request.');
    if (added.length) t.diagnostic(`outstanding: ${added.join(', ')}`);
  });

  /* A DECLARED GATE IS A CLAIM ABOUT THE SHIPPED FILE, so it is read out of the file rather than
     believed. Without this, `GATED_GLOBAL_LISTENERS` would be a way to silence the scan above by
     writing prose — which is the failure the register exists to prevent, one level up. */
  await t.test('…and every gate a listener claims is actually in the file it names', () => {
    for (const d of GATED_GLOBAL_LISTENERS) {
      const src = read(d.file);
      assert.ok(d.gate && d.why && d.why.length > 40, `${d.id} is declared gated without a gate and a reason`);
      assert.match(src, /settings\?\.game === false\) return;/,
        `${d.id} claims a gate in ${d.file} and the file does not read settings.game before it acts`);
    }
    /* the negative control: the same scan on a file that has no gate must NOT match */
    assert.doesNotMatch(read('site/js/store.js'), /settings\?\.game === false\) return;/);
  });

  await t.test('the list may shrink and may not grow — at most four, each with an owner and a reason', () => {
    assert.ok(UNGATED.length <= 4, `UNGATED grew to ${UNGATED.length}; a fifth delta is a new BLOCKER, not a new row`);
    const ids = UNGATED.map(d => d.id);
    assert.deepEqual([...new Set(ids)], ids, 'a duplicate id in UNGATED');
    for (const d of UNGATED) {
      assert.ok(d.file && d.owner && d.why && d.why.length > 40, `${d.id} is listed without an owner and a reason`);
      assert.ok(existsSync(repoPath(d.file)), `${d.id} names ${d.file}, which is not in the tree`);
    }
  });

  /* Deliberately TWO assertions and not one "settings.js is the only importer".
     A study screen may one day need a verb from `job/state.js` for a legitimate reason — refusing
     `#/run/page` while a session is live is the open request in §1 of this note, and it needs
     `stateOf`. Pinning the whole reach set here would make this suite veto another lane's correct
     fix, which is not what a guard is for. What may NOT spread is the PRICED module: `job/pay.js`
     is what turns an answer into points, and CUT-BRIEF's "no number on any surface that is not
     exactly the number the engine computes" is why exactly one study surface may read it — the
     Settings card that prints the three bands. That is the line, and it is the one held hard. */
  await t.test('the payoff table reaches exactly one study surface: the Settings card that prints the bands', () => {
    const reach = [];
    for (const abs of listFiles('site/js')) {
      const rel = abs.slice(abs.indexOf('/site/') + 6);
      if (GAME_FILES(rel)) continue;
      if (importsFrom(readFileSync(abs, 'utf8')).some(s => /(^|\/)job\/pay\.js$/.test(s))) reach.push(rel);
    }
    assert.deepEqual(reach, ['js/screens/settings.js'],
      'a study screen outside Settings reads the payoff table — it can then print a number the game priced');
  });

  await t.test('and Ledger A reaches the game engine nowhere at all', () => {
    const LEDGER_A = (p) => /^js\/(grader|gen|widgets|figure)\//.test(p)
      || ['js/xp.js', 'js/mastery.js', 'js/schedule.js', 'js/readiness.js', 'js/rarity.js', 'js/page.js'].includes(p);
    const reach = [];
    for (const abs of listFiles('site/js')) {
      const rel = abs.slice(abs.indexOf('/site/') + 6);
      if (!LEDGER_A(rel)) continue;
      if (importsFrom(readFileSync(abs, 'utf8')).some(s => /(^|\/)job\//.test(s))) reach.push(rel);
    }
    assert.deepEqual(reach, [],
      'a module that writes the study ledger imports the game — the Law of Two Ledgers is a source fact first');
    const doors = [];
    for (const abs of listFiles('site/js')) {
      const rel = abs.slice(abs.indexOf('/site/') + 6);
      if (GAME_FILES(rel)) continue;
      if (importsFrom(readFileSync(abs, 'utf8')).some(s => /(^|\/)job\//.test(s))) doors.push(rel);
    }
    t.diagnostic(`study-layer files that reach js/job/*: ${doors.join(', ') || '(none)'}`);
  });
});

test('CUT §9 negative control: the §9 scanners can fail', async (t) => {
  await t.test('the listener scan reads call sites and not prose', () => {
    assert.deepEqual(globalListeners("document.addEventListener('click', f);"), ['document click']);
    assert.deepEqual(globalListeners("// document.addEventListener('click', f);"), []);
    assert.deepEqual(globalListeners("/** was `window.addEventListener('hashchange', route)` */"), []);
    assert.deepEqual(globalListeners("const s = \"document.addEventListener('click', f)\";"), []);
    assert.deepEqual(globalListeners("if (a) f(); else window.addEventListener('load', g, { once: true });"), ['window load']);
    assert.deepEqual(globalListeners("el.addEventListener('click', f);"), [], 'a local element is not a global');
  });

  await t.test('…on the shipped app.js, which quotes one in a comment and installs two', () => {
    const app = read('site/js/app.js');
    assert.equal((app.match(/window\.addEventListener\('hashchange'/g) || []).length, 2, 'app.js should mention it twice');
    assert.deepEqual(globalListeners(app).filter(x => x.endsWith('hashchange')), ['window hashchange'],
      'the scanner counted the comment');
  });

  await t.test('the import scan finds every shape, and no shape that is only prose', () => {
    assert.deepEqual(importsFrom("import { a } from '../job/pay.js';"), ['../job/pay.js']);
    assert.deepEqual(importsFrom("import {\n  a,\n  b,\n} from '../job/pay.js';"), ['../job/pay.js'], 'multi-line');
    assert.deepEqual(importsFrom("export { a } from './x.js';"), ['./x.js'], 're-export');
    assert.deepEqual(importsFrom("import '../job/pay.js';"), ['../job/pay.js'], 'side effect');
    assert.deepEqual(importsFrom("const p = import('../job/pay.js');"), ['../job/pay.js'], 'dynamic');
    assert.deepEqual(importsFrom("// import { a } from '../job/pay.js';"), []);
    assert.deepEqual(importsFrom("/** @typedef {import('../job/pay.js').P} P */"), []);
    assert.deepEqual(importsFrom(" * it used to import { a } from '../job/pay.js'"), []);
    assert.deepEqual(importsFrom("import { a } from './x.js';   // and never from '../job/pay.js'"), ['./x.js']);
    // and the shipped door really is found by it, not asserted into existence
    assert.ok(importsFrom(SETTINGS).includes('../job/pay.js'), 'settings.js imports the payoff table');
    assert.ok(importsFrom(SETTINGS).includes('../job/state.js'), 'settings.js imports the five verbs');
    assert.deepEqual(importsFrom(read('site/js/screens/stats.js')).filter(s => /job\//.test(s)), [],
      'Stats reaches no game module');
  });

  await t.test('the digest checker fails on one moved byte', () => {
    const src = read('site/js/xp.js');
    assert.equal(sha(src), UNTOUCHED['js/xp.js']);
    assert.notEqual(sha(src + '\n'), UNTOUCHED['js/xp.js'], 'a trailing newline must be a difference');
    assert.notEqual(sha(src.replace('const', 'const ')), UNTOUCHED['js/xp.js']);
  });

  await t.test('the page.js normaliser does not swallow behaviour', () => {
    const src = read('site/js/page.js');
    const base = sha(code(src, PAGE_DEAD_IMPORTS));
    assert.equal(base, PAGE_PREGAME_CODE);
    assert.notEqual(sha(code(src.replace('export function composePage', 'export function composePAGE'), PAGE_DEAD_IMPORTS)), base);
    assert.equal(sha(code(src + '\n// a comment changes nothing\n', PAGE_DEAD_IMPORTS)), base);
  });
});
