// report.js — the Mock / Baseline report (COMPOSED S7 "Mock" → "Report", S8 #13).
//
//   #/mock/report/:n      n = the index of the run in `save.runs` (what mock.js navigates to); an
//                         ordinal ("the 2nd Mock") is accepted too, so a typed or shared link works.
//
// What S7 asks for, in order: score /100 · the calibration line (`predicted 88 → scored 81
// (overconfident by 7)`) · a per-skill table · every item expandable with **your scratch beside the
// worked solution** and the source card ("this was WP-11 with new numbers") · ⚑ where relevant ·
// "Drill what I missed" sorted by `w × (1 − m)` · "RUN THE MISSES" (5-item page: the missed seeds plus
// 3 siblings) · "RETRY SAME SEED" (never PB-eligible).
//
// The report is a pure read of the run record plus the card / generator the item came from — grading
// already happened at submit (mock.js `submitRun`), so nothing here writes a score.

import { navigate, softWrap } from '../app.js';
import { getState, flush } from '../store.js';
import { h } from '../widgets/base.js';
import { mathfmt } from '../mathfmt.js';
import { numbering } from '../../data/sheets.js';
import { getCard } from '../../data/cards.js';
import { getFigure } from '../../data/figures.js';
import { readiness, BANDS } from '../readiness.js';
import { POINTS_PER_ITEM, SECTION_NAME, itemFor, kindOf } from '../../data/blueprint.js';
import { createCardView } from './card.js';
import {
  calibration, elapsedMs, fmtSpan, isMockRun, missRows, perSkill, planOf, runKind, mods,
} from './mock.js';

/** r1: what the report calls each part of your answer when the item gives the part no label of its own. */
export const PART_LABEL = {
  cloze: 'Your blanks', mc: 'Your pick', build: 'Your notation', notation: 'Your notation', pairs: 'Your pairs',
  cls: 'Your classification', classify: 'Your classification', asn: 'Your verdict', verdict: 'Your verdict',
  equation: 'Your equation', setup: 'Your equation', roots: 'Your roots', reject: 'Keep / reject', keep: 'Keep / reject',
  cases: 'Your cases', explain: 'Your explanation', strip: 'Your steps', factored: 'Your factoring',
  multi: 'Your answers', ratio: 'Your ratio', num: 'Your answer', term: 'Your answer', default: 'Your answer',
};

/* ------------------------------------------------------------------ lookup (pure) */

/**
 * Find the run a `#/mock/report/:n` link means: the runs index first (mock.js writes that), then the
 * Mock ordinal (`no`), then the newest finished Mock-like run.
 */
export function findRun(save, n) {
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  const i = Number(n);
  if (Number.isInteger(i) && isMockRun(runs[i])) return { n: i, run: runs[i] };
  if (Number.isFinite(i)) {
    const byNo = runs.findIndex(r => isMockRun(r) && r.no === i && r.status === 'done');
    if (byNo >= 0) return { n: byNo, run: runs[byNo] };
  }
  for (let k = runs.length - 1; k >= 0; k--) if (isMockRun(runs[k]) && runs[k].status === 'done') return { n: k, run: runs[k] };
  return null;
}

/** The band label for a 0–100 score (the Readiness bands, reused so one vocabulary covers both). */
export function bandOf(score) {
  return BANDS.find(b => score >= b.min) || BANDS[BANDS.length - 1];
}

/** "this was WP-11 with new numbers" / "this was ang-10" — the S7 source line. */
export function sourceLine(item) {
  if (item.source === 'card' && item.cardId) {
    const card = getCard(item.cardId);
    // The teacher's numbering carries its own punctuation — "18." on the ASN sheet, "10)" on the
    // angle sheets — which is right on the card's own chip and wrong inside a sentence: it printed
    // "This was ASN 18. from the packet." (fix:B5, seen while reading the report screenshots).
    const no = numbering(item.cardId).replace(/[.)]+$/, '');
    const sheet = card?.sheet ? `${card.sheet}${no ? ` ${no}` : ''}` : item.cardId;
    return { text: `This was ${sheet} from the packet.`, href: `#/card/${item.cardId}`, label: 'Open the card' };
  }
  if (item.template) {
    const forCard = item.forCard || null;
    return {
      text: forCard ? `This was ${forCard.toUpperCase()} with new numbers.` : 'A generated Variant — same shape, new numbers.',
      href: `#/variant/${item.template}?seed=${encodeURIComponent(item.seed ?? '')}`,
      label: 'Play it again',
    };
  }
  return { text: '', href: null, label: '' };
}

/* ------------------------------------------------------------------ the screen */

/** `screens['/mock/report/:n']` */
export function mountReport(params = {}, query = null) {
  return (el) => {
    const view = createReportView(el, { n: params.n, query });
    return () => view.destroy();
  };
}

export function createReportView(host, opts = {}) {
  const root = h('section.screen.report-screen', { 'aria-busy': 'true' });
  host.append(root);
  const st = { destroyed: false, n: null, run: null, M: null, inline: null };
  const listeners = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); listeners.push(() => el.removeEventListener(ev, fn)); };

  init();

  async function init() {
    const save = getState();
    const found = findRun(save, opts.n);
    if (!found) { renderMissing(); return; }
    st.n = found.n;
    st.run = found.run;
    if (st.run.status !== 'done') { navigate('/mock', { replace: true }); return; }
    st.M = await mods();
    if (st.destroyed) return;
    render();
  }

  function renderMissing() {
    root.replaceChildren(h('div.card.report-empty',
      h('h1.fs-4', 'No report here yet'),
      h('p.muted', 'That Mock has not been taken on this device.'),
      h('p', h('a.btn.btn-primary', { href: '#/mock' }, 'Take a Mock'), ' ', h('a.btn', { href: '#/today' }, 'Today'))));
    root.setAttribute('aria-busy', 'false');
  }

  function render() {
    const run = st.run;
    const spec = kindOf(runKind(run));
    const save = getState();
    const cal = calibration(run);
    const band = bandOf(run.score);
    const rows = perSkill(run);
    const misses = missRows(save, run);
    const correct = run.items.filter(i => i.credit >= 1).length;

    root.replaceChildren();
    root.dataset.band = band.key;

    /* ---- head + score ---- */
    const head = h('header.report-head',
      h('a.btn.btn-ghost.report-back', { href: '#/today' }, '← Today'),
      h('span.chip.mono', run.retry ? 'RETRY' : `${spec.label} #${run.no}`));
    const score = h('div.report-score',
      h('div.report-num',
        h('span.report-n.mono', String(run.score)),
        h('span.report-of.muted', '/ 100')),
      h('div.report-side',
        // "on this paper" keeps the score's band word from reading as the Readiness band two lines below
        h('p.report-band', `${band.label} on this paper`),
        h('p.report-line.muted.fs-1',
          `${correct} of ${run.n} items clean · ${Math.round(run.points * 10) / 10} of ${run.pointsMax} points · ${fmtSpan(elapsedMs(run))}`),
        run.auto ? h('p.report-line.muted.fs-1', 'The clock ran out — this is what was on the paper at 0:00.') : null,
        spec.mini ? h('p.report-line.muted.fs-1', 'A mini-mock counts into Readiness at ×0.8 (S4).') : null));

    const calEl = cal
      ? h('p.report-cal', { dataset: { d: cal.delta === 0 ? 'even' : cal.delta < 0 ? 'over' : 'under' } },
          h('span.report-cal-t', `predicted ${cal.pred}`), h('span.report-cal-a', ' → '),
          h('span.report-cal-t', `scored ${cal.score}`), h('span.report-cal-w', ` (${cal.word})`))
      : h('p.report-cal.muted.fs-1', 'No prediction was made for this one.');

    const xp = run.xp > 0
      ? h('p.report-xp', h('strong.mono', `+${run.xp} XP`), h('span.muted.fs-1',
          ` · ${run.xpInfo.submit} submitted + ${run.xpInfo.acc} accuracy${run.xpInfo.pb ? ` + ${run.xpInfo.pb} personal best` : ''}`))
      : h('p.report-xp.muted.fs-1', run.xpInfo?.reason ? `No XP — ${run.xpInfo.reason}.` : 'No XP for this run.');

    root.append(head, h('div.card.report-hero', score, calEl, xp, readinessLine(save)));

    /* ---- actions ---- */
    const actions = h('div.report-actions');
    const drill = h('button.btn.btn-primary', { type: 'button' }, 'Drill what I missed');
    on(drill, 'click', () => startDrill(misses));
    const runMisses = h('button.btn', { type: 'button' }, 'RUN THE MISSES');
    on(runMisses, 'click', () => startMisses());
    const retry = h('button.btn', { type: 'button' }, 'RETRY SAME SEED');
    on(retry, 'click', () => navigate('/mock', { query: { replay: String(st.n) } }));
    if (misses.length) actions.append(drill, runMisses);
    else actions.append(h('p.report-clean', 'Nothing missed. Take the win.'));
    actions.append(retry);
    root.append(actions);

    /* ---- per-skill table ---- */
    // Three columns, not four: at 375 px a fourth numeric column forces "Always/Sometimes/Never" to
    // break mid-word, so the item count rides under the skill name instead.
    const table = h('table.report-skills');
    table.append(h('caption.report-h', 'By skill'));
    table.append(h('thead', h('tr', h('th', { scope: 'col' }, 'Skill'), h('th.report-col-p', { scope: 'col' }, 'Points'), h('th', { scope: 'col' }, '%'))));
    const tb = h('tbody');
    for (const r of rows) {
      tb.append(h('tr', { dataset: { s: r.pct >= 100 ? 'ok' : r.pct >= 50 ? 'part' : 'bad' } },
        h('th', { scope: 'row' }, h('span.report-sk-n', ...softWrap(r.name)), h('span.report-sk-i.muted.fs-1', `${r.items} item${r.items === 1 ? '' : 's'}`)),
        h('td.mono.report-col-p', `${r.points} / ${r.max}`),
        h('td.report-pct', h('span.report-pct-in', h('span.report-bar', { style: `--p:${r.pct}%` }), h('span.mono', `${r.pct}%`)))));
    }
    table.append(tb);
    root.append(h('div.card.report-card', h('div.table-wrap', table)));

    /* ---- the paper ---- */
    const list = h('ol.report-items');
    let sec = null;
    for (const item of run.items) {
      if (item.section !== sec) {
        sec = item.section;
        list.append(h('li.report-sec', h('span.mono', sec), ' ', item.sectionName || SECTION_NAME[sec] || ''));
      }
      list.append(renderItem(item));
    }
    root.append(h('div.card.report-card', h('h2.report-h', 'Every question'), list));
    root.setAttribute('aria-busy', 'false');
  }

  function readinessLine(save) {
    let r = null;
    try { r = readiness(save); } catch { r = null; }
    if (!r) return null;
    return h('p.report-readiness.muted.fs-1',
      `Readiness is now `, h('strong.mono', String(r.r)), ` — ${r.band.label}`,
      r.provisional ? ' (still provisional)' : ' · this paper now counts as your Mock score');   // r2: "locked by this paper" read as locked-out
  }

  /* ---- one item, expandable ---- */

  function renderItem(item) {
    const okState = item.credit >= 1 ? 'ok' : item.credit > 0 ? 'part' : 'bad';
    const pts = Math.round(item.credit * POINTS_PER_ITEM * 10) / 10;
    const li = h('li.report-item', { dataset: { s: okState } });
    const btn = h('button.report-item-h', { type: 'button', 'aria-expanded': 'false' },
      h('span.report-item-n.mono', String(item.n)),
      h('span.report-item-t', item.label || item.sectionName),
      item.flagged ? h('span.report-flag', { title: 'You flagged this' }, '⚑') : null,
      h('span.report-item-p.mono', `${pts} / ${POINTS_PER_ITEM}`),
      h('span.report-item-c', { 'aria-hidden': 'true' }, okState === 'ok' ? '✓' : okState === 'part' ? '±' : '✗'));
    const bodyEl = h('div.report-item-b', { hidden: true });
    li.append(btn, bodyEl);
    on(btn, 'click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      bodyEl.hidden = open;
      if (!open && !bodyEl.dataset.built) { buildItemBody(bodyEl, item); bodyEl.dataset.built = '1'; }
    });
    return li;
  }

  function buildItemBody(box, item) {
    let built = null;
    try { built = itemFor(planOf(item), st.M.T.generate); } catch { built = null; }
    if (!built) { box.append(h('p.muted', 'This question could not be rebuilt.')); return; }
    const raw = built.raw;

    box.append(h('p.report-stem', { html: mathfmt(String(raw.stem ?? raw.prompt ?? '')) }));
    const fig = figureFor(raw);
    if (fig) box.append(h('div.report-fig', fig));

    /* your answer, part by part */
    const ans = h('dl.report-answers');
    const partsList = item.parts || [];
    for (const p of partsList) {
      const mine = item.raw?.[p.id];
      // r1: most parts carry no author label — never show the internal id ('cloze', 'mc', 'xy'…) on the one
      // screen meant to teach. A single-part item needs no label at all.
      const built0 = built.parts.find(x => x.id === p.id);
      const label = built0?.label || PART_LABEL[p.type || built0?.type] || (partsList.length > 1 ? PART_LABEL.default : '');
      ans.append(
        label || p.share ? h('dt.report-a-k', label, p.share ? h('span.muted.fs-1', ' · 40 % of this question (the setup)') : null) : null,
        h('dd.report-a-v', { dataset: { s: p.credit >= 1 ? 'ok' : p.credit > 0 ? 'part' : 'bad' } },
          p.kind === 'blank'
            ? h('span.muted.fs-1', 'left blank')
            : h('span.mono.report-a-raw', showRaw(mine))));
    }
    box.append(ans);

    /* scratch BESIDE the worked solution (S7) */
    const sol = h('ol.report-solution');
    for (const step of raw.solution || []) {
      sol.append(h('li.report-step', h('span.report-step-s', String(step.say ?? '')), step.math ? h('span.report-step-m', { html: mathfmt(String(step.math)) }) : null));
    }
    if (!(raw.solution || []).length) sol.append(h('li.report-step.muted', 'No written solution for this one.'));
    box.append(h('div.report-split',
      h('div.report-scratch',
        h('h3.report-sub', 'Your scratch'),
        item.work ? h('pre.report-work', String(item.work)) : h('p.muted.fs-1', 'Nothing written here.')),
      h('div.report-worked',
        h('h3.report-sub', 'Worked solution'),
        sol)));

    const src = sourceLine({ ...item, forCard: built.raw.forCard ?? (built.raw.forCards || [])[0] ?? null });
    if (src.text) {
      // "Open the card" / "Play it again" is a navigation ACTION, not prose: as a bare inline <a> it
      // measured 86 x 16 — a third of a 44 px tap target on the one screen you read on a phone with
      // a thumb (fix:B5 #15). It is an outlined `.btn` chip now (44 px from --tap), on a row that
      // wraps it under the sentence when the report column is narrow.
      const line = h('p.report-src.muted.fs-1', src.text);
      box.append(src.href
        ? h('div.report-srcrow', line, h('a.btn.report-src-a', { href: src.href }, src.label))
        : line);
    }
  }

  function figureFor(raw) {
    const f = raw?.figure;
    if (!f) return null;
    try {
      if (f.spec) return st.M.SVG.element(f.spec, f);
      const fig = getFigure(f.id);
      return fig ? st.M.SVG.element(fig, f) : null;
    } catch { return null; }
  }

  function showRaw(v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(showRaw).join(' · ');
    if (typeof v === 'object') return Object.entries(v).filter(([, x]) => x != null && x !== '').map(([k, x]) => `${k}: ${showRaw(x)}`).join(' · ') || '—';
    return String(v);
  }

  /* ------------------------------------------------------------ the two follow-up runs */

  /**
   * "Drill what I missed" — the weakest missed skill first (S7 `w × (1 − m/100)`). T16's `#/run/drill/:skill`
   * is the canonical 5-Variant drill, so this hands over to it and marks the day's misses as drilled.
   */
  function startDrill(misses) {
    if (!misses.length) return;
    // W4 integration (notes/T13.md open issue 1, notes/T16.md): `daily.missesDrilled` is now written by
    // run.js when the drill actually FINISHES, not when this button is tapped. Tapping and walking away
    // must not satisfy S4's "a Mock completed ∧ its misses drilled".
    flush();
    navigate(`/run/drill/${misses[0].id}`);
  }

  /**
   * "RUN THE MISSES" — S7's 5-item page: the missed items at their own seeds, plus siblings of the same
   * template so the shape returns with new numbers. It runs inline on the report through T09's embeddable
   * card view (hints on, XP and mastery written the normal way).
   */
  function startMisses() {
    const run = st.run;
    const missed = run.items.filter(i => i.credit < 1);
    if (!missed.length) return;
    const seeds = [];
    for (const item of missed.slice(0, 5)) {
      if (item.source === 'card' && item.cardId) seeds.push({ id: item.cardId, label: `#${item.n}` });
      else if (item.template) seeds.push({ template: item.template, seed: item.seed, params: item.params, label: `#${item.n}` });
    }
    const siblings = [];
    for (const item of missed) {
      if (siblings.length >= 3 || seeds.length + siblings.length >= 5) break;
      const tpl = item.template || firstTemplateFor(item.cardId);
      if (!tpl) continue;
      siblings.push({ template: tpl, seed: `${run.seed}|miss${item.n}|sib`, params: item.params, label: 'new numbers', forCard: item.cardId });
    }
    runInline([...seeds, ...siblings].slice(0, 5), 'Run the misses');
  }

  function firstTemplateFor(cardId) {
    if (!cardId) return null;
    try { return st.M.T.templatesForCard(cardId)[0] ?? null; } catch { return null; }
  }

  /** A tiny inline run: one card at a time through `createCardView`, then back to the report. */
  function runInline(plans, title) {
    if (!plans.length) return;
    const prev = [...root.childNodes];
    const wrap = h('div.report-inline');
    const head = h('header.report-inline-h',
      h('h2.report-inline-t', title),
      h('span.report-inline-n.mono', `1 / ${plans.length}`),
      h('button.btn.btn-ghost.report-inline-b', { type: 'button' }, '← Report'));
    const stage = h('div.report-inline-stage');
    wrap.append(head, stage);
    root.replaceChildren(wrap);
    let i = 0;
    let view = null;

    const back = () => {
      if (view) { try { view.destroy(); } catch { /* gone */ } view = null; }
      st.inline = null;
      root.replaceChildren(...prev);
    };
    head.querySelector('.report-inline-b').addEventListener('click', back);
    st.inline = { back };

    const mountOne = () => {
      if (view) { try { view.destroy(); } catch { /* gone */ } }
      stage.replaceChildren();
      const p = plans[i];
      head.querySelector('.report-inline-n').textContent = `${i + 1} / ${plans.length}`;
      const source = p.id ? { id: p.id } : { template: p.template, seed: p.seed };
      view = createCardView(stage, source, {
        kind: p.id ? 'card' : 'variant', forCard: p.forCard ?? null, rematch: true, back: '/today',
        onContinue: () => { i++; if (i >= plans.length) back(); else mountOne(); },
      });
    };
    mountOne();
  }

  function destroy() {
    st.destroyed = true;
    if (st.inline) { try { st.inline.back(); } catch { /* gone */ } }
    for (const off of listeners) off();
    root.remove();
  }

  return { el: root, destroy, state: st };
}

export default mountReport;
