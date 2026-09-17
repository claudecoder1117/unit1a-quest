// screens/sheet.js — #/sheet, "the cheat sheet you can't bring" (COMPOSED S7, Night Before block 4).
//
// Two halves, in this order:
//   YOURS  — ≤ 12 lines compiled from this student's own lapses (data/sheet.js `personalLines`):
//            the most-missed notation rule, the comp/supp set-up line, root rejection, the sign
//            pattern, then the four thinnest definitions. Each line says WHY it is on the sheet.
//   THE SHEET — the fixed reference: notation table, definitions, x / 90 − x / 180 − x, the figure
//            facts, ratios, both roots, the a > 1 factoring checklist, solving a system. Every rule
//            carries one tiny worked example. Methods, never memorised answers.
//
// Printable: `@media print` (the /* === T14 === */ block in css/screens.css) drops the header, the
// dock and every control, sets 2 columns at 7.4 pt and pins it to ONE A4/Letter page.
//
// Registered in screens/index.js: screens['/sheet'] = mountSheet.

import { h, setHeader } from '../app.js';
import { getState, subscribe } from '../store.js';
import { mathfmt } from '../mathfmt.js';
import { readiness } from '../readiness.js';
import { daysUntilTest, todayISO } from '../days.js';
import { sheetFor, FIXED_LINE_COUNT, MAX_PERSONAL } from '../../data/sheet.js';

/** mini-markup ({line AB}, {ray FC}, ^2 …) → a span; plain text stays plain. */
function fmt(text, cls) {
  const el = h(`span${cls ? '.' + cls : ''}`);
  el.innerHTML = mathfmt(String(text ?? ''));
  return el;
}

function personalBlock(save, personal) {
  const sec = h('section.sh-personal', { 'aria-labelledby': 'sh-yours' },
    h('div.sh-sec-head',
      h('h2#sh-yours.sh-sec-title', 'Yours'),
      h('p.sh-sec-blurb.muted.fs-1', 'Built from what you have actually got wrong. It changes every time you play.')));
  if (!personal.length) {
    sec.append(h('p.muted.fs-1', 'Nothing to personalise yet — run a page and this fills itself.'));
    return sec;
  }
  sec.append(h('ol.sh-lines.sh-lines-personal', personal.map(l => h('li.sh-line',
    h('span.sh-line-title', l.title),
    fmt(l.text, 'sh-line-rule'),
    l.why ? h('span.sh-line-why.muted', `— ${l.why}`) : null,
  ))));
  return sec;
}

function fixedBlock(sections) {
  const wrap = h('div.sh-fixed');
  for (const sec of sections) {
    wrap.append(h('section.sh-sec', { 'aria-labelledby': `sh-${sec.id}` },
      h('div.sh-sec-head',
        h('h2.sh-sec-title', { id: `sh-${sec.id}` }, sec.title),
        sec.blurb ? h('p.sh-sec-blurb.muted.fs-1', sec.blurb) : null),
      h('ol.sh-lines', sec.lines.map(l => h('li.sh-line',
        fmt(l.rule, 'sh-line-rule'),
        l.example ? fmt(l.example, 'sh-line-eg') : null,
      )))));
  }
  return wrap;
}

function render(el, save) {
  const { personal, fixed } = sheetFor(save, { max: MAX_PERSONAL });
  const rd = readiness(save);
  setHeader({ readiness: rd.r, provisional: rd.provisional });
  const D = daysUntilTest(save.settings?.testDate);

  const screen = h('section.screen.sh', { 'aria-labelledby': 'sh-h' },
    h('header.sh-head',
      h('div.sh-head-text',
        h('h1#sh-h', 'The cheat sheet you can’t bring'),
        h('p.muted.fs-2', 'Methods, never answers. Read it once tonight and once in the morning — that is all it is for.')),
      h('div.sh-head-tools.no-print',
        h('button.btn.sh-print', { type: 'button', onclick: () => { try { window.print(); } catch { /* ignore */ } } }, 'Print'),
        h('a.btn.btn-ghost', { href: '#/today' }, 'Today')),
    ),
    h('p.sh-stamp.mono.fs-1',
      `${todayISO()}${D != null && D >= 0 ? ` · T−${D}` : ''} · Readiness ${rd.r}${rd.provisional ? ' (provisional)' : ''} · ${personal.length} of yours + ${FIXED_LINE_COUNT} fixed`),
    personalBlock(save, personal),
    fixedBlock(fixed),
    h('p.sh-foot.muted.fs-1', 'Every example here is a different problem from the packet’s, worked in one line. Nothing on this sheet is an answer you can copy.'),
  );
  el.replaceChildren(screen);
}

/** `screens['/sheet']` — (params, query, ctx) => (el) => cleanup */
export function mountSheet() {
  return (el) => {
    render(el, getState());
    const off = subscribe((s, reason) => { if (el.isConnected && (reason === 'update' || reason === 'import' || reason === 'reset')) render(el, s); });
    return () => { off(); };
  };
}

export default mountSheet;
