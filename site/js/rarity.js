// rarity.js — the S4 rarity ladder and the Foil-path class rule, as pure functions (COMPOSED S4 "Rarity").
//
// Pure, DOM-free, imports nothing (screens can import it without pulling data). Everything here is a
// function of an id and a small record the store keeps; nothing is read from localStorage.
//
//   Originals (per Card, best-ever wins):  Gold = firstTry ∧ hints ≤ 1  ·  Silver = firstTry ∧ hints ≥ 2, or attempt 2
//                                          Bronze = attempt 3 or solution shown.  On wp-*, ang-02..11, doc-06 Gold
//                                          additionally needs the `equation` setup attempted at least once (S3/S4).
//   Platinum = Gold + Foil; Platinum is never earned by re-clearing an original. The Foil rule depends on the card
//   class so every one of the ~140 tiles has a live path (the rule text is what the tile tooltip prints, S4):
//     (a) templated originals (ang-02..11, wp-01..16, doc-05..07, ang-wu-1..5): 3 Gold Variants of that card's OWN
//         template (T-wp-07, T-ang-10, T-fig-pairs seeded for ang-wu-* …);
//     (b) family-templated originals (fac-* via T-factor-*, quad-* via T-quad-solve, cls-* via T-classify, not-* via
//         T-notation): 3 Gold Variants of the family drawn while that card is the review target (the Variant record
//         carries forCard), OR 3 clean due-review clears of the card on 3 distinct days — whichever comes first;
//     (c) untemplated recall cards (asn-*, qz-*, voc-*, def-*, fact-*): 3 clean due-review clears on 3 distinct days.
//   Family tiles (fam-quad-a1/a2/ctx, fam-sys): Bronze / Silver / Gold at 1 / 2 / 3 Gold Variants, Platinum at
//   6 Gold Variants across ≥ 2 days. The Bonus bank has no rarity path at all.
//
// Save-schema inputs (S6):  cards[id].foilProgress = [{ day:'2026-09-17', via:'T-ang-10#a91f2c' | 'review' }]
//                            variants[famId] = { clearsGold, goldDays:['2026-09-17', …] }
// `foilEarned(id, foilProgress)` reads the first, `familyRarity(variants[famId])` the second.

export const RARITIES = Object.freeze(['bronze', 'silver', 'gold', 'platinum']);
export const FOIL_NEED = 3;                 // Gold Variants (a, b) or clean due-review days (b, c)
export const FAMILY_PLATINUM_GOLD = 6;      // Gold Variants for a family tile's Platinum
export const FAMILY_PLATINUM_DAYS = 2;      // … across at least this many distinct days
export const FAMILY_STEPS = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

const RE = {
  warmup: /^ang-wu-[1-5]$/,
  angles: /^ang-(0[2-9]|1[01])$/,
  doc: /^doc-0[5-7]$/,
  wp: /^wp-(0[1-9]|1[0-6])$/,
  fac: /^fac-(0[1-9]|1[0-8])$/,
  quad: /^quad-0[1-3]$/,
  cls: /^cls-0[1-4]$/,
  not: /^not-0[1-9]$/,
  recall: /^(asn-(0[1-9]|[1-2]\d|3[0-6])|qz-(0[1-9]|1[0-8])|voc-(0[1-9]|1\d|2[0-3])|def-(0[1-9]|1[0-4])|fact-0[1-5])$/,
  family: /^fam-(quad-a1|quad-a2|quad-ctx|sys)$/,
  bonus: /^bonus-\d\d$/,
};

/** The generator family (S2/S3 `T-…` template) that implements a class-(a) card's own seeded template. */
const GENERATOR = Object.freeze({
  'ang-02': 'T-cs-lin', 'ang-03': 'T-cs-lin', 'ang-06': 'T-cs-lin', 'ang-11': 'T-cs-lin', 'doc-06': 'T-cs-lin',
  'ang-07': 'T-cs-ratio', 'ang-08': 'T-cs-ratio',
  'ang-09': 'T-cs-quad',
  'ang-04': 'T-seg-mid',
  'ang-05': 'T-fig-bisect-Q', 'doc-05': 'T-fig-bisect-L',
  'ang-10': 'T-fig-xlines-Q', 'doc-07': 'T-fig-system',
});
const WP_RATIO = new Set(['wp-05', 'wp-10', 'wp-11', 'wp-14', 'wp-16']);

/** Class-(b) family templates per id family (S4 (b)). */
const FAMILY_TEMPLATES = Object.freeze({
  fac: Object.freeze(['T-factor-a1', 'T-factor-a2', 'T-factor-gcf', 'T-factor-neg']),
  quad: Object.freeze(['T-quad-solve']),
  cls: Object.freeze(['T-classify']),
  not: Object.freeze(['T-notation']),
});

const isStr = (v) => typeof v === 'string' && v.length > 0;

/** clean = first try AND zero hints (Global rule 8) — the one definition XP, combo, mastery and Foil share. */
export function isClean(clear) {
  return !!clear && clear.firstTry === true && (clear.hints ?? 0) === 0;
}

/** Cards whose Gold additionally needs the `equation` setup attempted at least once: wp-*, ang-02..11, doc-06. */
export function needsSetupForGold(id) {
  return isStr(id) && (RE.wp.test(id) || RE.angles.test(id) || id === 'doc-06');
}

/**
 * The rarity a single clear earns (S4 "Rarity"). Best-ever wins across clears — combine with bestRarity().
 * @param {object} clear  { id?, firstTry:boolean, hints:number, attempt?:1|2|3, solutionShown?:boolean, setupTried?:boolean }
 *   attempt defaults to 1 when firstTry, else 2. On a setup card (needsSetupForGold) a first-try clear with ≤ 1 hint
 *   stays Silver until the setup has been tried once (any attempt, any time); pass setupTried:true to lift it.
 * @returns {'gold'|'silver'|'bronze'|null}  null for no clear
 */
export function rarityOf(clear) {
  if (!clear || typeof clear !== 'object') return null;
  const attempt = Number.isInteger(clear.attempt) ? clear.attempt : (clear.firstTry ? 1 : 2);
  const hints = Number.isFinite(clear.hints) ? Math.max(0, clear.hints) : 0;
  if (clear.solutionShown === true || attempt >= 3) return 'bronze';
  if (attempt === 2 || clear.firstTry === false) return 'silver';
  if (hints >= 2) return 'silver';
  if (needsSetupForGold(clear.id) && clear.setupTried !== true) return 'silver';
  return 'gold';
}

/** The higher of two rarities (null-safe). */
export function bestRarity(a, b) {
  const ia = RARITIES.indexOf(a), ib = RARITIES.indexOf(b);
  if (ia < 0) return ib < 0 ? null : b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

/** Foil class of an id: 'a' | 'b' | 'c' | 'family' | null (Bonus bank and unknown ids). */
export function foilClass(id) {
  if (!isStr(id)) return null;
  if (RE.warmup.test(id) || RE.angles.test(id) || RE.doc.test(id) || RE.wp.test(id)) return 'a';
  if (RE.fac.test(id) || RE.quad.test(id) || RE.cls.test(id) || RE.not.test(id)) return 'b';
  if (RE.recall.test(id)) return 'c';
  if (RE.family.test(id)) return 'family';
  return null;
}

/** Class (a): the card's OWN seeded template id (T-wp-07, T-ang-10, T-doc-05 …; T-fig-pairs for ang-wu-*). Else null. */
export function ownTemplate(id) {
  if (foilClass(id) !== 'a') return null;
  return RE.warmup.test(id) ? 'T-fig-pairs' : `T-${id}`;
}

/** Class (a): the generator family that implements the own template (must be in the module's `templates`). Else null. */
export function generatorOf(id) {
  if (foilClass(id) !== 'a') return null;
  if (RE.warmup.test(id)) return 'T-fig-pairs';
  if (RE.wp.test(id)) return id === 'wp-12' ? 'T-cs-quad' : (WP_RATIO.has(id) ? 'T-cs-ratio' : 'T-cs-lin');
  return GENERATOR[id] ?? null;
}

/** Class (b): the family's templates whose Gold Variants (drawn as this card's review target) count. Else []. */
export function familyTemplates(id) {
  if (foilClass(id) !== 'b') return [];
  return FAMILY_TEMPLATES[id.split('-')[0]] ?? [];
}

/** The Foil rule as the tile tooltip prints it (S4: "the rule is printed verbatim in each tile's tooltip"). */
export function foilRule(id) {
  const cls = foilClass(id);
  const setup = needsSetupForGold(id) ? ' Gold needs one equation setup.' : '';
  switch (cls) {
    case 'a':
      return `Platinum = Gold + Foil. Foil: ${FOIL_NEED} Gold Variants of this card's own template (${ownTemplate(id)}) — the same problem with different numbers.${setup}`;
    case 'b': {
      const fam = familyTemplates(id);
      const name = fam.length === 1 ? fam[0] : `${fam[0].replace(/-[^-]+$/, '')}-*`;
      return `Platinum = Gold + Foil. Foil: ${FOIL_NEED} Gold ${name} Variants drawn while this card is the review target, or ${FOIL_NEED} clean due-review clears on ${FOIL_NEED} different days — whichever comes first.`;
    }
    case 'c':
      return `Platinum = Gold + Foil. Foil: ${FOIL_NEED} clean due-review clears on ${FOIL_NEED} different days.`;
    case 'family':
      return `Bronze / Silver / Gold at ${FAMILY_STEPS.bronze} / ${FAMILY_STEPS.silver} / ${FAMILY_STEPS.gold} Gold Variants; Platinum at ${FAMILY_PLATINUM_GOLD} Gold Variants across ${FAMILY_PLATINUM_DAYS} or more days.`;
    default:
      return 'Bonus bank — not on Unit 1A. No rarity, no Foil.';
  }
}

/** Everything a tile needs to describe its path: { cls, template, generator, templates, rule, needsSetup, need }. */
export function foilPath(id) {
  const cls = foilClass(id);
  return Object.freeze({
    id, cls,
    template: ownTemplate(id),
    generator: generatorOf(id),
    templates: familyTemplates(id),
    rule: foilRule(id),
    needsSetup: needsSetupForGold(id),
    need: cls === 'family' ? FAMILY_PLATINUM_GOLD : (cls ? FOIL_NEED : 0),
  });
}

/** 'T-wp-07#a91f2c' → 'T-wp-07'; 'review' → null. */
export function templateOfVia(via) {
  if (!isStr(via) || via === 'review') return null;
  return via.split('#')[0];
}

/**
 * Foil progress of an original from its save record (`cards[id].foilProgress`, S6):
 *   entries { day:'YYYY-MM-DD', via:'T-…#seed' } are Gold Variant clears credited to this card (forCard implied),
 *   entries { day, via:'review' } are clean due-review clears ("Full 36" / BLITZ clears count when the card was due).
 * @returns {{ cls, have:number, need:number, variants:number, reviewDays:number, done:boolean }}
 */
export function foilProgress(id, progress) {
  const cls = foilClass(id);
  const list = Array.isArray(progress) ? progress.filter((e) => e && typeof e === 'object') : [];
  const days = new Set();
  let variants = 0;
  if (cls === 'a') {
    const accepted = new Set([ownTemplate(id), generatorOf(id)].filter(Boolean));
    for (const e of list) { const t = templateOfVia(e.via); if (t && accepted.has(t)) variants++; }
  } else if (cls === 'b') {
    const fam = new Set(familyTemplates(id));
    for (const e of list) {
      const t = templateOfVia(e.via);
      if (t && fam.has(t)) variants++;
      else if (e.via === 'review' && isStr(e.day) && isClean({ firstTry: e.firstTry ?? true, hints: e.hints ?? 0 })) days.add(e.day);
    }
  } else if (cls === 'c') {
    for (const e of list) if (e.via === 'review' && isStr(e.day) && isClean({ firstTry: e.firstTry ?? true, hints: e.hints ?? 0 })) days.add(e.day);
  }
  const reviewDays = days.size;
  const have = cls === 'a' ? variants : cls === 'b' ? Math.max(variants, reviewDays) : cls === 'c' ? reviewDays : 0;
  const need = cls === 'a' || cls === 'b' || cls === 'c' ? FOIL_NEED : 0;
  return Object.freeze({ cls, have: Math.min(have, need), need, variants, reviewDays, done: need > 0 && have >= need });
}

/** Has this original earned its Foil? (family tiles and the Bonus bank: never — see familyRarity) */
export function foilEarned(id, progress) {
  return foilProgress(id, progress).done;
}

/**
 * A family tile's rarity from `variants[famId]` (S4): Bronze / Silver / Gold at 1 / 2 / 3 Gold Variants,
 * Platinum at 6 Gold Variants across ≥ 2 distinct days (so Gold and Foil never coincide).
 * @param {{ clearsGold?:number, goldDays?:string[] }} rec
 * @returns {'bronze'|'silver'|'gold'|'platinum'|null}
 */
export function familyRarity(rec) {
  const n = rec && Number.isFinite(rec.clearsGold) ? Math.max(0, Math.floor(rec.clearsGold)) : 0;
  const days = new Set((rec && Array.isArray(rec.goldDays) ? rec.goldDays : []).filter(isStr)).size;
  if (n >= FAMILY_PLATINUM_GOLD && days >= FAMILY_PLATINUM_DAYS) return 'platinum';
  if (n >= FAMILY_STEPS.gold) return 'gold';
  if (n >= FAMILY_STEPS.silver) return 'silver';
  if (n >= FAMILY_STEPS.bronze) return 'bronze';
  return null;
}

/**
 * The tile rarity of an original from its save record: best-ever rarity, lifted to Platinum when Gold + Foil.
 * @param {string} id
 * @param {{ rarity?:string|null, foil?:boolean, foilProgress?:Array }} rec  cards[id]
 */
export function tileRarity(id, rec) {
  if (!rec || typeof rec !== 'object') return null;
  const base = RARITIES.includes(rec.rarity) ? rec.rarity : null;
  if (base === 'platinum') return 'platinum';
  const foil = rec.foil === true || (Array.isArray(rec.foilProgress) && foilEarned(id, rec.foilProgress));
  return base === 'gold' && foil ? 'platinum' : base;
}

export default foilPath;
