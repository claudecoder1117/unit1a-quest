// data/modules.js — the 13 modules, the 7 Bosses and the 4 family tiles (COMPOSED S2, S4 "Bosses").
// Every SOURCE item lives in exactly one module's `originals` (its Original Set, in sheet order).
// `templates` name the generators (js/gen/*, registered in data/templates.js) that feed the module's
// Infinite view, Variants and Boss runs. Nothing here locks anything (Global rule 1).

const range = (prefix, from, to, pad = 2) => {
  const out = [];
  for (let n = from; n <= to; n++) out.push(`${prefix}-${String(n).padStart(pad, '0')}`);
  return out;
};

const M1_ORIGINALS = [
  ...range('voc', 1, 23), ...range('not', 1, 9), ...range('def', 1, 14), ...range('fact', 1, 5), ...range('cls', 1, 4),
];

// M4 rooms (S2): sub-groupings of the Original Set; the set itself stays in sheet order.
const M4_ROOMS = [
  { id: 'grotto', name: 'Grotto', ids: ['ang-02', 'ang-03', 'wp-01', 'wp-04', 'wp-06', 'wp-08'] },
  { id: 'nested', name: 'Nested', ids: ['ang-06', 'ang-11', 'doc-06', 'wp-02', 'wp-03', 'wp-07', 'wp-09', 'wp-13', 'wp-15'] },
  { id: 'ratio',  name: 'Ratio',  ids: ['ang-07', 'ang-08', 'wp-05', 'wp-10', 'wp-11', 'wp-14', 'wp-16'] },
];
const M4_ORIGINALS = [
  'ang-02', 'ang-03', 'ang-06', 'ang-07', 'ang-08', 'ang-11', 'doc-06',
  'wp-01', 'wp-02', 'wp-03', 'wp-04', 'wp-05', 'wp-06', 'wp-07', 'wp-08', 'wp-09', 'wp-10', 'wp-11', 'wp-13', 'wp-14', 'wp-15', 'wp-16',
];

export const modules = Object.freeze([
  {
    id: 'M1', name: 'Lexicon', skills: ['VOC', 'NOTE', 'CLASS'],
    originals: M1_ORIGINALS,
    // fact-01..05 sit in M1's set but drive ASN-PLP (S2 manifest line: `fact-* → ASN-PLP`).
    templates: ['T-vocab', 'T-notation', 'T-classify'],
    boss: 'B1', blitz: 60, jump: true,
  },
  {
    id: 'M2', name: 'Figure Recon', skills: ['PAIRS'],
    originals: ['ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5'],
    figure: 'F1G', templates: ['T-fig-pairs'],
    boss: null, bossVia: 'B2', jump: true,
  },
  {
    id: 'M3', name: 'Comp/Supp Sprint', skills: ['CSARITH'],
    originals: [],                       // none fixed — T-csarith chains depth 1–3 (BLITZ + cards)
    templates: ['T-csarith'],
    boss: null, bossVia: 'B1', blitz: 60, jump: true,
  },
  {
    id: 'M4', name: 'Word Problems: Linear', skills: ['CS-LIN', 'CS-RATIO'],
    originals: M4_ORIGINALS, rooms: M4_ROOMS,
    templates: ['T-cs-lin', 'T-cs-ratio'],
    boss: 'B4', jump: true,
  },
  {
    id: 'M5', name: 'Word Problems: Product', skills: ['CS-QUAD'],
    originals: ['ang-09', 'wp-12'],
    templates: ['T-cs-quad'],
    boss: null, bossVia: 'B4', jump: true,
  },
  {
    id: 'M6', name: 'Figure Algebra', skills: ['FIG-ALG'],
    originals: ['ang-10', 'doc-07'],
    figure: 'F1A', templates: ['T-fig-xlines-L', 'T-fig-xlines-Q', 'T-fig-system'],
    boss: 'B6', jump: true,
  },
  {
    id: 'M7', name: 'Bisector Verdicts', skills: ['BISECT-L', 'BISECT-Q'],
    originals: ['ang-05', 'doc-05'],
    templates: ['T-fig-bisect-L', 'T-fig-bisect-Q'],
    boss: 'B5', jump: true,
  },
  {
    id: 'M8', name: 'Midpoint Triangle', skills: ['SEG-ALG'],
    originals: ['ang-04'],
    figure: 'F2', templates: ['T-seg-mid'],
    boss: 'B7', jump: true,
  },
  {
    id: 'M9', name: 'ASN Arena', skills: ['ASN-PLP', 'ASN-ANG'],
    originals: [...range('asn', 1, 36), ...range('qz', 1, 18)],
    templates: [], modes: ['full36'],
    boss: 'B2', blitz: 90, jump: true,
  },
  {
    id: 'M10', name: 'Factor Forge', skills: ['FAC1', 'FAC2'],
    originals: range('fac', 1, 18),      // sheet order; 8, 9, 18 teach GCF, 16 negative lead, 11–15 a-term on either factor
    templates: ['T-factor-a1', 'T-factor-a2', 'T-factor-gcf', 'T-factor-neg'],
    boss: 'B3', jump: true,
  },
  {
    id: 'M11', name: 'Quadratic Solve', skills: ['QUAD-SOLVE', 'QUAD-CTX'],
    originals: ['quad-01', 'quad-02', 'quad-03'],
    families: ['fam-quad-a1', 'fam-quad-a2', 'fam-quad-ctx'],
    templates: ['T-quad-solve', 'T-quad-ctx'],
    boss: null, bossVia: 'B3', jump: true,
  },
  {
    id: 'M12', name: 'Systems', skills: ['SYS'],
    originals: [],
    families: ['fam-sys'],
    templates: ['T-sys'],
    boss: null, bossVia: 'B3', jump: true,
  },
  {
    id: 'M13', name: 'Bonus Bank', skills: [],
    originals: range('bonus', 1, 33),
    templates: [],
    boss: null, bonus: true, banner: 'NOT on Unit 1A', xp: false, mock: false, plan: false,
  },
].map(m => Object.freeze({ families: [], rooms: [], templates: [], ...m })));

export const MODULE_IDS = Object.freeze(modules.map(m => m.id));
export const moduleById = Object.freeze(Object.fromEntries(modules.map(m => [m.id, m])));

/**
 * Family tiles (S1 glossary): generated-only Binder tiles on the ALG tab.
 * Bronze/Silver/Gold at 1/2/3 Gold Variants; Platinum at 6 Gold Variants across ≥ 2 days (S4).
 */
export const families = Object.freeze([
  { id: 'fam-quad-a1',  name: 'Quadratics, a = 1',  module: 'M11', sheet: 'ALG', skills: ['QUAD-SOLVE'], template: 'T-quad-solve', params: { a: 1 }, tier: 2 },
  { id: 'fam-quad-a2',  name: 'Quadratics, a > 1',  module: 'M11', sheet: 'ALG', skills: ['QUAD-SOLVE'], template: 'T-quad-solve', params: { a: '>1' }, tier: 3 },
  { id: 'fam-quad-ctx', name: 'Reject the Root',    module: 'M11', sheet: 'ALG', skills: ['QUAD-CTX'],   template: 'T-quad-ctx',   params: {}, tier: 3 },
  { id: 'fam-sys',      name: 'Systems',            module: 'M12', sheet: 'ALG', skills: ['SYS'],        template: 'T-sys',        params: {}, tier: 2 },
].map(Object.freeze));
export const familyById = Object.freeze(Object.fromEntries(families.map(f => [f.id, f])));

/**
 * Bosses (S2 + S4): a run = 5 Variants (tier 2–4, drawn from the boss's skills / `pool`) + the elite
 * original last. 3 hearts, no hints, no cap timer. `prompt` = when Home offers the boss.
 */
export const bosses = Object.freeze([
  { id: 'B1', name: 'Definitions Gauntlet', modules: ['M1', 'M3'], elite: 'not-04',
    skills: ['VOC', 'NOTE', 'CLASS', 'CSARITH'], eliteNote: 'ray order',
    prompt: 'M1 originals all cleared' },
  { id: 'B2', name: 'The Oracle', modules: ['M9'], elite: 'asn-32',
    skills: ['ASN-PLP', 'ASN-ANG', 'PAIRS'],
    extra: [{ skill: 'PAIRS', template: 'T-fig-pairs', count: 1 }],   // "+ 1 pairs ask"
    prompt: 'M9 originals all cleared' },
  { id: 'B3', name: "Kuta's Revenge", modules: ['M10', 'M11', 'M12'], elite: 'fac-16',
    skills: ['FAC1', 'FAC2', 'QUAD-SOLVE', 'QUAD-CTX', 'SYS'],
    prompt: 'M10 originals all cleared and every M11/M12 family tile ≥ Bronze' },
  { id: 'B4', name: 'Sixteen', modules: ['M4', 'M5'], elite: 'wp-16',
    skills: ['CS-LIN', 'CS-RATIO', 'CS-QUAD'],
    equationRequired: true,   // every CS-* Variant carries the `equation` slot; wrong/blank costs no heart but forfeits flawless (+300)
    prompt: 'M4 and M5 originals all cleared' },
  { id: 'B5', name: 'The Bisector', modules: ['M7'], elite: 'ang-05',
    skills: ['BISECT-L', 'BISECT-Q'],
    prompt: 'M7 originals all cleared' },
  { id: 'B6', name: 'Crossroads', modules: ['M6', 'M12'], elite: 'ang-10',
    skills: ['FIG-ALG', 'SYS'],
    prompt: 'M6 originals all cleared' },
  { id: 'B7', name: 'The Triangle', modules: ['M8'], elite: 'ang-04',
    skills: ['SEG-ALG', 'QUAD-CTX', 'FAC2'],
    // M8 alone would be six near-identical midpoint problems: the 5 Variant slots draw from this mixed pool.
    pool: [
      { template: 'T-seg-mid',   count: 2 },
      { template: 'T-quad-ctx',  count: 2 },
      { template: 'T-factor-a2', count: 2 },
    ],
    prompt: 'M8 originals all cleared' },
].map(b => Object.freeze({ extra: [], pool: [], equationRequired: false, hearts: 3, variants: 5, ...b })));

export const BOSS_IDS = Object.freeze(bosses.map(b => b.id));
export const bossById = Object.freeze(Object.fromEntries(bosses.map(b => [b.id, b])));

const idToModule = new Map();
for (const m of modules) {
  for (const id of m.originals) idToModule.set(id, m.id);
  for (const id of m.families) idToModule.set(id, m.id);
}

/** Module id that owns a card / family-tile id, or null. */
export function moduleOf(id) {
  return idToModule.get(id) ?? null;
}

/** Every original id across all modules (bonus included unless `{bonus:false}`). */
export function allOriginalIds({ bonus = true } = {}) {
  return modules.filter(m => bonus || !m.bonus).flatMap(m => m.originals);
}

export default modules;
