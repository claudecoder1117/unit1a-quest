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
