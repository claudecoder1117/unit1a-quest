// data/sheets.js — the Binder's tabs (COMPOSED S1 screens, S2 "Sheets").
// One tab per physical page of the packet; every card carries a `sheet` field equal to a tab id.
// `ids` are in SHEET ORDER (the teacher's numbering) — the Binder renders a tab's tiles in this order.
// Family tiles (fam-*) are generated-only tiles that live on the ALG tab; they are not cards.

const range = (prefix, from, to, pad = 2) => {
  const out = [];
  for (let n = from; n <= to; n++) out.push(`${prefix}-${String(n).padStart(pad, '0')}`);
  return out;
};

export const sheets = Object.freeze([
  {
    id: 'VOC', name: 'Vocab', short: 'Vocab', page: 'Study guide §0',
    ids: [...range('voc', 1, 23), ...range('not', 1, 9), ...range('def', 1, 14), ...range('fact', 1, 5), ...range('cls', 1, 4)],
  },
  { id: 'AP-1', name: 'Angles p.1', short: 'p.1', page: 'Angles Practice p.1',
    ids: ['ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5', 'ang-02', 'ang-03'] },
  { id: 'AP-2', name: 'Angles p.2', short: 'p.2', page: 'Angles Practice p.2', ids: ['ang-04', 'ang-05'] },
  { id: 'AP-3', name: 'Angles p.3', short: 'p.3', page: 'Angles Practice p.3', ids: range('ang', 6, 9) },
  { id: 'AP-4', name: 'Angles p.4', short: 'p.4', page: 'Angles Practice p.4', ids: ['ang-10', 'ang-11'] },
  { id: 'DOC', name: 'Doc', short: 'Doc', page: 'Study guide #5–#7', ids: ['doc-05', 'doc-06', 'doc-07'] },
  { id: 'WP', name: 'Word Problems', short: 'WP', page: '4a. comp supp word problems', ids: range('wp', 1, 16) },
  { id: 'ASN', name: 'ASN', short: 'ASN', page: 'Always / Sometimes / Never', ids: range('asn', 1, 36) },
  { id: 'QZ', name: 'Quizlet', short: 'Quizlet', page: 'Quizlet A/S/N (in scope)', ids: range('qz', 1, 18) },
  { id: 'FAC', name: 'Factoring', short: 'Factoring', page: 'Kuta — Factoring Trinomials (a > 1)', ids: range('fac', 1, 18) },
  { id: 'ALG', name: 'Algebra Review', short: 'Algebra', page: 'Algebra review (no linked sheet)',
    ids: ['quad-01', 'quad-02', 'quad-03', 'fam-quad-a1', 'fam-quad-a2', 'fam-quad-ctx', 'fam-sys'] },
  { id: 'BONUS', name: 'Bonus', short: 'Bonus', page: 'Quizlet — triangles / parallel / skew (NOT on Unit 1A)',
    ids: range('bonus', 1, 33), bonus: true },
].map(s => Object.freeze({ ...s, ids: Object.freeze(s.ids) })));

export const SHEET_IDS = Object.freeze(sheets.map(s => s.id));

export const sheetById = Object.freeze(Object.fromEntries(sheets.map(s => [s.id, s])));

const idToSheet = new Map();
for (const s of sheets) for (const id of s.ids) idToSheet.set(id, s.id);

/** Tab id for a card / family-tile id (from the tab lists, independent of the card's own `sheet` field). */
export function sheetOf(id) {
  return idToSheet.get(id) ?? null;
}

/** Position of an id inside its tab (0-based), or -1. */
export function sheetIndex(id) {
  const s = idToSheet.get(id);
  return s ? sheetById[s].ids.indexOf(id) : -1;
}

/**
 * The teacher's numbering as display text for a tile ("10)", "7.", "W1", "17").
 * Display only — ids stay flat (Appendix A).
 */
export function numbering(id) {
  const wu = /^ang-wu-(\d+)$/.exec(id);
  if (wu) return `W${wu[1]}`;
  const m = /-(\d+)$/.exec(id);
  if (!m) return '';
  const n = String(Number(m[1]));
  if (id.startsWith('ang-') || id.startsWith('fac-')) return `${n})`;
  if (id.startsWith('doc-') || id.startsWith('wp-') || id.startsWith('asn-')) return `${n}.`;
  return n;
}

export default sheets;
