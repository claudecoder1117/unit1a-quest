// screens/onboard.js — #/onboard, first run (COMPOSED S7 "First run", S1 "Week", S4 mastery writes).
//
// Three screens, EVERY ONE SKIPPABLE — nothing is mandatory before the first card:
//   1. Test date + period time + daily goal + theme, and a 20-second controls line. "Later" leaves the
//      date unset; the header then shows its "set test date" chip and the plan runs at 12 new a day.
//   2. How this works — the real Card `ang-02` live in a SANDBOX (`ctx.sandbox`: graded and animated,
//      no save writes — no clear, no tile, no attempt; the Binder still shows ang-02 unplayed), the
//      rarity tiles, "◆ Variants = same problem, new numbers", "Scratch is yours, never graded".
//   3. Placement — 8 items (4 when D ≤ 2), all drawn one per cluster, no hints, a progress bar,
//      "skip the rest" after item 4, or "I'll start from zero" up front. Earns XP normally.
//      Each item writes m = 80 / 50 / 0 (clean / retry / wrong) with **n = 5** so m_shown = m from the
//      first minute; skills never touched stay grey "untested". A CLEAN item marks its module *placed*
//      exactly like JUMP HERE (M4 needs both of its items clean).
// Then the summary: what was placed, the provisional Readiness, and the **Baseline** offer (S7).
//
// JUMP HERE (`#/run/jump/:module`, reachable from every Binder tile) is the same runner at 10 items:
// ≥ 8/10 marks the module placed with m = 80, n = 5 and `skills[id].placedAt`.
//
// Registered in screens/index.js: screens['/onboard'] = mountOnboard. `createSequence` is exported for
// screens/night.js (the Night Before and Test Morning blocks are the same runner with other rules).

import { h, navigate, applyTheme, setHeader, bus } from '../app.js';
import { getState, update } from '../store.js';
import { todayISO, daysUntilTest, nextSchoolDay, isISO } from '../days.js';
import { cyrb53 } from '../rng.js';
import { readiness } from '../readiness.js';
import { placementSize, placementCopy, PLACEMENT_FULL } from '../plan.js';
import { moduleById } from '../../data/modules.js';
import { createCardView } from './card.js';

/* ------------------------------------------------------------------ lazy data (keeps #/today light) */
let T = null;   // data/templates.js
let C = null;   // data/cards.js
const loadT = () => (T ? Promise.resolve(T) : import('../../data/templates.js').then(m => (T = m)));
const loadC = () => (C ? Promise.resolve(C) : import('../../data/cards.js').then(m => (C = m)));
/** Both of the above (also what the tests await before reading `jumpItems` / `skillsOf`). */
export const loadData = () => Promise.all([loadT(), loadC()]).then(() => undefined);

/* ------------------------------------------------------------------ placement clusters (S7) */
/**
 * One item per cluster, in the order the student meets them: easiest first, the heaviest last.
 * `short: true` marks the four that survive the D ≤ 2 trim (M1 · M9 · M4-linear · M10 — 149 of the
 * 164 bank items between them, and every one of them tier ≤ 3).
 *
 * NOTE (S7 says "all tier ≤ 3"): `T-fig-bisect-L` is registered tier 4 by T07b even though S7 names it
 * as a placement item. It is kept — S7 names the template explicitly — but it is LAST, it is never in
 * the trimmed run, and "skip the rest" has been available for three items by the time it appears.
 * See notes/T14.md → Requests (T07b).
 */
export const PLACEMENT_CLUSTERS = Object.freeze([
  { key: 'notation', module: 'M1', template: 'T-notation', params: { kind: 'ray' }, label: 'Notation', blurb: 'Write the symbol.', short: true },
  { key: 'asn', module: 'M9', card: 'asn', label: 'Always / Sometimes / Never', blurb: 'One statement, one verdict.', short: true },
  { key: 'cslin', module: 'M4', template: 'T-cs-lin', params: {}, label: 'Comp/supp word problem', blurb: 'Set it up, then solve it.', short: true },
  { key: 'fac2', module: 'M10', template: 'T-factor-a2', params: {}, label: 'Factoring, a > 1', blurb: 'The Kuta sheet’s hard half.', short: true },
  { key: 'ratio', module: 'M4', template: 'T-cs-ratio', params: {}, label: 'Ratio word problem', blurb: 'Parts of 180 or 90.', short: false },
  { key: 'sys', module: 'M12', template: 'T-sys', params: {}, label: 'A system', blurb: 'Two equations, two unknowns.', short: false },
  { key: 'quad', module: 'M11', template: 'T-quad-solve', params: { mode: 'a1' }, label: 'Solve by factoring', blurb: 'a = 1 — both roots.', short: false },
  { key: 'bisect', module: 'M7', template: 'T-fig-bisect-L', params: {}, label: 'Does it bisect?', blurb: 'Solve, halve, decide.', short: false },
].map(Object.freeze));

/** S4 / S7: placement and JUMP write these, with n = 5. */
export const PLACEMENT_M = Object.freeze({ clean: 80, retry: 50, wrong: 0 });
export const PLACEMENT_N = 5;
export const SKIP_AFTER = 4;            // "skip the rest" is offered after item 4 (S7)
export const JUMP_ITEMS = 10;           // JUMP HERE: 10 items …
export const JUMP_PASS = 8;             // … ≥ 8/10 marks the module placed (S1)
export const SANDBOX_CARD = 'ang-02';   // the "How this works" card (S7)

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const profile6 = save => String(save?.profileId ?? 'anon').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'anon';

/** The outcome S7 scores: clean (first try, no hints) / retry (cleared, but not) / wrong. */
export function outcomeOf(result) {
  if (!result || result.cleared !== true) return 'wrong';
  if (result.clean === true) return 'clean';
  if (result.firstTry === true && (result.hints | 0) === 0) return 'clean';
  return 'retry';
}

/** Deterministic ASN statement for this save (no Math.random — S8 rule). */
function asnCardId(save) {
  const n = cyrb53(`${profile6(save)}|placement|asn`) % 36;
  return `asn-${String(n + 1).padStart(2, '0')}`;
}

/** The skills an item drives (template entry or card). */
function skillsOf(cluster, save) {
  if (cluster.card === 'asn') return C?.byId?.[asnCardId(save)]?.skills ?? ['ASN-PLP'];
  return T?.getTemplate?.(cluster.template)?.skills ?? [];
}

/**
 * placementItems(save, { D, count }) → the run's items, in cluster order.
 * Each is { key, cluster, label, blurb, module, source, opts } where `source` is what `createCardView`
 * takes ({ id } for the ASN original, { template, seed } for a Variant).
 */
export function placementItems(save, { D = daysUntilTest(save?.settings?.testDate), count = null } = {}) {
  const n = count ?? placementSize(D);
  const pool = n <= PLACEMENT_CLUSTERS.filter(c => c.short).length
    ? PLACEMENT_CLUSTERS.filter(c => c.short)
    : PLACEMENT_CLUSTERS;
  const p6 = profile6(save);
  return pool.slice(0, n).map(c => ({
    key: c.key, cluster: c, label: c.label, blurb: c.blurb, module: c.module,
    source: c.card === 'asn' ? { id: asnCardId(save) } : { template: c.template, seed: `${p6}-pl-${c.key}` },
    params: c.params ?? null,
  }));
}

/* ------------------------------------------------------------------ the save writes (S4 / S7) */

/** Write one skill the placement / JUMP way: m with n = 5, `placedAt` only when the item was CLEAN. */
function writeSkill(save, id, m, { now, placed }) {
  if (!isObj(save.skills)) save.skills = {};
  const prev = isObj(save.skills[id]) ? save.skills[id] : {};
  const next = {
    ...prev,
    m: Math.max(0, Math.min(100, m)),
    n: Math.max(Number.isFinite(prev.n) ? prev.n : 0, PLACEMENT_N),
    lastAt: now,
    lastDueCorrectAt: Number.isFinite(prev.lastDueCorrectAt) ? prev.lastDueCorrectAt : null,
    placedAt: placed ? now : (prev.placedAt ?? null),
  };
  delete next.decay;                       // a fresh number is not a decayed one (schedule.js ledger)
  save.skills[id] = next;
  return next;
}

/* ---------------- how much evidence a module needs before it is placed (W5) ---------------- */
/**
 * INTEGRATOR DECISION, Wave 5 — `notes/OPEN-ISSUES.md` §A2, raised by T14 #3.
 *
 * S7 says "a clean placement item marks its module placed exactly like JUMP HERE". Taken literally that
 * costs the student the whole packet: **M1 `Lexicon` holds 55 originals** (23 vocab + 9 notation + 14
 * definitions + 5 facts + 4 classify) behind ONE placement cluster — "write the symbol for a ray". One
 * clean answer there removed all 55 from the new-card pool permanently, and because they were never
 * attempted (`lastAt == null`) they never came back as reviews either.
 *
 * So the rule keeps S7's sentence for a module the placement can actually sample, and asks a big module
 * for more than the placement has to give: a module with more than `PLACE_MAX_ORIGINALS` originals needs
 * `PLACE_LARGE_CLEAN` clean clusters. M1 has one cluster, so the placement never places it — JUMP HERE
 * (10 items, ≥ 8, `applyJump`) stays the gate that can, which is a real sample of 55 cards' worth of work.
 * The skill itself still gets its m = 80 and its `placedAt`: what was demonstrated is recorded either way.
 */
export const PLACE_MAX_ORIGINALS = 40;   // > this many originals = "too big to place off one item"
export const PLACE_LARGE_CLEAN = 2;      // … and it then needs this many clean clusters

/** Originals in a module's Original Set (0 for a generator-only module such as M3). */
export const originalsCount = mod => moduleById[mod]?.originals?.length ?? 0;

/** Clean placement clusters this module needs before the placement will mark it placed. */
export function placeNeedsClean(mod) {
  return originalsCount(mod) > PLACE_MAX_ORIGINALS ? PLACE_LARGE_CLEAN : 1;
}

/** True when the placement cannot ever place this module, however cleanly it is answered. */
export function placeWithheld(mod) {
  return PLACEMENT_CLUSTERS.filter(c => c.module === mod).length < placeNeedsClean(mod);
}

/**
 * applyPlacement(save, results, { now, items }) — the S7 writes, idempotent for one run.
 *   results: { [clusterKey]: { outcome, skills:[…], module } }
 * Writes every touched skill (m = 80/50/0, n = 5), marks a module `placed` when its cluster(s) were
 * clean (M4 needs BOTH of its items; a module bigger than `PLACE_MAX_ORIGINALS` needs `PLACE_LARGE_CLEAN`
 * — see above), and stamps `save.placement`.
 * Returns { placedModules: [], withheld: [], skills: { id: m }, clean, retry, wrong }.
 */
export function applyPlacement(save, results, { now = Date.now(), done = true, skipped = 0, total = PLACEMENT_FULL } = {}) {
  const tally = { clean: 0, retry: 0, wrong: 0 };
  const skills = {};
  const cleanByModule = new Map();     // module → [clean?]
  for (const cluster of PLACEMENT_CLUSTERS) {
    const r = results?.[cluster.key];
    if (!r) continue;
    tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
    const list = cleanByModule.get(cluster.module) ?? [];
    list.push(r.outcome === 'clean');
    cleanByModule.set(cluster.module, list);
  }
  const placedModules = [];
  const withheld = [];
  for (const [mod, flags] of cleanByModule) {
    // "A clean placement item marks its module placed exactly like JUMP HERE (M4 needs BOTH clean)."
    const asked = PLACEMENT_CLUSTERS.filter(c => c.module === mod && results?.[c.key]).length;
    const total_ = PLACEMENT_CLUSTERS.filter(c => c.module === mod).length;
    const allClean = flags.length > 0 && flags.every(Boolean) && (total_ === 1 || asked === total_);
    if (!allClean) continue;
    // W5 (§A2): a module too big for the placement to sample keeps its cards in the pool.
    if (flags.length >= placeNeedsClean(mod)) placedModules.push(mod);
    else withheld.push(mod);
  }
  for (const cluster of PLACEMENT_CLUSTERS) {
    const r = results?.[cluster.key];
    if (!r) continue;
    const m = PLACEMENT_M[r.outcome] ?? 0;
    for (const sid of r.skills ?? []) {
      // a skill shared by two clusters keeps the better number (M4's CS-LIN / CS-RATIO are distinct)
      if (skills[sid] != null && skills[sid] >= m) continue;
      skills[sid] = m;
      writeSkill(save, sid, m, { now, placed: r.outcome === 'clean' });
    }
  }
  if (!isObj(save.jumps)) save.jumps = {};
  for (const mod of placedModules) save.jumps[mod] = true;
  save.placement = {
    done: !!done, at: now, answered: Object.keys(results ?? {}).length, total, skipped,
    placed: placedModules.slice(),
    results: Object.fromEntries(Object.entries(results ?? {}).map(([k, v]) => [k, v.outcome])),
  };
  return { placedModules, withheld, skills, ...tally };
}

/**
 * applyJump(save, moduleId, { correct, total, skills, now }) — S1 JUMP HERE: ≥ 8/10 marks the module
 * placed (m = 80 **with n = 5** so m_shown = 80 at once, `placedAt`, `jumps[M] = true`).
 *
 * BELOW the bar nothing is written here at all. Each of the 10 cards has already moved mastery through
 * the normal EMA path as it was answered (S4: s = 100 / 70 / 40 / 0); stamping a flat m on top of that
 * would double-count the same run and could wipe a genuinely earned 70 down to 0 for one bad sitting.
 * S1 only defines the pass case, and "nothing is lost" is what the screen tells the student.
 */
export function applyJump(save, moduleId, { correct = 0, total = JUMP_ITEMS, skills = [], now = Date.now() } = {}) {
  const passed = correct >= JUMP_PASS;
  if (!passed) return { passed: false, m: null, correct, total };
  for (const sid of skills) writeSkill(save, sid, PLACEMENT_M.clean, { now, placed: true });
  if (!isObj(save.jumps)) save.jumps = {};
  save.jumps[moduleId] = true;
  return { passed: true, m: PLACEMENT_M.clean, correct, total };
}

/* ------------------------------------------------------------------ the shared sequence runner */

/**
 * createSequence(host, cfg) → { el, destroy() }
 * One item at a time, with a progress bar and an optional "skip the rest". Used by the placement, by
 * JUMP HERE and by every Night Before / Test Morning block (screens/night.js).
 *
 * cfg = {
 *   items: [{ key, label?, blurb?, source, params?, opts? }],   // source: { id } | { template, seed }
 *   title, sub, badge,                                          // the block heading (badge: a live node, e.g. a clock)
 *   cardOpts,                                                   // merged into every createCardView call
 *   skipAfter: number|null, skipLabel,                          // "skip the rest" (S7)
 *   quitLabel, onQuit,                                          // the always-available way out
 *   onItem(result, item, index), onFinish({ results, answered, skipped, items }),
 *   footer(index, item)                                          // optional extra node under the card
 * }
 */
export function createSequence(host, cfg = {}) {
  const items = (cfg.items ?? []).filter(Boolean);
  const total = items.length;
  const results = [];
  let i = 0, view = null, destroyed = false, skipped = 0;

  const root = h('section.screen.ob-run', { 'aria-label': cfg.title || 'Run' });
  const head = h('header.ob-run-head');
  const titleEl = h('h1.fs-3.ob-run-title', cfg.title || '');
  const counter = h('span.ob-run-count.mono', '');
  // One segmented progress bar: a tick per item, filled by outcome. (A second continuous bar above it
  // said the same thing and cost 20 px of a 375 px screen the sticky head cannot afford.)
  const ticks = h('ol.ob-ticks', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0', 'aria-label': `${cfg.title || 'Run'} progress` });
  const subEl = h('p.ob-run-sub.muted.fs-1', cfg.sub || '');
  const actions = h('div.ob-run-actions');
  head.append(h('div.ob-run-headline', titleEl, cfg.badge ?? null, counter), ticks, h('div.ob-run-meta', subEl, actions));
  const stage = h('div.ob-run-stage');
  const footer = h('div.ob-run-footer');
  root.append(head, stage, footer);
  host.append(root);

  function drawProgress() {
    const done = results.length;
    ticks.setAttribute('aria-valuenow', String(done));
    counter.textContent = total ? `${Math.min(i + 1, total)} / ${total}` : '';
    ticks.replaceChildren(...items.map((_, n) => {
      const r = results[n];
      const li = h('li.ob-tick', { dataset: { state: r ? r.outcome : n === i ? 'now' : 'todo' } });
      return li;
    }));
    actions.replaceChildren();
    if (cfg.skipAfter != null && results.length >= cfg.skipAfter && results.length < total) {
      actions.append(h('button.btn.btn-ghost.ob-skip', {
        type: 'button', onclick: () => finish({ skipRest: true }),
        title: `${total - results.length} left — what you have answered still counts`,
      }, cfg.skipLabel || `Skip the rest (${total - results.length})`));
    }
    if (cfg.quitLabel) actions.append(h('button.btn.btn-ghost.ob-quit', { type: 'button', onclick: () => cfg.onQuit?.() }, cfg.quitLabel));
  }

  function finish({ skipRest = false } = {}) {
    if (destroyed) return;
    if (skipRest) skipped = total - results.length;
    teardownView();
    cfg.onFinish?.({ results: results.slice(), answered: results.length, skipped, items });
  }

  function teardownView() {
    if (view) { try { view.destroy(); } catch { /* gone */ } view = null; }
    stage.replaceChildren();
  }

  function step() {
    if (destroyed) return;
    if (i >= total) return finish();
    const item = items[i];
    teardownView();
    drawProgress();
    // home r1: the previous item was answered at the bottom of the page, so without this the next stem
    // mounts under the sticky head (stemTop −95…−221 px measured). The head keeps the progress bar in
    // view, so top-of-page is the right place. `.ob-run-stage { overflow-anchor: none }` (polish.css)
    // stops Chrome's scroll anchoring from re-applying the old offset when the card parts mount async.
    window.scrollTo({ top: 0, behavior: 'auto' });
    footer.replaceChildren(cfg.footer?.(i, item) ?? '');
    if (item.label) subEl.textContent = `${item.label}${item.blurb ? ' — ' + item.blurb : ''}`;
    const index = i;
    const opts = {
      hints: false, back: cfg.back || '/today', ...(cfg.cardOpts || {}), ...(item.opts || {}),
      query: item.params ? new URLSearchParams(item.params) : undefined,
      onDone: (result) => {
        if (destroyed) return;
        const outcome = outcomeOf(result);
        // Captured while the view is still alive: the report (Night Before, Mock) shows the student's
        // own scratch beside the worked solution, and neither survives `destroy()`.
        const rec = {
          key: item.key, index, item, result, outcome,
          scratch: stage.querySelector('.card-scratch')?.value ?? '',
          stem: view?.item?.stem ?? '',
          solution: (view?.item?.solution ?? []).slice(),
          itemId: result?.id ?? item.source?.id ?? null,
          firstTry: result?.firstTry === true && result?.cleared === true,
        };
        results[index] = rec;
        try { cfg.onItem?.(rec, item, index); } catch (e) { console.error('sequence.onItem', e); }
        drawProgress();
      },
      onContinue: () => { i = index + 1; step(); },
    };
    view = createCardView(stage, item.source, opts);
  }

  drawProgress();
  step();

  return {
    el: root,
    get index() { return i; },
    get results() { return results.slice(); },
    destroy() { destroyed = true; teardownView(); root.remove(); },
  };
}

/* ------------------------------------------------------------------ screen 1: setup */

function setupScreen(el, { onNext, onSkip, save }) {
  const today = todayISO();
  const st = save.settings ?? {};
  const defDate = st.testDate && isISO(st.testDate) ? st.testDate : nextSchoolDay(today, 2);
  const dateIn = h('input#ob-date', { type: 'date', value: defDate, min: today });
  const timeIn = h('input#ob-time', { type: 'time', value: st.testTime || '08:00', step: '300' });
  const goalIn = h('input#ob-goal', { type: 'range', min: '100', max: '800', step: '50', value: String(st.dailyGoal ?? 400) });
  const goalOut = h('output.mono.ob-goal-out', { for: 'ob-goal' }, String(st.dailyGoal ?? 400));
  goalIn.addEventListener('input', () => { goalOut.textContent = goalIn.value; });

  const themeRow = h('div.ob-theme', { role: 'radiogroup', 'aria-label': 'Theme' },
    [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) => {
      const b = h('button.btn.ob-theme-btn', {
        type: 'button', role: 'radio', 'aria-checked': String((st.theme ?? 'auto') === v), dataset: { theme: v },
        onclick: () => {
          for (const x of themeRow.querySelectorAll('[role="radio"]')) x.setAttribute('aria-checked', String(x === b));
          update(s => { s.settings.theme = v; });
          applyTheme(v);
        },
      }, label);
      return b;
    }));

  const commit = () => update(s => {
    const d = dateIn.value;
    s.settings.testDate = isISO(d) ? d : null;
    s.settings.testTime = /^\d{2}:\d{2}$/.test(timeIn.value) ? timeIn.value : '08:00';
    s.settings.dailyGoal = Math.min(800, Math.max(100, Math.round(Number(goalIn.value) || 400)));
  });

  el.append(h('section.screen.ob-step', { 'aria-labelledby': 'ob-h1' },
    h('p.ob-eyebrow.muted.fs-1', 'Step 1 of 3 · about 30 seconds'),
    h('h1#ob-h1', 'When is the test?'),
    h('p.muted', 'The date is the only thing the plan needs. Everything else has a sensible default, and you can change all of it later in Settings.'),
    h('div.card.ob-card',
      h('div.ob-field',
        h('label', { for: 'ob-date' }, 'Test date'),
        dateIn,
        h('p.muted.fs-1', 'Used for the countdown, the spacing and the Night Before. Nothing else.')),
      h('div.ob-field',
        h('label', { for: 'ob-time' }, 'Period time'),
        timeIn,
        h('p.muted.fs-1', 'When your period starts. It decides when test day turns into “after the test”.')),
      h('div.ob-field',
        h('label', { for: 'ob-goal' }, 'Daily goal'),
        h('div.ob-goal-row', goalIn, goalOut, h('span.muted.fs-1', 'XP')),
        h('p.muted.fs-1', 'A floor for the streak, not a ceiling. One page is about 500 XP.')),
      h('div.ob-field',
        h('span.ob-field-label', 'Theme'),
        themeRow,
        h('p.muted.fs-1', 'Sound stays off. You can turn it on in Settings.')),
    ),
    h('p.ob-controls.fs-1',
      h('b', 'Controls: '),
      h('kbd', 'Enter'), ' submits · ',
      h('kbd', 'H'), ' hint · ',
      h('kbd', 'N'), ' next · a keypad row sits above the keyboard on a phone.'),
    h('div.ob-nav',
      h('button.btn.btn-primary.ob-next', { type: 'button', onclick: () => { commit(); onNext(); } }, 'Next'),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => onSkip() }, 'Later'),
    ),
  ));
}

/* ------------------------------------------------------------------ screen 2: how this works */

const RARITY_LEGEND = [
  ['gold', 'Gold', 'first try, at most one hint'],
  ['silver', 'Silver', 'first try with hints, or second try'],
  ['bronze', 'Bronze', 'third try, or you read the solution'],
  ['platinum', 'Platinum', 'Gold + the foil your tile asks for'],
];

function howScreen(el, { onNext, onSkip }) {
  const wrap = h('section.screen.ob-step', { 'aria-labelledby': 'ob-h2' },
    h('p.ob-eyebrow.muted.fs-1', 'Step 2 of 3 · this one is a real problem'),
    h('h1#ob-h2', 'How this works'),
    h('p.muted', 'Below is a real card from the packet, live. Answer it, get it wrong, ask for a hint — ',
      h('b', 'nothing here is saved'), '. It stays unplayed in your Binder.'),
  );
  const sandbox = h('div.ob-sandbox');
  wrap.append(sandbox);
  wrap.append(
    h('div.card.ob-card',
      h('h2.fs-3', 'Tiles'),
      h('ul.ob-rarity', RARITY_LEGEND.map(([k, name, rule]) => h('li.ob-rarity-row',
        h('span.tile-chip', { dataset: { rarity: k } }, name),
        h('span.muted.fs-1', rule)))),
      h('p.fs-2', h('b', '◆ Variants'), ' are the same problem with new numbers. They never replace the original — they are how you prove you can do it twice.'),
      h('p.fs-2', h('b', 'Scratch'), ' is yours. It is saved with the card and it is never graded.'),
    ),
    h('div.ob-nav',
      h('button.btn.btn-primary', { type: 'button', onclick: () => onNext() }, 'Next: where are you now?'),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => onSkip() }, 'Skip'),
    ),
  );
  el.append(wrap);
  const view = createCardView(sandbox, { id: SANDBOX_CARD }, {
    sandbox: true, save: false, back: '/onboard',
    onContinue: () => onNext(),
  });
  return () => { try { view.destroy(); } catch { /* gone */ } };
}

/* ------------------------------------------------------------------ screen 3: placement */

function placementIntro(el, { save, D, onStart, onZero }) {
  const n = placementSize(D);
  const copy = placementCopy(D);
  el.append(h('section.screen.ob-step', { 'aria-labelledby': 'ob-h3' },
    h('p.ob-eyebrow.muted.fs-1', 'Step 3 of 3 · about 10 minutes'),
    h('h1#ob-h3', 'Where are you now?'),
    h('p', `${n} problems, one from each corner of the unit. No hints, no timer, and it pays XP like anything else.`),
    h('p.muted', 'Every one you get first time marks that part of the packet as known, so the plan stops scheduling it as new. Get one wrong and nothing bad happens — the plan just starts you there.'),
    copy ? h('p.ob-tight.warn', copy) : null,
    h('div.card.ob-card',
      h('h2.fs-3', 'What you will see'),
      h('ol.ob-cluster-list', placementItems(save, { D }).map(it => h('li',
        h('b', it.label), ' — ', h('span.muted', it.blurb))))),
    h('div.ob-nav',
      h('button.btn.btn-primary', { type: 'button', onclick: onStart }, `Start · ${n} problems`),
      h('button.btn.btn-ghost', { type: 'button', onclick: onZero }, 'I’ll start from zero'),
    ),
  ));
}

function placementSummary(el, save, { onBaseline, onToday }) {
  const p = save.placement ?? {};
  const placed = (p.placed ?? []).map(m => moduleById[m]?.name ?? m);
  const rd = readiness(save);
  const results = p.results ?? {};
  // W5 (§A2): a clean item on a module the placement is not allowed to place must not say "placed".
  const placedSet = new Set(p.placed ?? []);
  const withheld = [...new Set(PLACEMENT_CLUSTERS
    .filter(c => results[c.key] === 'clean' && !placedSet.has(c.module) && placeWithheld(c.module))
    .map(c => c.module))];
  // home r1: a clean item whose module needs its sibling cluster clean too (M4: linear AND ratio) says so,
  // instead of a bare "first try" beside another row's "placed".
  const cleanSub = (c) => {
    if (placedSet.has(c.module)) return 'placed';
    if (placeWithheld(c.module)) return 'first try';
    const sibling = PLACEMENT_CLUSTERS.find(o => o.module === c.module && o.key !== c.key);
    if (!sibling) return 'first try';
    const sib = results[sibling.key];
    const what = sibling.label.replace(/ word problem$/, '').toLowerCase();
    return sib === 'clean' ? 'first try' : sib ? `first try · the ${what} item too` : `first try · needs the ${what} item too`;
  };
  const rows = PLACEMENT_CLUSTERS.filter(c => results[c.key]).map(c => h('li.ob-result-row', { dataset: { outcome: results[c.key] } },
    h('span.ob-result-mark', { 'aria-hidden': 'true' }, results[c.key] === 'clean' ? '✓' : results[c.key] === 'retry' ? '·' : '✗'),
    h('span.ob-result-name', c.label),
    h('span.muted.fs-1', results[c.key] === 'clean' ? cleanSub(c) : results[c.key] === 'retry' ? 'second try' : 'start here')));

  el.append(h('section.screen.ob-step', { 'aria-labelledby': 'ob-h4' },
    h('p.ob-eyebrow.muted.fs-1', 'Placement done'),
    h('h1#ob-h4', `Readiness ${rd.r}`),
    h('p.muted', rd.provisional ? `Provisional — over the ${rd.tested} of ${rd.skillsTotal} skills tested so far. The Baseline below turns it into a real number.` : `Locked by ${rd.mock?.kind ?? 'a mock'}.`),
    h('div.card.ob-card',
      h('h2.fs-3', `${p.answered ?? 0} of ${p.total ?? PLACEMENT_FULL} answered`),
      h('ul.ob-results', rows),
      placed.length
        ? h('p.fs-2', h('b', 'Placed: '), placed.join(' · '), h('span.muted.fs-1', ' — those stop being scheduled as new. They still come back as reviews.'))
        : h('p.fs-2.muted', 'Nothing placed yet — the plan will start you at the beginning of each thread, which is exactly what it is for.'),
      withheld.length
        ? h('p.fs-2.muted', `${withheld.map(m => moduleById[m]?.name ?? m).join(' · ')} stayed in the plan on purpose: ${withheld.length === 1 ? 'it is' : 'they are'} too big to skip off one question (${withheld.map(m => originalsCount(m)).join(' / ')} cards). `,
          h('b', 'JUMP HERE'), ' in the Binder is 10 questions — clear 8 and it is skipped for real.')
        : null,
    ),
    h('div.card.ob-card.ob-baseline',
      h('h2.fs-3', 'Baseline'),
      h('p.fs-2', '10 questions under test rules, about 12 minutes. It is the difference between a Readiness that is a guess and one that means something.'),
      h('div.ob-nav',
        h('a.btn.btn-primary', { href: '#/run/baseline', onclick: onBaseline }, 'Take the Baseline'),
        h('a.btn.btn-ghost', { href: '#/today', onclick: onToday }, 'Not now — start a page'),
      ),
    ),
  ));
}

/* ------------------------------------------------------------------ the screen */

/** `screens['/onboard']` — (params, query, ctx) => (el) => cleanup */
export function mountOnboard(params, query) {
  return (el) => {
    let cleanupInner = null;
    let seq = null;
    let alive = true;
    const results = {};          // clusterKey → { outcome, skills, module }

    const startStep = (() => {
      const q = Number(query?.get?.('step'));
      if (Number.isInteger(q) && q >= 1 && q <= 4) return q;
      return getState().placement?.done ? 4 : 1;
    })();

    function teardown() {
      if (cleanupInner) { try { cleanupInner(); } catch { /* gone */ } cleanupInner = null; }
      if (seq) { try { seq.destroy(); } catch { /* gone */ } seq = null; }
      el.replaceChildren();
    }

    function show(step) {
      if (!alive) return;
      teardown();
      const save = getState();
      const D = daysUntilTest(save.settings?.testDate);
      const rd = readiness(save);
      setHeader({ readiness: rd.r, provisional: rd.provisional });
      try { history.replaceState(null, '', `#/onboard${step > 1 ? `?step=${step}` : ''}`); } catch { /* ignore */ }
      window.scrollTo(0, 0);

      if (step === 1) return setupScreen(el, { save, onNext: () => show(2), onSkip: () => show(2) });
      if (step === 2) { cleanupInner = howScreen(el, { onNext: () => show(3), onSkip: () => show(3) }); return; }
      if (step === 4) return placementSummary(el, save, {
        onBaseline: () => { /* the link navigates */ },
        onToday: () => { /* the link navigates */ },
      });

      // step 3
      if (!T || !C) { el.append(h('section.screen.ob-step', h('p.muted', 'Loading the placement…'))); Promise.all([loadT(), loadC()]).then(() => { if (alive) show(3); }); return; }
      placementIntro(el, {
        save, D,
        onStart: () => runPlacement(D),
        onZero: () => {
          update(s => { s.placement = { done: true, at: Date.now(), answered: 0, total: placementSize(D), skipped: placementSize(D), placed: [], results: {} }; });
          navigate('/today');
        },
      });
    }

    function runPlacement(D) {
      teardown();
      window.scrollTo(0, 0);   // home r1: "Start · 8 problems" sits below the fold — item 1 must not inherit that scroll
      const save = getState();
      const items = placementItems(save, { D });
      const total = items.length;
      seq = createSequence(el, {
        title: 'Placement',
        sub: 'No hints. Answer what you can.',
        back: '/onboard',
        skipAfter: Math.min(SKIP_AFTER, total),
        cardOpts: { hints: false, back: '/onboard' },
        quitLabel: 'Start from zero',
        onQuit: () => {
          const now = Date.now();
          update(s => { applyPlacement(s, results, { now, total, skipped: total - Object.keys(results).length }); });
          show(4);
        },
        items: items.map(it => ({ key: it.key, label: it.label, blurb: it.blurb, source: it.source, params: it.params })),
        onItem: (rec) => {
          const cluster = PLACEMENT_CLUSTERS.find(c => c.key === rec.key);
          if (!cluster) return;
          const sk = skillsOf(cluster, getState());
          results[rec.key] = { outcome: rec.outcome, skills: sk.slice(), module: cluster.module };
        },
        onFinish: ({ answered, skipped }) => {
          const now = Date.now();
          update(s => { applyPlacement(s, results, { now, total, skipped }); });
          bus.emit('placement:done', { answered, skipped, total });
          show(4);
        },
      });
    }

    show(startStep);
    return () => { alive = false; teardown(); };
  };
}

/* ------------------------------------------------------------------ JUMP HERE (#/run/jump/:module) */

/** Deterministic 10-item pool for a module's JUMP run: its templates round-robin, else its originals. */
export function jumpItems(save, moduleId, { count = JUMP_ITEMS } = {}) {
  const mod = moduleById[moduleId];
  if (!mod) return [];
  const p6 = profile6(save);
  const tpl = (mod.templates ?? []).filter(id => T?.getTemplate?.(id));
  const out = [];
  if (tpl.length) {
    for (let n = 0; n < count; n++) {
      const id = tpl[n % tpl.length];
      out.push({ key: `${id}#${n}`, source: { template: id, seed: `${p6}-jump-${moduleId}-${n}` }, label: T.getTemplate(id)?.label ?? id });
    }
    return out;
  }
  // No generator (M9): the module's own originals, spread deterministically across the set.
  const ids = (mod.originals ?? []).filter(id => C?.byId?.[id]);
  if (!ids.length) return [];
  const start = cyrb53(`${p6}|jump|${moduleId}`) % ids.length;
  for (let n = 0; n < Math.min(count, ids.length); n++) {
    const id = ids[(start + n * 7) % ids.length];
    out.push({ key: id, source: { id }, label: `Statement ${id.slice(-2)}` });
  }
  return out;
}

/** `#/run/jump/:module` — 10 items, ≥ 8/10 marks the module placed (S1 "JUMP HERE"). */
export function mountJump(params, query) {
  const moduleId = String(params?.id ?? '').toUpperCase();
  return (el) => {
    let seq = null, alive = true;
    const teardown = () => { if (seq) { try { seq.destroy(); } catch { /* gone */ } seq = null; } el.replaceChildren(); };

    function start() {
      teardown();
      const save = getState();
      const mod = moduleById[moduleId];
      if (!mod) {
        el.append(h('section.screen.ob-step', h('h1', 'No such module'), h('p.muted.mono', moduleId), h('p', h('a.btn', { href: '#/binder' }, 'Binder'))));
        return;
      }
      const items = jumpItems(save, moduleId);
      if (!items.length) {
        el.append(h('section.screen.ob-step', h('h1', `JUMP · ${mod.name}`), h('p.muted', 'This module has nothing to jump — it is generated on demand.'), h('p', h('a.btn', { href: '#/binder' }, 'Binder'))));
        return;
      }
      let correct = 0;
      const skills = new Set(mod.skills ?? []);
      seq = createSequence(el, {
        title: `JUMP · ${mod.name}`,
        sub: `${JUMP_PASS} of ${items.length} and the plan stops scheduling this module as new.`,
        back: '/binder',
        cardOpts: { hints: false, back: '/binder' },
        quitLabel: 'Stop',
        onQuit: () => navigate('/binder'),
        items,
        onItem: (rec) => { if (rec.outcome === 'clean' || rec.outcome === 'retry') { if (rec.result?.firstTry) correct++; } },
        onFinish: ({ answered }) => {
          const now = Date.now();
          let res;
          update(s => { res = applyJump(s, moduleId, { correct, total: items.length, skills: [...skills], now }); });
          teardown();
          const rd = readiness(getState());
          el.append(h('section.screen.ob-step',
            h('p.ob-eyebrow.muted.fs-1', `JUMP · ${mod.name}`),
            h('h1', res.passed ? 'Placed.' : `${correct} of ${items.length} first try`),
            h('p', res.passed
              ? `${correct} of ${items.length} first try. ${mod.name} stops being scheduled as new — it still comes back as reviews, in BLITZ and in the Upgrade run.`
              : `${JUMP_PASS} of ${items.length} places a module. Nothing is lost — the plan will bring these back, starting today.`),
            h('p.muted.fs-1', `Answered ${answered} · Readiness ${rd.r}${rd.provisional ? ' (provisional)' : ''}`),
            h('div.ob-nav',
              h('a.btn.btn-primary', { href: '#/today' }, 'Today'),
              h('a.btn', { href: '#/binder' }, 'Binder'),
            )));
        },
      });
    }

    if (!T || !C) {
      el.append(h('section.screen.ob-step', h('p.muted', 'Loading…')));
      Promise.all([loadT(), loadC()]).then(() => { if (alive) start(); });
    } else start();
    return () => { alive = false; teardown(); };
  };
}

export default mountOnboard;
