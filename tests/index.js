// tests/index.js — makes the policy command `node --test tests/` work on Node ≥ 21, whose test runner
// treats positional arguments as globs and hands a bare directory to the module loader (which resolves
// a directory to its index.js). This entry imports every *.test.mjs in the folder so node:test collects
// them all. A file that fails to load (syntax error mid-edit, bad import) becomes ONE failing test named
// after the file instead of aborting the whole run. `node --test 'tests/**/*.test.mjs'` and `npm test`
// work identically; this file is not itself a test file (the default `**/*.test.?(c|m)js` pattern does
// not match it — do not add a tests/index.test.mjs or files would run twice).
import { test } from 'node:test';
import { readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => /\.test\.(mjs|cjs|js)$/.test(f)).sort();
for (const f of files) {
  try {
    await import(pathToFileURL(join(here, f)).href);
  } catch (err) {
    test(`${f} failed to load`, () => { throw err; });
  }
}
