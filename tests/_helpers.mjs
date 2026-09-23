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

/* ------------------------------------------------ the widest id the study queue carries

   THE CUT (designs/CUT-BRIEF.md, notes/DEMOLISH.md §3): what stood here was the DELETED layer's
   price list — `WIDE_DOUBLE`, `WIDE_4DP`, `WIDE_SIGNED_DOUBLE`, `WIDEST_W`, `WIDEST_Q` and forty
   lines pricing a rating, an Elo pair, a press window, a 68-tag index, a crew and `SAVE_BUDGET_KB`.
   Every mechanic they priced is gone, no test imported any of them, and the brief's instruction for
   code kept because it might come back is the reason this layer needed cutting. Deleted with them
   (notes/cut-save.md Requests 4, standing since round 4). `WIDEST_SKILL` stays: `worstCaseJobQueue`
   below is the STUDY layer's own worst case and writes it on every row.                           */

/**
 * The longest id in `data/skills.js` `SKILL_IDS`, which is what a queue row's `skill` holds.
 * `job-save.test.mjs` asserts no `SKILL_IDS` entry is longer, so a new skill with a longer id fails
 * there rather than quietly under-pricing every row of the worst-case queue below.
 */
export const WIDEST_SKILL = 'QUAD-SOLVE';

/* ------------------------------------------------------------------ the worst-case page

   DEMOLITION (notes/DEMOLISH.md): the game-layer fixtures that used to live here — the 50-call
   rating window, the crew map, the 68-tag Fault Index, the heat window, the 30-job log, the
   12-target `inProgress.game`, the bench, the six game trophies, the seven reserved `runs[]` fields,
   the seven before-snapshot fields, `withoutGameKeys` and `archivedGameBytes` — are gone with the
   mechanics they priced. `save.player` is one integer and `save.game` two fields now, so there is
   nothing left to model. What stays below is the STUDY layer's own worst case: the queue
   `composePage` writes, at its widest.                                                            */

/** How long `inProgress.queue` can get: a page's items plus one re-queued copy of every review. */
export const JOB_QUEUE_ITEMS = 36;


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
       with room for four whole days' digits, not as an unrounded double — which would be 17 B × 36
       entries of pure fat on the single most expensive line in the table. */
    forCard: 'ang-wu-40', bucket: 3, overdue: 9999.9, sweep: false,
    rename: { F: 'E', D: 'L', C: 'T', B: 'M', A: 'V', E: 'Y' }, requeued: 1,
    /* ROUND 5 (verify) — `params`, THE KEY THE COMPLETENESS GUARD COULD NOT SEE. `composePage`'s S7
       algebra floor writes it (`site/js/page.js:392` `{ mode: quadOk && rng.chance(0.5) ? 'a2' : 'a1' }`
       → `variantItem`'s `if (params && Object.keys(params).length) item.params = { ...params }`), and
       a floor item reaches a JOB unchanged: `composeBundles` prices `page.queue` as it stands and
       `draftUnion` spreads `...t.item`. Measured on the shipped writers — 198 of 200 seeded saves
       with no backlog draft one (`node scratchpad/repair-save-r5/probe_job_floor.mjs`); the corpus
       in `job-save.test.mjs` reaches them through its `lowDue` arm and asserts it still does.
       WHY IT IS PRICED ON EVERY ENTRY AND NOT ON THE ONE OR TWO A PAGE COMPOSES. `freezeVariant`
       PERSISTS it — `schedule.js:130` `if (item.params && …) rec.params = item.params` — and every
       later due of that frozen Variant re-emits it (`page.js:287` `variantItem(d.template, d.seed,
       'review', { …, params: d.params, … })`). `save.frozen` holds `CAPS.frozen` records, so a
       worst-case queue of frozen-Variant reviews carries `params` on EVERY entry; there is no
       structural bound at 2.
       IT IS A STUDY KEY. `composePage` is untouched by the layer, so a `settings.game = false` page
       writes it too — by the same attribution rule that put `from`/`sources`/`wing` in
       `GAME_QUEUE_FIELDS`, `params` stays OUT of that list and `withoutGameKeys` leaves it in the
       STUDY half, where it belongs. Its 828 B on this fixture are T01's bytes, not the layer's. */
    params: { mode: 'a2' },
    done: false,
    result: { cleared: false, solutionShown: true, reason: 'third-wrong', attempt: 3, hints: 0, n: i + 1, role: 'rematch', skill: WIDEST_SKILL, tier: 3 },
  }));
}

/**
 * The two keys a FROZEN-VARIANT REVIEW carries that the card-shaped entry above does not, at their
 * widest — `page.js:287` `variantItem(d.template, d.seed, 'review', { …, frozenKey: d.key,
 * templateVersion: d.templateVersion, … })`, fed from `save.frozen[key]` (`schedule.js dueList`).
 *
 * ROUND 5 (verify), found while pricing `params` one line above it: these reach a real job's queue
 * too (22 of 840 entries over 60 seeded saves carrying frozen Variants) and were in no fixture, so
 * the completeness guard could not see them either.
 */
export const FROZEN_REVIEW_FIELDS = Object.freeze({ frozenKey: 'T-fig-xlines-LL#58d000', templateVersion: 99 });

/**
 * A frozen-Variant REVIEW queue entry at its widest — the OTHER shape `composePage` writes into
 * `inProgress.queue`, and the reason `FROZEN_REVIEW_FIELDS` is not simply added to every entry of
 * `worstCaseJobQueue()`.
 *
 * THE TWO SHAPES ARE MUTUALLY EXCLUSIVE, and the card-shaped one is the wider. A card due goes
 * through `cardItem(c, 'review', { bucket, overdue, sweep })` and may pick up `rename`
 * (`page.js:281-284`); a frozen-Variant due goes through `variantItem(…, { frozenKey,
 * templateVersion })` and gets NONE of those four. Measured over 840 real entries: **no entry ever
 * carried both `rename` and `frozenKey`** (`job-save.test.mjs` asserts that on every run), and the
 * frozen shape is 48 B NARROWER than the card shape (665 B against 713 B) once the four keys it cannot have are removed.
 * So the LINE stays priced on `JOB_QUEUE_ITEMS` card-shaped entries — which is an upper bound for
 * any mix of the two — and this fixture prices the two extra KEYS, which is what the completeness
 * guard and the per-key width rows need. `job-save.test.mjs` asserts the dominance rather than
 * asserting the prose: if the frozen shape ever becomes the wider one, the line is re-priced on it.
 *
 * Pricing the union on all 36 entries instead would add 2 088 B of bytes no single real entry can
 * carry — to the STUDY half, which has 400 chars of slack left against T01's 500 000-char bound.
 */
export function worstCaseFrozenReviewItem(now, i = 0) {
  const { rename, bucket, overdue, sweep, ...rest } = worstCaseJobQueue(now, 1)[0];
  return { ...rest, n: i + 1, role: 'review', isReview: true, ...FROZEN_REVIEW_FIELDS };
}
