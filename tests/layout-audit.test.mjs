// tests/layout-audit.test.mjs — keeps the layout safety net from silently rotting (ticket AUDIT-HARNESS).
//
// The net is qa/layout-audit.mjs. Its detectors are calibrated against qa/audit/selftest.html, a page of
// DELIBERATE defects (eight, since fix:qa r2), and qa/audit/selftest-clean.html, a page with none whose
// controls include negative controls a detector must stay silent on. This test runs
// `node qa/layout-audit.mjs --selftest` headlessly and asserts:
//   * every planted defect is still caught (a detector that cannot catch its own plant is worthless), and
//   * the clean control page still reports ZERO findings (a detector that cries wolf gets muted by humans,
//     which is how a real defect ships).
// It SKIPS (never fails) when Playwright or a browser binary is not installed, so `node --test tests/`
// stays green on a machine without browsers. See notes/AUDIT.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = path.join(REPO, 'qa', 'layout-audit.mjs');
const REPORT = path.join(REPO, 'qa', 'audit', 'selftest.json');

/** Is there a chromium build for qa/'s playwright? If not, the test skips instead of failing. */
function browsersAvailable() {
  if (!existsSync(path.join(REPO, 'qa', 'node_modules', 'playwright'))) return false;
  const probe = spawnSync(process.execPath, ['-e', `
    const { createRequire } = require('node:module');
    const req = createRequire(${JSON.stringify(path.join(REPO, 'qa', 'shot.mjs'))});
    const { chromium } = req('playwright');
    chromium.launch().then(b => b.close()).then(() => process.exit(0), () => process.exit(3));
  `], { cwd: REPO, timeout: 90_000, encoding: 'utf8' });
  return probe.status === 0;
}

test('layout-audit self-test: every planted defect is caught, the clean control is silent', (t) => {
  if (!browsersAvailable()) { t.skip('no Playwright browser binary installed (run: cd qa && npx playwright install chromium)'); return; }

  const run = spawnSync(process.execPath, [AUDIT, '--selftest', '--engine', 'chromium', '--quiet'],
    { cwd: REPO, timeout: 300_000, encoding: 'utf8' });

  assert.ok(existsSync(REPORT), `the self-test wrote no report.\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  const report = JSON.parse(readFileSync(REPORT, 'utf8'));
  const st = (report.selftests || []).find((r) => r.engine === 'chromium');
  assert.ok(st, 'no chromium self-test result in qa/audit/selftest.json');
  assert.equal(st.error, undefined, `self-test could not run: ${st.error}`);

  // 1. no planted defect may go unnoticed
  assert.deepEqual(
    (st.missed || []).map((m) => m.type), [],
    `these detectors no longer catch their own planted defect: ${(st.missed || []).map((m) => `${m.type} (${m.what})`).join('; ')}`,
  );
  // every plant, by name, so a detector cannot be deleted and still "pass"
  const caught = new Set((st.caught || []).map((c) => c.type));
  for (const type of ['collapsed-text', 'zero-track', 'overlap', 'doc-overflow', 'tap-target']) {
    assert.ok(caught.has(type), `detector "${type}" is missing from the self-test results`);
  }
  // …and by PLANT, not just by type: tap-target now has two plants and the second one exists because the
  // detector was blind with the first one passing. It credited a negative-inset ::before to the hit area
  // with no check that the pseudo was painted, so the app's 32px Stats chips measured 44x44 and the whole
  // matrix reported zero tap-target findings (ticket fix:qa r2). Asserting the type alone cannot see that.
  const needles = new Set((st.caught || []).map((c) => c.needle));
  for (const needle of ['plant-tiny', 'plant-clipped-hit']) {
    assert.ok(needles.has(needle), `the self-test no longer catches #${needle} — that plant is what keeps this detector honest`);
  }
  // A negative control that has drifted off screen (or out of the clean page) proves nothing either.
  assert.deepEqual((st.offScreenControls || []), [],
    'a negative control on qa/audit/selftest-clean.html is off screen at 320x568: ' + (st.offScreenControls || []).join(', '));

  // 2. the clean control page must be silent — a noisy detector is a detector people learn to ignore
  assert.deepEqual((st.controlFindings || []), [],
    'false positives on qa/audit/selftest-clean.html:\n  ' + (st.controlFindings || []).join('\n  '));
  assert.deepEqual((st.controlConsole || []), [], 'console noise on the clean control page');

  // 3. and the exit code has to reflect it, because CI reads the exit code
  assert.equal(run.status, 0, `--selftest exited ${run.status}\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
});
