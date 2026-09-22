// tests/job-audit-allow.test.mjs — the ATTRIBUTED waivers of qa/audit-allow.json, gated.
//
// ROUND-2 VERIFY (test-integrity finding 6). Four waivers scoped to `job-answer-kb` / `job-payout-kb`
// hide 47 layout findings, eight of them `unreachable-answer` BLOCKERs INSIDE a job, and the game
// layer's acceptance command (`node qa/layout-audit.mjs --only job`, notes/J6.md) is green because of
// them. Their defence is that a CONTROL STATE outside the job host carries the same hits unwaived —
// and it does — but nothing checked that: `tests/layout-audit.test.mjs` runs only `--selftest`, and
// `tests/final-layout.test.mjs` asserts that CI must NOT run the full matrix. So the attribution was
// four paragraphs of prose, and its quoted counts had gone stale (4 / 6 / 6 / 6 / 6 against a
// measured 7 / 9 / 9 / 9 / 8) without anything noticing.
//
// WHAT THIS FILE DOES, and why it does not launch a browser. The audit is minutes of Playwright per
// engine; CI running it is the thing `final-layout.test.mjs:136` forbids, and that test is right.
// So the MEASUREMENT is committed instead: every attributed waiver carries an `attribution` block
// naming the control, the command that produced the numbers, and the per-selector counts on both
// sides. This file gates that block on every `node --test tests/` run:
//
//   1. structure     — every state-scoped waiver has an attribution, and the control state exists in
//                      qa/audit-states.mjs and is itself waived by NOTHING (an attribution that
//                      mutes its own control is an exemption wearing a disguise);
//   2. the ledger    — every hit is a real count on both sides, and the control carries at least as
//                      many as the host;
//   3. reconciliation — over `qa/audit/report.json` when one is on disk, AND over five synthetic
//                      reports that run the same function on every run, browser or no browser.
//
// VERIFY ROUND 3 (test-integrity, MAJOR): ARM 3 HAD NEVER RUN. `checked` was 0 for all four
// attributed waivers against the report that was on disk, so the arm returned before comparing
// anything, and the 130 findings that report waives on `job-answer-kb` / `job-payout-kb` were
// measured against nothing. Three independent gates each zeroed it out:
//
//   (a) `covered.has(state)` was exact membership in `rep.config.only`, while `qa/layout-audit.mjs`
//       :1318 treats `--only` as a PREFIX list (`CFG.only.some((p) => s.id.startsWith(p))`). So a
//       report from the layer's own acceptance command — `node qa/layout-audit.mjs --only job`,
//       notes/J6.md — had `config.only = ['job']`, `covered.has('job-answer-kb')` was false, and
//       every host dropped out. The gate could not fire on the one command it exists to gate.
//   (b) the command check was exact string equality against the attribution's narrow command, so
//       any other run skipped in silence;
//   (c) `qa/audit/report.json` is gitignored, so on a fresh checkout — and in CI — the whole arm
//       was dead by construction, leaving three structural arms over hand-written JSON in which
//       `onControl >= onHost` compares two numerals the same author typed.
//
// WHAT REPLACES IT. `reconcile(report, blocks)` is a pure function over a report object, and the
// arms below call it three ways:
//
//   · PRESENCE and ORPHANS, on ANY report that covers a host state, whatever command produced it.
//     Both are set operations on (state, type, selector) and do not depend on the matrix: every
//     waived hit on a host state must be enumerated in some attribution (the arm that would have
//     caught 47 findings behind four paragraphs), and every enumerated hit must still be produced
//     by the run (a hit that has vanished is a block gone stale in the other direction).
//   · COUNTS, only when the report's matrix matches the attribution's own command on the axes that
//     change a per-state count — `config.engines`, `config.themes`, `config.vpSpec`. A report from
//     a wider matrix is REPORTED as not comparable, with both commands named, instead of skipped.
//   · and `checked === 0` on a comparable report is a FAILURE, not a `return`.
//
// The five synthetic controls are what make this real on a machine with no browser: they build
// reports out of the committed attribution itself and assert that the function flags a hidden
// finding, a drifted count and a narrowed matrix, and reconciles a `--only job` report by prefix.
// So the numbers cannot go stale in silence: the next person who runs the audit either reproduces
// them or fails here — and if nobody ever runs it, the controls still prove the gate can fail.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './_helpers.mjs';
import { states as auditStates } from '../qa/audit-states.mjs';

const ALLOW = JSON.parse(readFileSync(join(ROOT, 'qa/audit-allow.json'), 'utf8'));
const STATE_IDS = new Set(auditStates({ base: 'http://localhost:0' }).map((s) => s.id));
const REPORT_PATH = join(ROOT, 'qa/audit/report.json');

/** the entries that are scoped to particular states — i.e. the attributed kind */
const SCOPED = (ALLOW.entries ?? []).filter((e) => Array.isArray(e.states) && !e.states.includes('*'));
const tailOf = (sel) => String(sel).split('>').pop().trim();

/* ================================================================================================
   THE RECONCILER — one pure function, so the synthetic controls exercise the shipped logic
   ================================================================================================ */

/**
 * `--only` is a PREFIX list, exactly as `qa/layout-audit.mjs:1318` reads it
 * (`STATES.filter((s) => CFG.only.some((p) => s.id.startsWith(p)))`). An empty list is everything.
 * This is gate (a) of the three in the header: the old arm used `Set.has`, so a report from
 * `--only job` covered no `job-*` state at all.
 */
const coversState = (only, stateId) => !only?.length || only.some((p) => String(stateId).startsWith(p));

/** the matrix an attribution's own command asks for, parsed the way `qa/layout-audit.mjs` parses it */
function matrixOf(command) {
  const tok = String(command ?? '').trim().split(/\s+/);
  const opt = (n, d) => {
    const i = tok.indexOf(`--${n}`);
    return i >= 0 && tok[i + 1] && !tok[i + 1].startsWith('--') ? tok[i + 1] : d;
  };
  const engine = opt('engine', 'both');
  const theme = opt('theme', 'both');
  return {
    only: (opt('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
    engines: engine === 'both' ? ['chromium', 'webkit'] : [engine],
    themes: theme === 'both' ? ['light', 'dark'] : [theme],
    vpSpec: opt('vp', 'all'),
  };
}

const sameSet = (a, b) => [...(a ?? [])].sort().join(',') === [...(b ?? [])].sort().join(',');

/**
 * THE AXES THAT CHANGE A COUNT. A detector runs once per (viewport, theme, engine), so a count is
 * only comparable with a run over the same three. `--only` is NOT one of them: it decides which
 * states are visited, never how many times a defect fires inside one. That is why the old exact
 * `rep.command === attribution.command` was both too strict (it rejected the acceptance command,
 * which measures the same numbers on the same states) and beside the point.
 */
const comparableMatrix = (rep, m) => sameSet(rep?.config?.engines, m.engines)
  && sameSet(rep?.config?.themes, m.themes)
  && String(rep?.config?.vpSpec ?? '') === m.vpSpec;

/**
 * @param {object} rep      a layout-audit report object (`qa/audit/report.json`'s shape)
 * @param {object[]} blocks the state-scoped waivers, each with its `attribution`
 * @returns a ledger of everything this report can say about those blocks. Nothing is skipped in
 *          silence: every block lands in exactly one of `compared` / `notComparable` / `outOfScope`,
 *          and the reason is on the record either way.
 */
function reconcile(rep, blocks) {
  const waived = rep?.waived ?? [];
  const findings = rep?.findings ?? [];
  const only = rep?.config?.only ?? [];
  const seen = new Set([...findings, ...waived].map((f) => f.state));
  const inRun = (s) => seen.has(s) && coversState(only, s);
  const countOf = (list, state, type, selTail) => list.filter((f) => f.state === state
    && f.type === type && tailOf(f.selector) === selTail).length;

  const out = {
    hostStates: [], hostRows: 0, compared: [], notComparable: [], outOfScope: [],
    counts: [], presence: [], orphans: [], controlLive: [],
  };

  for (const e of blocks) {
    const { control } = e.attribution;
    const m = matrixOf(e.attribution.command);
    const hosts = e.states.filter(inRun);
    if (!hosts.length) { out.outOfScope.push({ type: e.type, why: 'no host state of this block is in the report' }); continue; }
    for (const s of hosts) if (!out.hostStates.includes(s)) out.hostStates.push(s);

    /* PRESENCE — matrix-independent, and it runs for every block the report touches. */
    for (const h of e.attribution.hits) {
      const seenN = hosts.reduce((t, s) => t + countOf(waived, s, h.type, tailOf(h.selector)), 0);
      out.presence.push({ type: e.type, selector: tailOf(h.selector), hosts, seen: seenN });
    }

    /* COUNTS — only against a run whose matrix can produce the same numerals. */
    const controlInRun = inRun(control);
    if (!comparableMatrix(rep, m)) {
      out.notComparable.push({
        type: e.type,
        want: e.attribution.command,
        got: rep?.command ?? '(a report with no `command` field)',
      });
      continue;
    }
    if (!controlInRun) {
      out.notComparable.push({
        type: e.type,
        want: e.attribution.command,
        got: `${rep?.command ?? '(no command)'} — its matrix matches but it never visited the control `
          + `state "${control}"`,
      });
      continue;
    }
    out.compared.push(e.type);
    for (const h of e.attribution.hits) {
      const onHost = hosts.reduce((t, s) => t + countOf(waived, s, h.type, tailOf(h.selector)), 0);
      const onControl = countOf(findings, control, h.type, tailOf(h.controlSelector ?? h.selector));
      out.counts.push({ type: e.type, selector: tailOf(h.selector), control, onHost, onControl, want: h });
      out.controlLive.push({ type: e.type, control, selector: tailOf(h.controlSelector ?? h.selector), onControl });
    }
  }

  /* ORPHANS — the arm that stops a finding hiding behind a paragraph. Matrix-independent. */
  const enumerated = new Set();
  for (const e of blocks) for (const h of e.attribution.hits) for (const s of e.states) {
    enumerated.add(`${s}|${h.type}|${tailOf(h.selector)}`);
  }
  for (const f of waived) {
    if (!blocks.some((e) => e.states.includes(f.state))) continue;      // waived by a global ("*") entry
    out.hostRows++;
    const key = `${f.state}|${f.type}|${tailOf(f.selector)}`;
    if (!enumerated.has(key) && !out.orphans.includes(key)) out.orphans.push(key);
  }
  return out;
}

/* ------------------------------------------------------- synthetic reports for the controls */

/** a report built FROM the committed attribution: every hit at exactly the count it claims */
function syntheticReport(blocks, { command, config } = {}) {
  const waived = [];
  const findings = [];
  const row = (state, type, selector, k) => ({
    state, type, selector, viewport: '375x667', theme: 'light', engine: 'chromium', seq: k,
  });
  for (const e of blocks) {
    for (const h of e.attribution.hits) {
      for (let k = 0; k < h.onHost; k++) waived.push(row(e.states[0], h.type, h.selector, k));
      for (let k = 0; k < h.onControl; k++) {
        findings.push(row(e.attribution.control, h.type, h.controlSelector ?? h.selector, k));
      }
    }
  }
  const m = matrixOf(blocks[0].attribution.command);
  return {
    command: command ?? blocks[0].attribution.command,
    config: config ?? { only: m.only, engines: m.engines, themes: m.themes, vpSpec: m.vpSpec },
    findings,
    waived,
  };
}

describe('qa/audit-allow.json — the ATTRIBUTED waivers carry a measurement, not a paragraph', () => {
  test('there ARE state-scoped waivers, and every one of them is attributed', () => {
    assert.ok(SCOPED.length >= 4,
      `${SCOPED.length} state-scoped waivers — if the job states no longer need any, delete this file with them`);
    for (const e of SCOPED) {
      const a = e.attribution;
      assert.ok(a && typeof a === 'object',
        `the ${e.type} waiver on [${e.states.join(', ')}] has no \`attribution\` block: a waiver scoped to a HOST `
        + 'state is a claim that another state owns the defect, and that claim has to be measured');
      assert.ok(typeof a.control === 'string' && a.control, `${e.type}: no control state named`);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(a.measuredAt ?? ''), `${e.type}: no measuredAt date`);
      assert.ok(/^node qa\/layout-audit\.mjs /.test(a.command ?? ''),
        `${e.type}: the attribution must name the command that produced its counts, got ${JSON.stringify(a.command)}`);
      assert.ok(Array.isArray(a.hits) && a.hits.length > 0, `${e.type}: no hits recorded`);
      assert.ok(/ATTRIBUTED/.test(e.reason ?? ''), `${e.type}: the reason no longer says it is an attribution`);
    }
  });

  test('the control state exists, is a DIFFERENT state, and is waived by nothing', () => {
    for (const e of SCOPED) {
      const { control } = e.attribution;
      assert.ok(STATE_IDS.has(control),
        `${e.type}: the control state "${control}" is not in qa/audit-states.mjs — a control nothing runs proves nothing`);
      assert.ok(!e.states.includes(control),
        `${e.type}: "${control}" is one of the HOST states — the attribution is circular`);
      assert.ok(!e.states.some((p) => control.startsWith(p)),
        `${e.type}: the waiver's own prefix [${e.states.join(', ')}] also covers the control "${control}"`);
      /* …and no STATE-SCOPED waiver mutes the control for this detector. A global ("*") entry is the
         auditor's standing policy (`.sr-only` text has no colour worth measuring) and applies to every
         state including the host, so it cannot be what makes the control look clean; a waiver aimed AT
         the control is exactly that, and it would turn the attribution into an exemption on both
         sides. The live proof that the control is not muted is the reconciliation arm below, which
         reads the hits back out of the report as LIVE findings. */
      for (const w of SCOPED) {
        if (w === e) continue;
        if (!w.states.some((prefix) => control.startsWith(prefix))) continue;
        assert.notEqual(w.type, e.type,
          `${e.type}: the control state "${control}" is itself covered by a state-scoped ${w.type} waiver `
          + `(${JSON.stringify(w.selector).slice(0, 60)}…) — the defect would be muted on both sides`);
      }
    }
  });

  test('every recorded hit is a real count, and the control carries at least as many as the host', () => {
    let hits = 0;
    for (const e of SCOPED) {
      for (const h of e.attribution.hits) {
        hits++;
        assert.equal(h.type, e.type, `${e.type}: a hit of type ${h.type} is recorded under the wrong waiver`);
        assert.ok(typeof h.selector === 'string' && h.selector, `${e.type}: a hit with no selector`);
        assert.ok(Number.isInteger(h.onHost) && h.onHost > 0, `${e.type} ${h.selector}: onHost ${h.onHost}`);
        assert.ok(Number.isInteger(h.onControl) && h.onControl > 0, `${e.type} ${h.selector}: onControl ${h.onControl}`);
        assert.ok(h.onControl >= h.onHost,
          `${e.type} ${h.selector}: the control reports ${h.onControl} against the host's ${h.onHost} — `
          + 'the host is carrying hits the control does not reproduce, so they are not the control\'s to own');
      }
    }
    assert.ok(hits >= 8, `only ${hits} hits enumerated across ${SCOPED.length} attributed waivers`);
  });

  /* ---------------------------------------------------------------- the controls, always live */

  describe('RECONCILIATION · the gate itself, proved on reports built from the committed attribution', () => {
    test('the ACCEPTANCE command reconciles — `--only job` covers `job-answer-kb` by PREFIX', () => {
      /* THE EXACT REGRESSION. `node qa/layout-audit.mjs --only job` is the layer's own acceptance
         command (notes/J6.md) and writes `config.only = ['job']`. Under the old `covered.has(s)`
         every host dropped out and `checked` was 0, so the one command this gate exists to gate was
         the one command it could not read. Here it reconciles every hit on both sides. */
      const m = matrixOf(SCOPED[0].attribution.command);
      const rep = syntheticReport(SCOPED, {
        command: 'node qa/layout-audit.mjs --only job,card-pairs --engine chromium --theme light --vp phone',
        config: { only: ['job', 'card-pairs'], engines: m.engines, themes: m.themes, vpSpec: m.vpSpec },
      });
      const r = reconcile(rep, SCOPED);
      assert.deepEqual(r.notComparable, [],
        'a report whose matrix matches the attribution was still refused — the command text is not the gate');
      assert.equal(r.compared.length, SCOPED.length, `only ${r.compared.length} of ${SCOPED.length} blocks reconciled`);
      const total = SCOPED.reduce((n, e) => n + e.attribution.hits.length, 0);
      assert.equal(r.counts.length, total, `${r.counts.length} of ${total} hits compared`);
      for (const c of r.counts) {
        assert.equal(c.onHost, c.want.onHost, `${c.type} ${c.selector}: host ${c.onHost} vs ${c.want.onHost}`);
        assert.equal(c.onControl, c.want.onControl, `${c.type} ${c.selector}: control ${c.onControl} vs ${c.want.onControl}`);
      }
      assert.deepEqual(r.orphans, []);
      assert.ok(r.hostRows > 0, 'the orphan arm walked no waived row');
    });

    test('CONTROL · a waived hit that no attribution enumerates is named, not hidden', () => {
      /* This is the 47-findings arm, exercised. Under the old gate it sat behind `if (!checked)
         return;`, so on the report that was actually on disk it never ran at all. */
      const rep = syntheticReport(SCOPED);
      rep.waived.push({
        state: SCOPED[0].states[0], type: 'offscreen', selector: 'div.job-beat > button.job-bag',
        viewport: '320x568', theme: 'dark', engine: 'webkit',
      });
      const r = reconcile(rep, SCOPED);
      assert.deepEqual(r.orphans, [`${SCOPED[0].states[0]}|offscreen|button.job-bag`],
        'a waived finding on a job state that is in no attribution block was not reported as an orphan');
    });

    test('CONTROL · a count that has drifted by one is caught on the host AND on the control', () => {
      for (const side of ['waived', 'findings']) {
        const rep = syntheticReport(SCOPED);
        rep[side].pop();
        const r = reconcile(rep, SCOPED);
        const bad = r.counts.filter((c) => c.onHost !== c.want.onHost || c.onControl !== c.want.onControl);
        assert.equal(bad.length, 1,
          `dropping one ${side === 'waived' ? 'host' : 'control'} row left ${bad.length} mismatched counts — `
          + 'the reconciler is not comparing what the block claims');
      }
    });

    test('CONTROL · a report from a WIDER matrix is refused by name, and still orphan-checked', () => {
      /* The report that was on disk when this finding was written: `--engine both`, `--vp all`. Its
         per-state counts are not the attribution's numbers and must not be compared with them — but
         "not comparable" is a sentence the gate says, not a `return` it takes, and the set arms run
         on it regardless. */
      const m = matrixOf(SCOPED[0].attribution.command);
      const rep = syntheticReport(SCOPED, {
        command: 'node qa/layout-audit.mjs --only job,run,home --engine both --no-confirm',
        config: { only: ['job', 'run', 'home'], engines: ['chromium', 'webkit'], themes: ['light', 'dark'], vpSpec: 'all' },
      });
      const r = reconcile(rep, SCOPED);
      assert.equal(r.compared.length, 0, 'a wider matrix was compared as if it measured the same numbers');
      assert.equal(r.notComparable.length, SCOPED.length,
        'a block was neither compared nor reported as not comparable — that is the silent skip again');
      for (const n of r.notComparable) {
        assert.ok(n.want && n.got && n.want !== n.got, `the refusal does not name both commands: ${JSON.stringify(n)}`);
      }
      assert.deepEqual(r.orphans, [], 'the orphan arm must still run on a report it cannot count-reconcile');
      assert.ok(r.presence.every((p) => p.seen > 0), 'and so must the presence arm');
      assert.ok(r.hostRows > 0);
      assert.notEqual(m.vpSpec, 'all', 'the attribution no longer names a narrow viewport set — this control is moot');
    });

    test('CONTROL · a hit the run no longer produces is reported ABSENT, not quietly matched', () => {
      const rep = syntheticReport(SCOPED);
      const victim = SCOPED[0].attribution.hits[0];
      rep.waived = rep.waived.filter((f) => tailOf(f.selector) !== tailOf(victim.selector) || f.type !== victim.type);
      const r = reconcile(rep, SCOPED);
      const gone = r.presence.filter((p) => p.seen === 0);
      assert.equal(gone.length, 1,
        `removing every "${tailOf(victim.selector)}" row left ${gone.length} hits reported absent — a block `
        + 'whose defect has been FIXED must go stale loudly, not keep waiving nothing');
    });
  });

  /* ---------------------------------------------------------------- the report on disk, if any */

  test('RECONCILIATION: a report on disk is reconciled, or refused by name — never skipped in silence', () => {
    if (!existsSync(REPORT_PATH)) {
      /* gitignored by design (`.gitignore`: "the report and its evidence PNGs are regenerated on every
         run"), so a fresh checkout has none. The controls above are what make the gate real there. */
      assert.ok(SCOPED.every((e) => e.attribution.command.includes('--only')),
        'no qa/audit/report.json to reconcile against, and no attribution names a narrow command to produce one');
      return;
    }
    const rep = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
    const r = reconcile(rep, SCOPED);

    if (!r.hostStates.length) {
      /* a report of other screens entirely. Not a defect — but it is not evidence either, and the
         arm says which run it was rather than returning as though it had checked something. */
      assert.equal(r.hostRows, 0,
        `qa/audit/report.json waives ${r.hostRows} findings on a job state while covering none of them `
        + `in \`config.only\` (${JSON.stringify(rep.config?.only)}) — the two cannot both be true`);
      console.log(`  qa/audit/report.json covers no attributed host state (${rep.command}) — nothing to reconcile`);
      return;
    }

    /* 1. NOTHING IS HIDDEN — matrix-independent, and it runs on every report that touches a host. */
    assert.ok(r.hostRows > 0,
      `qa/audit/report.json covers ${r.hostStates.join('/')} and waives nothing on them, yet four blocks `
      + 'claim to be waiving findings there — one of the two is stale');
    assert.deepEqual(r.orphans, [],
      'these waived hits on a job state are in no attribution block — they are being hidden, not attributed');

    /* 2. EVERY ENUMERATED HIT IS STILL LIVE — the other direction of staleness. */
    for (const p of r.presence) {
      assert.ok(p.seen > 0,
        `${p.type} ${p.selector}: the attribution waives it on ${p.hosts.join('/')}, and the report at `
        + 'qa/audit/report.json produces it nowhere on those states. Either the defect is fixed (delete '
        + `the hit) or the selector has moved (re-measure: ${SCOPED.find((e) => e.type === p.type)?.attribution.command})`);
    }

    /* 3. THE COUNTS — against a comparable run only, and a comparable run that compares nothing is
          a failure rather than a `return`. */
    if (r.compared.length) {
      assert.ok(r.counts.length > 0,
        `qa/audit/report.json matches the attribution's matrix on ${r.compared.length} block(s) and this `
        + 'gate still compared nothing — the hits name selectors the run does not produce');
      for (const c of r.counts) {
        assert.equal(c.onHost, c.want.onHost,
          `${c.type} ${c.selector}: the report waives ${c.onHost} on the host, the attribution says `
          + `${c.want.onHost} — re-measure and restate the block`);
        assert.equal(c.onControl, c.want.onControl,
          `${c.type} ${c.selector}: the report reports ${c.onControl} LIVE on ${c.control}, the `
          + `attribution says ${c.want.onControl}`);
        assert.ok(c.onControl > 0,
          `${c.type} ${c.selector}: the control ${c.control} reports NOTHING live — the hit is not attributable to it`);
      }
    } else {
      /* REFUSED BY NAME. Not a failure: a wider or narrower matrix genuinely measures a different
         number of the same defect, and arms 1 and 2 have already run over this report. What is
         forbidden is being here without saying so — the old arm's `continue`.
         REQUEST (notes/repair-tests.md): `hits[].byConfig` in qa/audit-allow.json, so the layer's
         own acceptance command (`--only job`, the run someone has a reason to produce) carries its
         counts too and lands in the branch above instead of this one. That file is not this lane's. */
      assert.equal(r.notComparable.length + r.outOfScope.length, SCOPED.length,
        `${SCOPED.length - r.notComparable.length - r.outOfScope.length} block(s) were neither compared, `
        + 'refused nor out of scope — a block fell through the reconciler without a verdict');
      for (const n of r.notComparable) {
        console.log(`  ${n.type}: counts not reconciled — the block was measured by\n      ${n.want}\n    `
          + `and the report on disk is\n      ${n.got}`);
      }
    }
  });
});
