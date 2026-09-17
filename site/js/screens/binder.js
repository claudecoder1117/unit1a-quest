// screens/binder.js — #/binder, "The Binder is the packet" (COMPOSED S1 screens, S2 sheets, S4 rarity,
// S5 tiles, S9 #8).
//
// One tab per sheet of `data/sheets.js`, in sheet order, tiles in the teacher's numbering. A tile is a
// rarity tile (Bronze / Silver / Gold / Platinum + foil overlay), outlined when its module was placed by
// JUMP, and carrying the Foil rule for its class as its tooltip (S4: "the rule is printed verbatim in
// each tile's tooltip"). Tap opens the original (the Original Set is the tab itself, in sheet order);
// press-and-hold — or right-click, or `i` / Alt+Enter from the keyboard — opens the tile sheet with the
// Foil path, the progress toward it, this card's history and the Infinite link (#/variant/<template>).
//
// The Binder cover changes at 50 % cleared / 100 % cleared / Platinum (S1). The fill % printed on the
// cover is `trophies.coverage(save)`, which is the same number Readiness uses for `C` (S4) — one
// function so the two can never disagree.
//
// Weight: only small data modules are imported eagerly. `data/cards.js` (≈ 230 KB of stems) and
// `data/templates.js` (the generator graph) are fetched lazily at mount, so putting the Binder in the
// screen registry costs the first paint of #/today nothing.

import { h, navigate, setHeader } from '../app.js';
import { getState, subscribe } from '../store.js';
import { readiness, isCleared } from '../readiness.js';
import { mathfmt, stripMarkup } from '../mathfmt.js';
import { sheets, sheetById, numbering } from '../../data/sheets.js';
import { moduleOf, moduleById, familyById, bosses } from '../../data/modules.js';
import { bossReady } from '../page.js';   // W4 integration (notes/T12.md / T16.md Requests → T11)
import { tileRarity, familyRarity, foilRule, foilProgress, foilClass, generatorOf, familyTemplates, FAMILY_PLATINUM_GOLD, FAMILY_PLATINUM_DAYS } from '../rarity.js';
import { coverage, rarityHistogram, sheetOriginals } from '../trophies.js';

/* ------------------------------------------------------------------ lazy data */

let cardsMod = null;
let templatesMod = null;
function loadCards() {
  if (cardsMod) return Promise.resolve(cardsMod);
  return import('../../data/cards.js').then(m => (cardsMod = m)).catch(() => null);
}
function loadTemplates() {
  if (templatesMod) return Promise.resolve(templatesMod);
  return import('../../data/templates.js').then(m => (templatesMod = m)).catch(() => null);
}

/* ------------------------------------------------------------------ small helpers */

const NON_BONUS = sheets.filter(s => !s.bonus);
const RARITY_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

/** The label a group of same-prefix ids gets inside a tab (the packet's own section names). */
const GROUP_LABEL = {
  voc: 'Terms (§0)', not: 'Notation', def: 'Definitions', fact: 'Facts', cls: 'Classify',
  'ang-wu': 'Warm-up', ang: 'Problems', doc: 'Study guide', wp: 'Word problems',
  asn: 'Statements', qz: 'Quizlet', fac: 'Factoring', quad: 'Solve by factoring', fam: 'Family tiles',
  bonus: 'Bonus',
};
const prefixOf = (id) => (id.startsWith('ang-wu') ? 'ang-wu' : id.split('-')[0]);

/** Split a tab's ids into consecutive same-prefix runs; one run means no headings are drawn. */
function groupIds(ids) {
  const out = [];
  for (const id of ids) {
    const p = prefixOf(id);
    if (!out.length || out[out.length - 1].prefix !== p) out.push({ prefix: p, label: GROUP_LABEL[p] ?? p, ids: [] });
    out[out.length - 1].ids.push(id);
  }
  return out;
}

const isFamily = (id) => id.startsWith('fam-');

/**
 * What a tile says about itself in one line (list rows, the tile sheet). For the term / definition /
 * fact cards the stem is a constant ("Vocabulary — §0 term 1 of 23.") and the information is in `src`
 * ("§0 term 1 of 23: point"), so the row shows the term; the packet's repeated instruction prefixes are
 * dropped so the row carries what differs. Mini-markup stays in — render it with `mathfmt`.
 */
const ROW_PREFIXES = [
  /^Given the following diagram[^:]*:\s*/i,
  /^In the following diagram,\s*/i,
  /^Solve by factoring:\s*/i,
  /^Factor each completely\.\s*/i,
  /^Complete the definition\.\s*/i,
];
export function tileText(card, id) {
  if (!card) return id;
  const src = String(card.src ?? '');
  if (/^(voc|def|fact)-/.test(id) && /:\s*\S/.test(src)) return src.replace(/^[^:]*:\s*/, '');
  let t = String(card.stem ?? '').replace(/\s+/g, ' ').trim();
  for (const re of ROW_PREFIXES) t = t.replace(re, '');
  return t || src || id;
}

/** A module the plan can still place: JUMP HERE means nothing on a module already cleared through. */
function moduleOpen(save, moduleId) {
  const m = moduleById[moduleId];
  if (!m) return false;
  return (m.originals ?? []).some(cid => !isCleared(save?.cards?.[cid]));
}

/** Everything a tile needs, from the save alone. */
function tileInfo(save, id) {
  const fam = isFamily(id);
  const rec = (save.cards && save.cards[id]) || null;
  const vrec = (save.variants && save.variants[id]) || null;
  const rarity = fam ? familyRarity(vrec) : tileRarity(id, rec);
  const prog = fam
    ? { cls: 'family', have: Math.min(FAMILY_PLATINUM_GOLD, Math.max(0, vrec?.clearsGold ?? 0)), need: FAMILY_PLATINUM_GOLD, days: new Set(vrec?.goldDays ?? []).size, done: rarity === 'platinum' }
    : foilProgress(id, rec?.foilProgress);
  const mod = moduleOf(id);
  const placed = !fam && (rec?.placed === true || (mod && save.jumps && save.jumps[mod] === true));
  return {
    id, fam, rec, rarity,
    foil: rarity === 'platinum' || prog.done,
    prog,
    placed: !!placed,
    attempts: rec?.attempts ?? 0,
    cleared: !!rarity,
    cls: fam ? 'family' : foilClass(id),
    rule: foilRule(id),
    num: fam ? '◆' : (numbering(id) || id),
    module: mod,
  };
}

/**
 * Cover state (S1: the cover changes at 50 % / 100 % cleared / Platinum).
 * The strip counts the 164 originals only, so its total is the same number the fill line prints;
 * the gold cover still needs the four family tiles Platinum too, which `platinum` checks separately.
 */
function coverState(save) {
  const cov = coverage(save);
  const hist = rarityHistogram(save, { families: false });
  const fam = rarityHistogram(save, { families: true });
  const platinum = fam.none === 0 && fam.bronze === 0 && fam.silver === 0 && fam.gold === 0;
  const state = platinum ? 'platinum' : cov.frac >= 1 ? 'full' : cov.frac >= 0.5 ? 'half' : 'start';
  return { ...cov, hist, state };
}
const COVER_NAME = { start: 'Plain', half: 'Half-filled', full: 'Complete', platinum: 'Gold' };
const COVER_NEXT = {
  start: 'The cover changes at 50 % cleared.',
  half: 'The cover changes again at 100 % cleared.',
  full: 'Gold cover: take every tile to Platinum.',
  platinum: 'Gold cover earned — the whole packet is Platinum.',
};

/**
 * The Infinite template(s) behind a tile — what `#/variant/<template>` is opened with.
 * With `data/templates.js` loaded this is the registry's own answer (`templatesForCard`, which reads
 * each generator's `forCards`); before it lands, `rarity.js` gives the same answer for class (a) and
 * the family list for class (b) without pulling the generator graph in. Class (c) has none, except
 * the `voc-` and `def-` cards, which M1's `T-vocab` Infinite set covers.
 */
function infiniteTemplates(id) {
  if (isFamily(id)) { const f = familyById[id]; return f ? [f.template] : []; }
  const fromRegistry = templatesMod ? templatesMod.templatesForCard(id) : [];
  if (fromRegistry.length) return fromRegistry;
  if (!templatesMod) {
    const g = generatorOf(id);
    if (g) return [g];
    const fam = familyTemplates(id);
    if (fam.length) return fam.slice(0, 1);
  }
  if ((id.startsWith('voc-') || id.startsWith('def-')) && moduleOf(id) === 'M1') return ['T-vocab'];
  return [];
}

function templateLabel(tid) {
  return templatesMod?.getTemplate?.(tid)?.label ?? tid;
}

const fmtDay = (ms) => {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtSecs = (ms) => (Number.isFinite(ms) && ms > 0 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s` : '');

/* ------------------------------------------------------------------ screen state (survives a remount) */

const ui = { sheet: null, view: 'grid' };

function defaultSheet(save) {
  for (const s of NON_BONUS) {
    const ids = sheetOriginals(s.id);
    if (ids.some(id => !tileInfo(save, id).cleared)) return s.id;
  }
  return NON_BONUS[0].id;
}

/* ------------------------------------------------------------------ mount */

export function mountBinder(params, query) {
  const qSheet = query?.get?.('sheet');
  const qView = query?.get?.('view');
  if (qSheet && sheetById[qSheet]) ui.sheet = qSheet;
  if (qView === 'list' || qView === 'grid') ui.view = qView;

  return (root) => {
    const save0 = getState();
    if (!ui.sheet || !sheetById[ui.sheet]) ui.sheet = defaultSheet(save0);

    const screen = h('section.screen.binder', { 'aria-labelledby': 'bnd-title' });
    root.append(screen);

    let pop = null;                       // the open tile sheet
    let popFor = null;                    // the element it belongs to

    /* ---- tile sheet (long-press / right-click / keyboard) ---- */
    function closePop({ refocus = false } = {}) {
      if (!pop) return;
      pop.remove();
      const owner = popFor;
      pop = null; popFor = null;
      document.removeEventListener('keydown', onPopKey, true);
      document.removeEventListener('pointerdown', onPopOutside, true);
      window.removeEventListener('resize', onPopDismiss);
      window.removeEventListener('scroll', onPopDismiss, true);
      if (refocus && owner && owner.isConnected) owner.focus();
    }
    const onPopKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop({ refocus: true }); } };
    const onPopOutside = (e) => { if (pop && !pop.contains(e.target) && e.target !== popFor) closePop(); };
    const onPopDismiss = () => closePop();

    /** The bosses this module belongs to that are ready to fight right now (W4 integration). */
    function readyBossesFor(moduleId) {
      const ready = new Set(bossReady(getState()).map(b => b.id));
      return bosses.filter(b => ready.has(b.id) && (b.modules ?? []).includes(moduleId));
    }

    function openPop(anchor, id) {
      closePop();
      const save = getState();
      const t = tileInfo(save, id);
      const card = cardsMod?.byId?.[id] ?? null;
      const famDef = t.fam ? familyById[id] : null;
      const tmpl = infiniteTemplates(id);

      const title = t.fam ? (famDef?.name ?? id) : `${numbering(id) || ''} ${card?.src ?? id}`.trim();
      const hist = Array.isArray(t.rec?.history) ? t.rec.history.slice(-6).reverse() : [];

      const body = h('div.bnd-pop', { role: 'dialog', 'aria-label': `${title} — tile details`, tabindex: '-1' },
        h('div.bnd-pop-head',
          h('span.tile-chip', { dataset: { rarity: t.rarity ?? 'none' } }, t.rarity ? RARITY_LABEL[t.rarity] : 'Not cleared'),
          h('span.bnd-pop-title', title),
          h('button.icon-btn.bnd-pop-x', { type: 'button', 'aria-label': 'Close', onclick: () => closePop({ refocus: true }) }, '✕'),
        ),
        card?.stem ? h('p.bnd-pop-stem.muted', { html: mathfmt(String(card.stem)) }) : null,   // real notation (S9 #3); clamped by CSS, never cut inside a token
        h('p.bnd-pop-rule', t.rule),
        t.cls === 'family'
          ? h('p.bnd-pop-prog.mono', `${t.prog.have} / ${FAMILY_PLATINUM_GOLD} Gold Variants · ${t.prog.days} of ${FAMILY_PLATINUM_DAYS} days`)
          : t.prog.need
            ? h('p.bnd-pop-prog.mono', `Foil ${t.prog.have} / ${t.prog.need}`
              + (t.cls === 'b' ? ` (${t.prog.variants} Variants · ${t.prog.reviewDays} review days)` : ''))
            : null,
        t.placed ? h('p.bnd-pop-note.muted', 'Placed by JUMP — the plan stops scheduling it as new, but it still comes back as a review.') : null,
        hist.length
          ? h('div.bnd-hist',
            h('h3.bnd-hist-h', 'History'),
            h('ul.bnd-hist-list', hist.map(e => h('li',
              h('span.bnd-hist-mark', { dataset: { ok: String(!!e.ok) } }, e.ok ? '✓' : '✗'),
              h('span.mono', fmtDay(e.at)),
              h('span.muted', `attempt ${e.attempt ?? 1}${e.hints ? ` · ${e.hints} hint${e.hints > 1 ? 's' : ''}` : ''}`),
              h('span.mono.muted', fmtSecs(e.ms)),
            ))))
          : h('p.bnd-pop-note.muted', t.fam ? 'No Variants of this family yet.' : 'Not attempted yet.'),
        h('div.bnd-pop-actions',
          t.fam ? null : h('a.btn.btn-primary', { href: `#/card/${id}`, onclick: () => closePop() }, 'Open card'),
          ...tmpl.map(tid => h('a.btn', { href: `#/variant/${tid}`, onclick: () => closePop() }, `Infinite · ${templateLabel(tid)}`)),
          t.module && moduleById[t.module]?.jump && !t.placed && moduleOpen(save, t.module) ? h('a.btn', { href: `#/run/jump/${t.module}`, onclick: () => closePop() }, `JUMP HERE · ${moduleById[t.module].name}`) : null,   // T14 (S1 "JUMP HERE per module"); never on a module already cleared through
          t.module && moduleById[t.module]?.jump && !t.placed && !moduleOpen(save, t.module) ? h('span.muted.fs-1', `${moduleById[t.module].name} cleared — nothing left to jump.`) : null,
          // W4 integration: the Binder is where a module lives, so its two module-scoped runs start here
          // too — BLITZ (M1/M3/M9 only, notes/T16.md) and the Boss the module belongs to, once it is ready
          // (notes/T12.md). A boss that is not ready is not offered at all rather than offered and refused.
          t.module && moduleById[t.module]?.blitz ? h('a.btn', { href: `#/run/blitz/${t.module}`, onclick: () => closePop() }, `BLITZ · ${Math.round(moduleById[t.module].blitz)} s`) : null,
          ...(t.module ? readyBossesFor(t.module).map(b => h('a.btn', { href: `#/boss/${b.id}`, onclick: () => closePop() }, `BOSS · ${b.name}`)) : []),
          tmpl.length ? null : h('span.muted.fs-1', 'No Infinite set — this one returns as a spaced review.'),
        ),
      );

      document.body.append(body);
      pop = body; popFor = anchor;
      position(body, anchor);
      body.focus({ preventScroll: true });
      document.addEventListener('keydown', onPopKey, true);
      document.addEventListener('pointerdown', onPopOutside, true);
      window.addEventListener('resize', onPopDismiss);
      window.addEventListener('scroll', onPopDismiss, true);
      if (!templatesMod) loadTemplates().then(() => { if (pop === body) { closePop(); openPop(anchor, id); } });
    }

    function position(el, anchor) {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (vw < 560) { el.dataset.placement = 'sheet'; return; }      // phone: bottom sheet
      el.dataset.placement = 'anchored';
      const r = anchor.getBoundingClientRect();
      const w = Math.min(340, vw - 32);
      el.style.width = `${w}px`;
      const headerH = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56) + 8;
      const eh = el.offsetHeight || 260;
      const clampTop = (y) => Math.max(headerH, Math.min(y, vh - eh - 8));
      let left, top;
      if (vw >= 1024 && r.right + 8 + w <= vw - 16) {
        // laptop: beside the tile, in the empty gutter to its right — the sheet stays attached to what was pressed
        left = r.right + 8;
        top = clampTop(r.top);
      } else {
        left = Math.max(16, Math.min(vw - w - 16, r.left + r.width / 2 - w / 2));
        const below = r.bottom + 8;
        const above = r.top - eh - 8;
        // below if it fits, else above if it fits, else clamped beside the anchor — never pinned to the corner
        top = below + eh <= vh - 8 ? below : above >= headerH ? above : clampTop(below);
      }
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
    }

    /* ---- tile ---- */
    function tileEl(save, id) {
      const t = tileInfo(save, id);
      const state = t.rarity ?? (t.attempts > 0 ? 'seen' : 'none');
      const label = t.fam
        ? `${familyById[id]?.name ?? id} — ${t.rarity ? RARITY_LABEL[t.rarity] : 'not started'}`
        : `${numbering(id) || id} — ${t.rarity ? RARITY_LABEL[t.rarity] : t.attempts ? 'attempted' : 'not cleared'}${t.foil ? ', foil' : ''}${t.placed ? ', placed' : ''}`;

      const btn = h('button.tile', {
        type: 'button',
        title: t.rule,
        'aria-label': label,
        dataset: { id, rarity: state, foil: String(t.foil), placed: String(t.placed), fam: String(t.fam) },
      },
        h('span.tile-num', t.num),
        h('span.tile-state', { 'aria-hidden': 'true' }, t.rarity === 'platinum' ? '★' : t.rarity === 'gold' ? '●' : t.rarity === 'silver' ? '◐' : t.rarity === 'bronze' ? '○' : t.attempts ? '·' : ''),
        t.foil ? h('span.tile-sheen', { 'aria-hidden': 'true' }) : null,
      );

      // Tap = the original (the Original Set is this tab, in sheet order). A family tile has no
      // original, so it taps straight into its Infinite set — and opens its sheet if it has neither.
      const open = () => {
        if (!t.fam) { navigate(`/card/${id}`); return; }
        const tid = infiniteTemplates(id)[0];
        if (tid) navigate(`/variant/${tid}`); else openPop(btn, id);
      };

      let timer = null, moved = false, longFired = false, startXY = null;
      const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
      btn.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        moved = false; longFired = false; startXY = [e.clientX, e.clientY];
        cancel();
        timer = setTimeout(() => { timer = null; longFired = true; openPop(btn, id); }, 450);
      });
      btn.addEventListener('pointermove', (e) => {
        if (!startXY) return;
        if (Math.abs(e.clientX - startXY[0]) > 10 || Math.abs(e.clientY - startXY[1]) > 10) { moved = true; cancel(); }
      });
      btn.addEventListener('pointerup', cancel);
      btn.addEventListener('pointercancel', () => { cancel(); moved = true; });
      btn.addEventListener('pointerleave', cancel);
      btn.addEventListener('click', (e) => {
        if (longFired || moved) { e.preventDefault(); longFired = false; return; }
        open();
      });
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); openPop(btn, id); });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'i' || e.key === 'ContextMenu' || (e.key === 'Enter' && e.altKey)) { e.preventDefault(); openPop(btn, id); }
      });
      return btn;
    }

    /* ---- list row (the same tile, spelled out — and the keyboard-complete path to the sheet) ---- */
    function rowEl(save, id) {
      const t = tileInfo(save, id);
      const card = cardsMod?.byId?.[id] ?? null;
      const text = t.fam ? (familyById[id]?.name ?? '') : (card ? tileText(card, id) : '');
      const tid = t.fam ? infiniteTemplates(id)[0] : null;
      const href = t.fam ? (tid ? `#/variant/${tid}` : '#/binder') : `#/card/${id}`;
      const glyph = t.rarity === 'platinum' ? '★' : t.rarity === 'gold' ? '●' : t.rarity === 'silver' ? '◐' : t.rarity === 'bronze' ? '○' : '—';
      return h('li.bnd-row', { dataset: { rarity: t.rarity ?? (t.attempts ? 'seen' : 'none'), placed: String(t.placed) } },
        h('a.bnd-row-main', { href, title: stripMarkup(text || id) },
          h('span.bnd-row-num.mono', t.num),
          h('span.bnd-row-stem', { html: mathfmt(text || id) }),          // real notation (S9 #3), two lines then a clamp
          h('span.tile-chip', { dataset: { rarity: t.rarity ?? 'none' }, 'aria-label': t.rarity ? RARITY_LABEL[t.rarity] : 'not cleared' },
            h('span.tile-chip-word', t.rarity ? RARITY_LABEL[t.rarity] : '—'),
            h('span.tile-chip-glyph', { 'aria-hidden': 'true' }, glyph)),
        ),
        h('button.icon-btn.bnd-row-more', {
          type: 'button', 'aria-label': `Details for ${t.num}`,
          onclick: (e) => openPop(e.currentTarget, id),
        }, '⋯'),
      );
    }

    /* ---- render ---- */
    function render() {
      const save = getState();
      const cov = coverState(save);
      // The header's Readiness ring belongs to whichever screen is mounted (T01: "screens push what only
      // they know"); the Binder knows it, so arriving here from a deep link never shows an empty ring.
      const R = readiness(save);
      setHeader({ readiness: R.r, provisional: R.provisional });
      const sheet = sheetById[ui.sheet];
      const ids = sheet.ids;
      const infos = ids.map(id => tileInfo(save, id));
      const clearedHere = infos.filter(i => i.cleared).length;

      closePop();
      screen.replaceChildren();

      /* cover */
      screen.append(h('div.bnd-cover', { dataset: { cover: cov.state } },
        h('div.bnd-cover-art', { 'aria-hidden': 'true' },
          h('span.bnd-ring'), h('span.bnd-ring'), h('span.bnd-ring')),
        h('div.bnd-cover-text',
          h('h1#bnd-title', 'Binder'),
          h('p.bnd-fill',
            h('b.mono', `${Math.round(cov.frac * 100)}%`),
            ` of the packet cleared — `,
            h('span.mono', `${cov.cleared}/${cov.total}`)),
          h('p.bnd-cover-note.muted.fs-1', `${COVER_NAME[cov.state]} cover · ${COVER_NEXT[cov.state]}`),
        ),
        h('ul.bnd-hist-strip', { 'aria-label': 'Rarity histogram' },
          [['platinum', 'Plat'], ['gold', 'Gold'], ['silver', 'Silver'], ['bronze', 'Bronze'], ['none', 'Left']]
            .map(([k, lbl]) => h('li', { dataset: { rarity: k } },
              h('span.mono', String(cov.hist[k])), h('span.fs-1.muted', lbl)))),
      ));

      /* tabs */
      const tabs = h('div.bnd-tabs', { role: 'tablist', 'aria-label': 'Sheets' },
        sheets.map(s => {
          const on = s.id === ui.sheet;
          const done = s.ids.filter(id => tileInfo(save, id).cleared).length;
          return h('button.bnd-tab', {
            type: 'button', role: 'tab', id: `bnd-tab-${s.id}`,
            'aria-selected': String(on), 'aria-controls': 'bnd-panel',
            tabindex: on ? '0' : '-1',
            dataset: { sheet: s.id, bonus: String(!!s.bonus) },
            onclick: () => { ui.sheet = s.id; syncHash(); render(); },
            onkeydown: (e) => {
              const list = sheets.map(x => x.id);
              const i = list.indexOf(ui.sheet);
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                ui.sheet = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
                syncHash(); render();
                screen.querySelector(`#bnd-tab-${CSS.escape(ui.sheet)}`)?.focus();
              }
            },
          },
            h('span.bnd-tab-name', s.short),
            h('span.bnd-tab-count.mono.fs-1', s.bonus ? '—' : `${done}/${s.ids.length}`),
          );
        }));
      screen.append(tabs);
      // keep the open tab in view without ever scrolling the page (the strip has its own scrollLeft)
      const selTab = tabs.querySelector('[aria-selected="true"]');
      if (selTab) tabs.scrollLeft = Math.max(0, selTab.offsetLeft - (tabs.clientWidth - selTab.offsetWidth) / 2);

      /* panel */
      const panel = h('div#bnd-panel.bnd-panel', { role: 'tabpanel', 'aria-labelledby': `bnd-tab-${sheet.id}`, tabindex: '0' });
      panel.append(h('div.bnd-panel-head',
        h('div',
          h('h2.bnd-sheet-name', sheet.name),
          h('p.bnd-sheet-page.muted.fs-1', sheet.page)),
        h('div.bnd-panel-tools',
          h('span.mono.fs-1.muted', sheet.bonus ? `${sheet.ids.length} bonus` : `${clearedHere}/${ids.length} cleared`),
          h('div.bnd-viewtoggle', { role: 'group', 'aria-label': 'Tile view' },
            ['grid', 'list'].map(v => h('button', {
              type: 'button', 'aria-pressed': String(ui.view === v),
              onclick: () => { ui.view = v; syncHash(); if (v === 'list' && !cardsMod) loadCards().then(render); else render(); },
            }, v === 'grid' ? 'Tiles' : 'List'))),
        ),
      ));

      if (sheet.bonus) {
        panel.append(h('p.bnd-bonus-note', h('b', 'NOT on Unit 1A.'), ' The Bonus bank pays no XP and has no rarity — it is here so nothing from the Quizlet set goes missing.'));
      }

      const groups = groupIds(ids);
      for (const g of groups) {
        if (groups.length > 1) panel.append(h('h3.bnd-group', g.label));
        panel.append(ui.view === 'list'
          ? h('ul.bnd-list', g.ids.map(id => rowEl(save, id)))
          : h('ol.bnd-grid', g.ids.map(id => h('li', tileEl(save, id)))));
      }

      panel.append(h('p.bnd-hint.muted.fs-1',
        'Tap a tile to open it. Press and hold — or right-click, or press ',
        h('kbd', 'i'),
        ' — for the Foil rule, this card\'s history and Infinite practice.'));

      screen.append(panel);
    }

    function syncHash() {
      // Keep the tab linkable without re-routing (replaceState fires no hashchange).
      try { history.replaceState(null, '', `#/binder?sheet=${encodeURIComponent(ui.sheet)}${ui.view === 'list' ? '&view=list' : ''}`); } catch { /* ignore */ }
    }

    render();
    syncHash();
    loadCards().then(() => { if (ui.view === 'list') render(); });
    loadTemplates();

    const off = subscribe((s, reason) => { if (reason === 'update' || reason === 'import' || reason === 'reset') render(); });
    return () => { off(); closePop(); };
  };
}

export default mountBinder;
