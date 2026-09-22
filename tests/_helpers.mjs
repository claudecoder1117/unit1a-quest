// tests/_helpers.mjs — T17. The helpers more than one test file had its own copy of.
//
// Why the leading underscore: the test runner collects `**/*.test.?(c|m)js` (and `tests/index.js`
// imports exactly `/\.test\.(mjs|cjs|js)$/`), so a name that ends in neither is never run as a test
// file on any Node version. Importing this module therefore costs nothing and never double-runs a
// suite — which is the trap a test file that exports a helper falls into (`no-random.test.mjs`
// exports `stripCommentsAndStrings`, but importing it from another file drags its whole suite in
// when that file is run on its own).
//
// House rules for this module:
//   • node: builtins only — NO import from `site/`. A helper that needs the card bank belongs in the
//     test that owns it; this file must stay importable by a test that is deliberately testing what
//     `site/data` loads.
//   • pure functions and constants only — no `test()`, no top-level side effects, no fixtures with a
//     clock baked in (a fixed `NOW` belongs to the suite that pins it).
//
// Contents:
//   ROOT, repoPath(), read(), readIfAny(), listFiles()   — repo-relative file access (8 suites had this)
//   stripCommentsAndStrings()                            — source scanning without false positives
//   correctRaw(card, part)                               — the golden round-trip answer builder
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ the repo */

/** Absolute path of the repo root (this file lives in `<root>/tests`). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of a repo-relative path: `repoPath('site', 'js', 'store.js')`. */
export const repoPath = (...parts) => join(ROOT, ...parts);

/** Read a repo-relative text file (throws if missing — that is usually the assertion you want). */
export const read = (p) => readFileSync(repoPath(p), 'utf8');

/** Read a repo-relative text file, or `null` when it does not exist. */
export const readIfAny = (p) => (existsSync(repoPath(p)) ? readFileSync(repoPath(p), 'utf8') : null);

/**
 * Every file under `dir` (absolute or repo-relative) whose basename matches `re`, recursively,
 * in directory order. Returns absolute paths. `skip` names directories to ignore.
 */
export function listFiles(dir, re = /\.m?js$/, { skip = ['node_modules', '.git'] } = {}) {
  const base = dir.startsWith('/') ? dir : repoPath(dir);
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (skip.includes(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (re.test(name)) out.push(p);
    }
  };
  walk(base);
  return out;
}

/* --------------------------------------------------- scanning source safely */

/**
 * Strip comments and string/template-literal bodies from JS source, leaving positions intact enough
 * for a line-number scan. A prose mention of a banned call in a comment, or a banned name inside a
 * user-facing message, must never trip a policy scan — only a real call site may.
 *
 * `${}` inside a template literal is NOT re-entered: code hidden in a template string is not a call.
 * Each string collapses to an empty literal of the same quote style so the surrounding syntax
 * (argument lists, object values) still parses to the eye.
 */
export function stripCommentsAndStrings(src) {
  const s = String(src);
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') out += '\n'; i++; }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < n && s[i] !== q) {
        if (s[i] === '\\') { i++; i++; continue; }
        if (q !== '`' && s[i] === '\n') break;
        if (s[i] === '\n') out += '\n';          // keep template line numbers honest
        i++;
      }
      i++;
      out += q + q;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* -------------------------------------------- the golden round-trip builder */

const requiredChipIndexes = (slot) =>
  slot.chips.map((ch, i) => [ch, i]).filter(([ch]) => ch.role === 'required').map(([, i]) => i);

/**
 * correctRaw(card, part) → the raw a student would submit to get `correct`, built from the part's OWN
 * stored answer — one builder per part type (all 17 of COMPOSED S3). `undefined` means "no builder for
 * this part type" (a new type landed and this table did not); `null` means "the part stores no answer
 * to round-trip". Both are assertion-worthy, so neither is silently swallowed here.
 *
 * This is the engine behind two different acceptance checks — `coverage.test.mjs` ("every part of every
 * card grades its own stored answer") and `mock.test.mjs` ("a perfect Mock scores 100") — which is why
 * it lives here: a content change that stops round-tripping must fail in both, off one definition.
 */
export function correctRaw(card, p) {
  switch (p.type) {
    case 'num': return Array.isArray(p.bonus) && p.bonus.length
      ? { value: p.answer, ...Object.fromEntries(p.bonus.map((b) => [b.key, b.answer])) }
      : p.answer;
    case 'multi': return Object.fromEntries(p.fields.map((f) => [f.key, f.answer]));
    case 'roots': return p.answer;
    case 'reject': return { keep: p.valid ?? [], reject: p.rejected ?? [], reason: p.reason ?? p.reasonKey };
    case 'cases': return p.rows;
    case 'ratio': return p.answer;
    case 'factored': return p.answer;
    case 'equation':
      if (p.text) return p.text;
      if (p.canonical) return `${p.canonical} = 0`;
      if (Array.isArray(p.system)) return p.system.map((s) => `${s} = 0`).join(', ');
      return null;
    case 'mc': return p.answer;
    case 'term': return (p.answers ?? [p.answer])[0];
    case 'asn': return p.answer;
    case 'classify': return p.answer;
    case 'notation': return p.sides ? { kind: p.kind, sides: p.sides } : { kind: p.kind, pts: p.pts };
    case 'cloze': return p.blanks.map((b) => (b.answers ? b.answers[0] : b.answer));
    case 'termmatch': return Object.fromEntries(p.pairs.map((x) => [x.term, x.def]));
    case 'pairs': return (card.teacherPairs ?? []).map((pair) => pair.map((n) => '∠' + n));
    case 'strip': {
      const raw = {};
      for (const s of p.slots) {
        if (s.type === 'chips') raw[s.id] = requiredChipIndexes(s);
        else if (s.type === 'multi') raw[s.id] = Object.fromEntries(s.fields.map((f) => [f.key, f.answer]));
        else raw[s.id] = s.answer;
      }
      return raw;
    }
    default: return undefined;
  }
}

/** The part types `correctRaw` knows how to answer — a coverage assertion for new part types. */
export const CORRECT_RAW_TYPES = Object.freeze([
  'num', 'multi', 'roots', 'reject', 'cases', 'ratio', 'factored', 'equation', 'mc', 'term',
  'asn', 'classify', 'notation', 'cloze', 'termmatch', 'pairs', 'strip',
]);

/* ------------------------------------------------ the game layer at its caps (J10 / G7)

   COMPOSED-GAME G7's save-schema delta is priced with a worst case of its own: 50 calls, 68 tags,
   30 log records, 12 manned crew makes, a LIVE 12-target job (5 bundles, its full call list, its
   BENCH, its DRAFTED QUEUE and the six TROPHIES only a job can earn) and the seven fields a job
   adds to every `runs[]` record. `state.test.mjs` folds these into
   the S6 worst case so the ≤ `SAVE_BUDGET_KB.totalAdded` bound stays machine-checked;
   `job-save.test.mjs` measures the same delta on its own carrier. They live here rather than in
   either suite because importing a `.test.mjs` file for one export drags its whole suite into the
   importer's process (see the header of this file).

   House rules honoured: pure, node builtins only, nothing imported from `site/`. The caps and the
   clock are PARAMETERS — the caller passes `CAPS.game` from `store.js` and its own fixed `now`, so
   these fixtures can never disagree with the shipped caps and never bake in a clock.

   ────────────────────────────────────────────────────────────────────────────────────────────────
   ROUND 2 — WHY THE NUMBERS BELOW LOOK THE WAY THEY DO.

   Round 1 made this fixture a FIXED POINT of the shipped serialiser, which pinned its SHAPE. It
   still hand-typed its VALUES, and four of them were narrower than the shipped writers emit —
   `rating: 7.1234` where `call.ratingDetail()` returns `6.685919999999999`, `elo: {player:1187.5}`
   where `guard.elo()` returns `1113.257822343893`, `w: 0.2549` where `call.callEntry` rounds to
   6 dp (`0.888889`), and a 5-id skill cycle where `QUAD-SOLVE` is the longest make there is. Those
   four leaves cost 653 B — more than the 313 B of margin the published "≤ 26 KB (measured 25.69)"
   carried — so the headline was false by 340 B while every assertion stayed green
   (`scratchpad/save-fix-r2/verify-critic.mjs` reproduces it off the round-1 fixture, kept beside it).

   The fix is not a wider assertion. Two rules now hold, and `job-save.test.mjs` enforces both:

     1. every leaf a shipped writer leaves UNROUNDED is priced at `WIDE_DOUBLE`, the widest JSON form
        any finite double can take. Nothing can exceed a maximum;
     2. every other leaf is priced at or above what REAL jobs driven through `js/job/state.js`
        actually write — `job-save.test.mjs` "the fixture is not narrower than the shipped writers"
        drives a seeded corpus of real JOB12s and fails, naming the leaf, if any of them is wider.

   The counts (`calls`, `bench`) are the maxima that corpus reaches, with headroom, and the same test
   re-measures them on every run.                                                                  */

/**
 * The widest JSON form any finite double can take: **24 characters** (25 with a sign).
 * `JSON.stringify` prints at most 17 significant digits, and below ~1e-7 it switches to exponential
 * notation — which is SHORTER — so `0.0000012345678901234567` is the maximum. Verified by brute
 * search over 8 M random IEEE-754 bit patterns (notes/save-fix.md round 2 §1).
 *
 * Every leaf below that a shipped writer leaves unrounded is priced at this width: `rating.value`
 * and `records.bestRating20` (`call.ratingDetail` clamps, it does not round), `player.elo.*`
 * (`guard.elo` returns `P + k·(o − e)` raw), `game.log[].rating` (the same `detail.value`
 * `state.endJob` writes), `game.ledger.phaseMeans.*` (`foldMean` is an incremental mean),
 * `game.heat.press.*` (`guard.pushHeat` accumulates `posted · share`), `inProgress.game.rating0`
 * and `guard.dist.*`, and `runs[].ratingDelta` (a difference of two of the above).
 */
export const WIDE_DOUBLE = 0.0000012345678901234567;

/** `WIDE_DOUBLE` with the sign a signed unrounded leaf (`runs[].ratingDelta`) can carry: 25 chars. */
export const WIDE_SIGNED_DOUBLE = -0.0000012345678901234567;

/**
 * The longest id in `data/skills.js` `SKILL_IDS`, which is what `calls[].skill` holds.
 * `job-save.test.mjs` asserts no `SKILL_IDS` entry is longer, so a new make with a longer id fails
 * there rather than quietly under-pricing 50 window entries and 26 job calls at once.
 */
export const WIDEST_SKILL = 'QUAD-SOLVE';

/**
 * The widest `w` `call.callEntry` can emit. `w = round(4·q̂·(1 − q̂), 6)` and q̂ is `k/n` with
 * `n ≤ RATING.qHatWindow = 10`, so thirds are reachable and `4·(1/3)·(2/3) = 0.888889` to 6 dp is
 * the longest — 8 characters, not the 6 the round-1 fixture typed.
 */
export const WIDEST_W = 0.888889;

/** The longest wing id (G3.4) — `calls`, `log[].guard` and `runs[].guard` all hold one. */
const WIDEST_WING = 'FIGURES';

/**
 * The seven fields G7 SPECIFIES on each `runs[]` record, each at its widest.
 *
 * NOT YET WRITTEN BY ANY SHIPPED PATH — which is a claim about these SEVEN FIELDS, not about whether
 * a job records itself. A `runs[]` record without them is an ordinary page record and costs the
 * STUDY layer's bytes, so it moves nothing here. The live check is in `job-save.test.mjs`
 * "THE RESERVED LINE IS STILL RESERVED": a COMMENT-STRIPPED scan of `site/` for a write of
 * `ratingDelta`, the one of the seven that nothing else could produce. (Comment-stripped because
 * `screens/run.js` now carries a doc comment saying the seven are deliberately not written, and a
 * prose mention of a field is not a write.)
 *
 * The constant therefore prices a RESERVED line of G7's budget, and `job-save.test.mjs` asserts the
 * addition both with and without it so the published figure can never quietly be a sixth of data the
 * app does not produce. When a path starts writing them, that test goes red — re-measure the line
 * off a real completed record and fold `SAVE_BUDGET_KB.subtotal` into `totalAdded`. Do not delete
 * the constant to make the arithmetic tidy: then nothing prices the record the design requires.
 */
export const GAME_RUN_FIELDS = Object.freeze({ bagged: 99999, posted: 99999, ratingDelta: WIDE_SIGNED_DOUBLE, guard: WIDEST_WING, cracked: true, tGame: 3599999, tAnswer: 3599999 });

/** The four wing ids (G3.4) — a constant, not a fixture with a clock. */
export const GAME_WINGS = Object.freeze(['RECALL', 'FIGURES', 'WORDS', 'ALGEBRA']);
const MANNED = Object.freeze(['VOC', 'NOTE', 'CLASS', 'CSARITH', 'PAIRS', 'ASN-PLP', 'ASN-ANG', 'CS-LIN', 'CS-RATIO', 'CS-QUAD', 'SYS', 'FIG-ALG']);

/**
 * How many TARGETS a JOB12 board drafts into `inProgress.queue`. `SHAPES.JOB12.targets` is 12, but
 * the board's last bundle can overflow by one, so 13 is reachable: over 4 800 seeded boards the
 * histogram is `{12: 4754, 13: 46}` and 14 never occurs. This prices **14** and
 * `job-save.test.mjs` re-measures the corpus maximum on every run.
 */
export const JOB_QUEUE_DRAFTED = 14;

/**
 * How many contracts the bench can hold. `startJob` writes `inProgress.bench` — the targets of the
 * two UNDRAFTED contracts, at their declined price — and `benchFor` dedupes them against the drafted
 * queue (`have` is seeded from the queue and grows as it goes), so nearly all of them are already in
 * it: a JOB12 board is the core 9 replicated r = 3 over 5 bundles plus one choice each, so what
 * survives the dedupe is essentially the undrafted contracts' choice targets.
 *
 * Measured with headroom: 4 800 seeded boards never produce more than **2** entries (histogram
 * `{0: 2, 1: 46, 2: 4752}` — never 3). This prices **4**, twice the observed maximum, and
 * `job-save.test.mjs` re-measures the corpus maximum on every run. The un-deduped worst case (both
 * undrafted contracts' whole target lists) would be ~14 entries and ~5 KB; the way to make that
 * impossible is to stop spreading `...t.item` in `benchFor` — see notes/save-fix.md round 2
 * §Requests B.2.
 */
export const BENCH_ENTRIES = 4;

/**
 * How long `inProgress.queue` can get, and — because `applyTarget` writes exactly one call per
 * ANSWERED queue entry — how many entries `inProgress.game.calls` can hold.
 *
 * ROUND 3. THIS IS NOW A PROVEN CEILING, NOT A CORPUS MAXIMUM, and the reason is that the corpus
 * maximum was a fiction. Rounds 1-2 priced this off "260 seeded jobs that miss everything and
 * **take every swap**" and got 12, then 23. Neither of those jobs ever took a swap:
 * `job-save.test.mjs`'s driver called `brief(save, { swap: o[0].id })` — a STRING — and
 * `state.brief` takes `{ swap: { id } }` (`js/job/state.js`: `if (isObj(actions.swap) && …)`,
 * and `screens/job.js:1150` sends `takeBrief({ swap: { id: o.id } })`). A non-object `swap` is
 * silently ignored, so the measured "maximum" was the maximum of jobs whose queue never grew by a
 * swap at all. Corrected to the shipped action shape, 6 000 real JOB12s reach **28** calls and a
 * 28-entry queue — two past what round 2 priced, on a line with 61 B of slack.
 *
 * So the figure is derived instead of observed. Every queue entry is answered at most twice
 * (`page.MAX_REQUEUE = 1`, and a re-queued copy carries `requeued: 1` so it can never be re-queued
 * again), and the only other growth is the bench spliced in by `swapIn`, itself bounded by
 * `BENCH_ENTRIES`:
 *
 *     queue ≤ (drafted + bench) + one re-queue each = 2 × (JOB_QUEUE_DRAFTED + BENCH_ENTRIES) = 36
 *     calls ≤ queue                                                                           = 36
 *
 * `job-save.test.mjs` asserts all four links of that chain against the real corpus — drafted ≤ 14,
 * bench ≤ 4, queue ≤ 36, calls ≤ 36 — and asserts that the corpus ACTUALLY TAKES SWAPS, so the
 * defect above cannot recur silently. A cap in `state.serialize()` would make it a ceiling the app
 * enforces rather than one the shapes imply; that file is not this lane's, and a naive cap would
 * change the GAME (`endJob` reads `g.calls.every(c => c.ok)` and `g.calls.length`) — the request,
 * with both options, is in notes/save-fix.md round 2 §Requests B.
 */
export const JOB_QUEUE_ITEMS = 2 * (JOB_QUEUE_DRAFTED + BENCH_ENTRIES);
const JOB_CALLS = JOB_QUEUE_ITEMS;

/** `2026-08-20` + n days, without importing days.js (UTC arithmetic — these are fixture labels). */
const dayStr = (n) => new Date(Date.UTC(2026, 7, 20) + n * 86400000).toISOString().slice(0, 10);

/**
 * `save.player` with the 50-call rating window full.  `caps` = `CAPS.game`.
 *
 * Every entry is exactly what `call.windowPush(win, {call, ok, qHat, skill, at})` appends — the key
 * ORDER is `callEntry`'s own (`p, ok, w, skill, at`) and the values are its widest: `w` rounded to
 * 6 dp at q̂ = 1/3, the longest make id there is. `job-save.test.mjs` rebuilds the window with the
 * shipped `windowPush` and asserts it deep-equals this one.
 */
export function worstCasePlayer(now, caps) {
  return {
    rating: {
      calls: Array.from({ length: caps.calls }, (_, i) => ({ p: 0.85, ok: i % 3 !== 0, w: WIDEST_W, skill: WIDEST_SKILL, at: now + i * 60000 })),
      value: WIDE_DOUBLE, n: caps.calls,
    },
    rank: 1,
    elo: { player: WIDE_DOUBLE, house: WIDE_DOUBLE },
    records: { bestBag: 99999, bestChain: 99, bestRating20: WIDE_DOUBLE, cleanJobs: 999, cracked: 999, walked: 999, cleanGetaway: true },
  };
}

/**
 * `save.game` with all 68 tags, 30 log records and 12 manned crew makes. Tag ids are 27 characters —
 * the length of the LONGEST real tag in `data/misconceptions.js`, applied to all 68 — so the measured
 * bound is pessimistic rather than flattering (the real median is 15).
 *
 * `ledger.debriefAt` is priced here because `state.endJob` stamps it on EVERY job end (state.js, the
 * `gm.ledger = {...}` write). Round 1 did not price it, `SAVE_DEFAULTS.game.ledger` did not declare
 * it and `freshGame()` did not either — it survived a reload only because `normalizeGame`'s `over()`
 * is not a whitelist. Both defaults now declare it and `normalizeGame` coerces it.
 */
export function worstCaseGame(now, caps) {
  const tags = {};
  for (let i = 0; i < caps.tags; i++) tags[`confused-misconceptions-${String(i).padStart(3, '0')}`] = { resolved: 4, triggered: 11, days: 3, lastDay: '2026-09-17', cleared: true, sealed: false };
  const crew = {};
  for (const k of MANNED) crew[k] = 2;
  return {
    crew,
    heat: {
      /* `guard.pushHeat` does `press[w] += posted · share`, which is NOT rounded anywhere on the way
         to disk (`normalizeGame` coerces with `num()`): a real save after four jobs already reads
         `{"RECALL":511.66666666666663,…}`. `weight += posted` is a sum of `econ.round`ed integers,
         so it is priced as one. */
      press: { RECALL: WIDE_DOUBLE, FIGURES: WIDE_DOUBLE, WORDS: WIDE_DOUBLE, ALGEBRA: WIDE_DOUBLE }, weight: 9999999, jobs: 999,
      /* the press window at its cap — `guard.pushHeat`'s own schema (notes/J3.md §5.5), priced here
         because it is part of the budget J10 measures. `press` holds the job's 3 pressure tokens and
         `posted` the `econ.round`ed posted total, so both are integers. */
      window: Array.from({ length: caps.heat }, () => ({ press: { RECALL: 9, FIGURES: 9, WORDS: 9, ALGEBRA: 9 }, posted: 99999 })),
    },
    tags,
    backchecks: { held: 3, mintedDay: '2026-09-17' },
    ledger: { jobs: 999, tGame: 359999999, tAnswer: 359999999, phaseMeans: { board: WIDE_DOUBLE, guard: WIDE_DOUBLE, brief: WIDE_DOUBLE, getaway: WIDE_DOUBLE, debrief: WIDE_DOUBLE }, debriefAt: now + 3e5 },
    /* `rating` is `call.ratingDetail(...).value` — the same unrounded double `player.rating.value`
       holds, NOT the `7.1234` round 1 typed. `targets` is `answered()`, which counts requeues, so it
       runs past the drafted 12; `bagged` is `econ.round`ed and reaches four digits on a real board. */
    log: Array.from({ length: caps.log }, (_, i) => ({ day: dayStr(i), shape: 'JOB12', targets: 99, bagged: 99999, posted: 99999, rating: WIDE_DOUBLE, guard: WIDEST_WING, cracked: true, tGame: 3599999, tAnswer: 3599999 })),
    commit: { kind: 'walkAtMinutes', byMin: 1305, honored: 999, bound: true },
  };
}

/**
 * `inProgress.game` — a 12-target job live, every bundle carrying every lock (the absolute worst
 * partition `composeBundles` could produce) and `JOB_CALLS` calls already made.
 * The SEED IS PINNED: re-opening cannot re-roll the guard, the bundles or the ×2 (G3.7 proof 6).
 *
 * THIS IS THE INPUT, NOT THE RECORD. The suites feed it to the SHIPPED serialiser
 * (`serialize(freshState(inProgressJob12(...)))` — see `job-save.test.mjs` / `state.test.mjs`) and
 * measure what comes back, so the bytes they price are the bytes `js/job/state.js` actually writes.
 * That indirection is deliberate: the literal that used to be measured DIRECTLY had drifted badly —
 * it carried 16 of the serialiser's keys (missing `stakes`, `outcome`, `locked`, `posted`, `bc`,
 * `last`, `ph`, `rating0`) and a call shape of `{p, carry}` that `cleanCall` has never emitted
 * (it emits `{call, ok, w, skill, rung, d, at}`), so J10's "measured" budget was measuring a fiction.
 *
 * ROUND 2 — the SIZES are now pinned too, not just the shape:
 *   · `calls`     `JOB_CALLS` entries, not 12: a call is written per ANSWERED target, and requeues
 *                 and brief-window swaps push the answered count past the drafted one (23 observed)
 *   · `calls[].w` `round(w, 6)` at q̂ = 1/3 — 8 characters, the most `callEntry` can emit
 *   · `rating0`   `player.rating.value` un-rounded (`call.ratingDetail` clamps, it does not round)
 *   · `guard.dist` raw doubles — `drawGuard` does not round them
 *   · `bundles`   5 × 12 locks is far over the 33 a real JOB12 board posts (core 9 replicated r = 3
 *                 over 5 bundles plus one choice each). It is kept deliberately pessimistic, but the
 *                 per-axis assertion in `job-save.test.mjs` now measures locks AND calls separately,
 *                 so an over-priced axis can no longer hide an under-priced one — which is exactly
 *                 how the 12-call figure survived round 1.
 *   · `ph`, `loose`, `bagged`, `posted`, `last.*`, `calls[].d` integers — `econ.round`/`Math.round`
 * `_helpers.mjs` may not import from `site/` (house rule at the top of this file), which is why the
 * shape is pinned by an assertion in `job-save.test.mjs` rather than by importing `STATE_KEYS` here.
 */
export function inProgressJob12(now, caps) {
  return {
    shape: 'JOB12',
    seed: 'job|3f2a91c4-7d16-4b08-9e5a-0c8317bd4e62|2026-09-16|0',
    bundles: Array.from({ length: caps.bundles }, (_, b) => ({
      id: 'ABCDE'[b], label: WIDEST_SKILL, overflow: 9, wing: WIDEST_WING, posted: 999, minutes: 99.5, grade: 3, cold: 99,
      locks: Array.from({ length: 12 }, (_, k) => `T-cs-ratio-0${b}#a91f2c${k}`),
    })),
    /* every bundle: `swapIn` appends the swapped contract's id to `picks`, so a job that takes both
       brief-window swaps ends with all five — 21 B, not the 13 B three ids cost. */
    picks: ['A', 'B', 'C', 'D', 'E'],
    tokens: { RECALL: 2, FIGURES: 0, WORDS: 1, ALGEBRA: 0 },
    guard: { wing: 'ALGEBRA', dist: { RECALL: WIDE_DOUBLE, FIGURES: WIDE_DOUBLE, WORDS: WIDE_DOUBLE, ALGEBRA: WIDE_DOUBLE }, eps: 0.15, mult: 0.55, drawnAt: now },
    loose: 1180, bagged: 2460, chain: 11,
    calls: Array.from({ length: JOB_CALLS }, (_, i) => ({
      call: 95, ok: i % 3 !== 0, w: WIDEST_W, skill: WIDEST_SKILL,
      rung: i % 5, d: -2048, at: now + i * 60000,
    })),
    briefs: [{ at: now + 1e5, took: ['repress', 'tell'] }, { at: now + 2e5, took: [] }],
    vault: 'T-quad-solve-12#a91f2c',
    /* `phase` is the LONGEST of `data/job.js` `PHASE_ORDER` (`envelope`), not the `payout` round 1
       typed — a one-leaf, 2-byte version of the same mistake the whole round is about. */
    /* seven digits, not six: `tAnswer` is milliseconds and a real corpus job already passes 1e6. */
    tGame: 3599999, tAnswer: 3599999, phase: 'envelope', phaseAt: now + 3e5,
    // the eight keys `js/job/state.js` EXTRA_KEYS adds and the old literal silently dropped
    stakes: true, outcome: null,
    locked: { call: 100, n: 12, at: now + 3e5 },
    posted: 3184, bc: 3,
    last: { n: 12, d: -1152, rung: 3, ok: false, chainBefore: 11, looseBefore: 2332, shielded: true },
    ph: { board: 186000, guard: 124000, brief: 207000, getaway: 255000, debrief: 654000 },
    rating0: WIDE_DOUBLE,
    quiet: false,
  };
}

/**
 * `inProgress.bench` — the GAME layer's third key on `inProgress`, and the one round 1 never priced.
 *
 * `page.startPage` writes `{kind, seed, seedTag, queue, idx, hearts, xp, startedAt, day, dayIndex,
 * pageIndex, meta}`; `job.startJob` writes those PLUS `game` and `bench`. **That is a statement about
 * the KEY LIST and nothing else** — round 3 found it read as though the shared keys were identical,
 * and they are not: `queue` holds entries with 8 more fields on a job (see `GAME_QUEUE_FIELDS`), and
 * `save.trophies` holds six ids only a job can earn (see `GAME_TROPHY_IDS`). `benchFor` spreads a whole
 * composed queue item (`...t.item`) per undrafted contract, so an entry is ~370 B, not a price tag.
 * Round 1's `withoutGameKeys` deleted `player`, `game`, `inProgress.game` and the `runs[]` fields but
 * never `bench`, so every byte of it was charged to the STUDY half of the split — and neither
 * worst-case carrier created one, so the omission could not be seen. Both now do, and
 * `withoutGameKeys` deletes it.
 */
export function worstCaseBench(now, n = BENCH_ENTRIES) {
  return Array.from({ length: n }, (_, i) => ({
    n: 0, id: `T-quad-solve-${String(i).padStart(2, '0')}#a91f2c`, kind: 'variant', role: 'review',
    template: 'T-quad-solve', seed: `a91f2c-w${i}`, skill: WIDEST_SKILL, skills: [WIDEST_SKILL],
    tier: 3, module: 'M1', sheet: 'QUAD', isReview: true, isRematch: false, isVariant: true,
    forCard: 'quad-12', done: false, result: null, bucket: 3, overdue: WIDE_DOUBLE, sweep: false,
    from: 'E', sources: ['E'], wing: WIDEST_WING, posted: 999, basePosted: 999, x2: false,
    critical: true, declined: 'E',
  }));
}

/**
 * The EIGHT fields the game layer adds to every `inProgress.queue` entry, at their widest.
 *
 * ROUND 3, AND THE SAME MISTAKE AS THE BENCH ONE LEVEL DEEPER. `page.startPage` writes
 * `page.queue` straight out of `composePage`; `job.startJob` writes the queue `page.draftUnion`
 * builds, which spreads `...t.item` and then adds `from, sources, wing, posted, x2, critical`
 * (`site/js/page.js` `draftUnion`) — and `state.swapIn` splices bench entries in, which carry
 * `basePosted` and `declined` on top (`js/job/state.js` `benchFor`). Verified by calling both
 * shipped writers on the same save:
 *
 *     startPage queue item keys: bucket done forCard id isRematch isReview isVariant kind module
 *                                n overdue result role seed sheet skill skills sweep template tier
 *     startJob  queue item keys: … PLUS from sources wing posted x2 critical
 *     extra per queue item on a job: from, sources, wing, posted, x2, critical  (+1015 B on 12 items)
 *
 * `composePage` is untouched by the layer, so a `settings.game = false` page never writes one of
 * them — by G7's own attribution rule (the one that moved `inProgress.bench` in round 2) they are
 * the layer's bytes, and `withoutGameKeys` must not charge them to the STUDY half. Over 6 000 real
 * jobs driven to the end they are worth up to 2 502 B on a single live queue.
 *
 * Priced pessimistically: every entry of `worstCaseJobQueue` carries all eight, although only the
 * ≤ 2 × `BENCH_ENTRIES` swapped-in entries (and their re-queued copies) can carry `basePosted` and
 * `declined`. Over-pricing a budget line is safe; under-pricing one is the defect this file has
 * been fixing for three rounds.
 */
export const GAME_QUEUE_FIELDS = Object.freeze({
  /* every boolean is priced `false` — 5 characters, one more than `true`. */
  from: 'E', sources: ['A', 'B', 'E'], wing: WIDEST_WING, posted: 999,
  basePosted: 999, x2: false, critical: false, declined: 'E',
});

/**
 * `inProgress.queue` for a LIVE JOB, at `JOB_QUEUE_ITEMS` entries and every leaf at its widest —
 * the drafted targets, the swapped-in bench and one re-queued copy of each.
 *
 * Both worst-case carriers used to dodge this line entirely: `job-save.test.mjs`'s carrier wrote
 * `queue: []` and `state.test.mjs`'s wrote 24 synthetic items carrying STUDY keys only, so the
 * game fields above appeared in no measurement at all. The widths are what real jobs write
 * (`result` 137 B at a third-wrong miss, `id` 21 B, `skills` 25 B, `rename` 49 B on a figure
 * card, …), each with a little headroom — `job-save.test.mjs` "the fixture is not NARROWER than the shipped writers" now
 * measures per queue-item key against the real corpus.
 */
export function worstCaseJobQueue(now, n = JOB_QUEUE_ITEMS) {
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1, id: `T-fig-xlines-LL#58d${String(i).padStart(3, '0')}`, kind: 'variant', role: 'rematch',
    template: 'T-fig-xlines-LL', seed: `0edd80-r${i}`, skill: WIDEST_SKILL, skills: ['BISECT-Q', WIDEST_SKILL],
    // every boolean priced `false` — 5 characters, one more than `true`
    tier: 3, module: 'M10', sheet: 'AP-4', isReview: false, isRematch: false, isVariant: false,
    /* `overdue` is one of the few leaves the study layer ROUNDS on the way in — `composePage` writes
       `Math.round(d.overdue * 10) / 10` (`site/js/page.js:282`) — so it is priced as a 1-dp number
       with room for four whole days' digits, NOT at `WIDE_DOUBLE`. Pricing it as an unrounded double
       would be 17 B × 36 entries of pure fat on the single most expensive line in the table. */
    forCard: 'ang-wu-40', bucket: 3, overdue: 9999.9, sweep: false,
    rename: { F: 'E', D: 'L', C: 'T', B: 'M', A: 'V', E: 'Y' }, requeued: 1,
    done: false,
    result: { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0, n: i + 1, role: 'rematch', skill: WIDEST_SKILL, tier: 3 },
    ...GAME_QUEUE_FIELDS,
  }));
}

/**
 * The six `save.trophies` ids only a JOB can earn — `site/data/trophies.js:308-334`, each of whose
 * predicates reads `ctx.save.player` / `ctx.save.game` and nothing else (`wingsManned` → `game.crew`,
 * `sealedTags` → `game.tags`, `bestChain` → `player.records` + `inProgress.game`, `rollingBrier` →
 * `player.rating.calls`, `cleanGetaway` → `player.records`).
 *
 * ROUND 3. `site/js/trophies.js` `evaluate()` writes `save.trophies[id] = { at: now }`, so six
 * records — 199 B — land in a top-level STUDY key that `withoutGameKeys` was keeping. By the same
 * attribution rule that moved `inProgress.bench` and the queue fields, they are the layer's bytes:
 * a `settings.game = false` save can never hold one. Neither carrier contained them either
 * (`job-save.test.mjs`'s wrote no trophies, `state.test.mjs`'s wrote 40 synthetic `sheet-gold:AP-i`
 * ids), so the line was measured in NEITHER half.
 */
export const GAME_TROPHY_IDS = Object.freeze(['crew-held', 'index-25', 'index-68', 'chain-8', 'calibrated', 'clean-getaway']);

/** The six game trophies as `js/trophies.js` `evaluate()` writes them. */
export function worstCaseGameTrophies(now) {
  return Object.fromEntries(GAME_TROPHY_IDS.map((id) => [id, { at: now }]));
}

/**
 * The same save with every byte the GAME layer added removed — i.e. exactly the bytes T01 measured
 * when it set its 500 000-char bound. Splitting the worst case this way is what lets the study
 * layer's bound stay the number T01 asserted while G7's own `SAVE_BUDGET_KB.totalAdded` bounds the addition.
 *
 * The rule, applied four times now and stated once here: **a key or field the game layer's own
 * writers add, that the study layer's equivalent writer does not, is the layer's cost.**
 *   · `player`, `game`                — two whole top-level keys (G7)
 *   · `inProgress.game`               — `job.startJob` writes it, `page.startPage` does not
 *   · `inProgress.bench`              — likewise (round 2)
 *   · `inProgress.queue[*]` × 8       — `page.draftUnion`/`state.swapIn` add them to an item
 *                                       `composePage` composes without them (round 3)
 *   · `trophies[<six game ids>]`      — only a job can earn them (round 3)
 *   · `runs[*]` × `GAME_RUN_FIELDS`   — reserved, see that constant
 * Each one of these was found by a critic AFTER the previous one was fixed, because the fix stopped
 * at the level the finding named. If you add a game-layer write anywhere, add it here too.
 */
export function withoutGameKeys(save) {
  const s = structuredClone(save);
  delete s.player; delete s.game;
  if (s.inProgress) {
    delete s.inProgress.game; delete s.inProgress.bench;
    for (const it of s.inProgress.queue ?? []) {
      if (it && typeof it === 'object') for (const k of Object.keys(GAME_QUEUE_FIELDS)) delete it[k];
    }
  }
  for (const id of GAME_TROPHY_IDS) delete s.trophies?.[id];
  for (const r of s.runs ?? []) for (const k of Object.keys(GAME_RUN_FIELDS)) delete r[k];
  return s;
}
