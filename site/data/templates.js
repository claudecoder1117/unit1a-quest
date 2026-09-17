// templates.js — the generator registry (COMPOSED S6 file layout; S8 #7a, #7b, #7c).
//
//   templates['T-cs-lin'] = { id, gen, version, skills, tier, forCards:[…], … }
//   generate('T-cs-lin', 'seed-string') → the item, stamped with its S3 identity
//
// Every Variant in the app comes from here: Infinite mode, BLITZ, Drill 5, the Daily Challenge, the
// weak-skill slots of Today's Page, the Boss pools and the Mock's section D look a template up by name
// and call `generate(id, seed)`. Seeding is S3's rule — `cyrb53('<template>|<seedString>')` — applied in
// ONE place (`rngFor` below) so a frozen Variant (S6 `frozen`: seed + templateVersion) replays byte-identically.
//
// Entry fields
//   id/gen/version/skills/tier/forCards   the four the ticket requires, plus the id for convenience
//   gen(seed, params?) → item             seed is a STRING (a number is stringified, never re-hashed
//                                         differently); `params` forces a variety knob (frame, ask, mode…)
//   forCards / forCard  the ORIGINAL cards this template is the "Infinite" version of (S1: long-press a
//                       Binder tile). `forCard` is the primary one (tests/gen.test.mjs T07b block).
//   par/module/sheet/label/blurb/needs/family/modes/partTypes   metadata the Binder and run screens use.
//
// Items are stamped by `generate()` — id `T-<template>#<seedTag>`, template, templateVersion, seed,
// seedKey (`<template>|<seed>`) and seedTag — so a generator never has to know how it was seeded.
//
// APPENDING: import your generator, add ONE entry per template, and keep the `T-<name>` keys in step with
// `data/modules.js` (`modules[].templates`) and the `variants`/`frozen` keys in the save (S6).
//
// Ownership note (integration, 2026-09-16): T07a owns this file. The T07b registrations below were
// reconstructed by T07a after an overwrite collision — the generators themselves are T07b's and were not
// touched. The T07c block at the bottom is T07c's own; T07a removed its temporary compat shim by folding
// `getTemplate` / `templatesFor` / `modelOf` into the real API here, and removed its duplicate rng import
// (the bindings below serve the whole module).

import { cyrb53, mulberry32, rngFrom, seedTag } from '../js/rng.js';
import { resolve as resolveFigure } from '../js/figure/model.js';

// --- T07a: comp/supp ---------------------------------------------------------------------------
import csarith from '../js/gen/csarith.js';
import cslin from '../js/gen/cslin.js';
import csratio from '../js/gen/csratio.js';
import csquad from '../js/gen/csquad.js';

// --- T07b: figures (owned by T07b; built with the same `makeGen` contract, so they register directly)
import { genXlinesL, genXlinesQ } from '../js/gen/figxlines.js';
import { genFigSystem } from '../js/gen/figsystem.js';
import { genBisectL, genBisectQ } from '../js/gen/figbisect.js';
import { genSegMid } from '../js/gen/segmid.js';
import { genFigPairs } from '../js/gen/figpairs.js';

/** @typedef {{id:string, gen:Function, version:number, skills:string[], tier:number, forCards:string[],
 *             forCard?:string|null, par?:number, module?:string, sheet?:string, label?:string,
 *             blurb?:string, needs?:string[], family?:string|null, partTypes?:string[]}} TemplateEntry */

/**
 * The S3 seeding rule, in one place: a seed string is hashed with the template name.
 * A number is stringified first, so `generate(id, 17)` and `generate(id, '17')` are the same Variant.
 */
export function rngFor(id, seed) {
  return rngFrom(id, String(seed ?? ''));
}

/** the six hex characters that end every generated id (`T-wp-07#a91f2c`) */
export function tagFor(id, seed) {
  return seedTag(cyrb53(`${id}|${String(seed ?? '')}`) >>> 0);
}

/** @type {Record<string, TemplateEntry>} */
export const templates = {
  // --- T07a: comp/supp ---------------------------------------------------------------------------
  'T-csarith': {
    id: 'T-csarith',
    gen: csarith,
    version: csarith.version,
    skills: ['CSARITH'],
    tier: 2,
    forCards: [],                 // M3 has no fixed originals (S2) — this template IS the module
    forCard: null,
    needs: [],
    par: 45,
    module: 'M3',
    sheet: null,
    label: 'Comp/Supp Sprint',
    blurb: 'Chains of complements and supplements, 1–3 deep.',
    partTypes: ['num'],
  },
  'T-cs-lin': {
    id: 'T-cs-lin',
    gen: cslin,
    version: cslin.version,
    skills: ['CS-LIN'],
    tier: 2,
    forCards: ['ang-02', 'ang-03', 'ang-06', 'ang-11', 'doc-06', 'wp-01', 'wp-02', 'wp-03', 'wp-04', 'wp-06', 'wp-07', 'wp-08', 'wp-09', 'wp-13', 'wp-15'],
    forCard: 'wp-01',
    needs: [],
    par: 150,
    module: 'M4',
    sheet: 'WP',
    label: 'Word Problems: Linear',
    blurb: 'The teacher’s nine sentence frames with new numbers.',
    partTypes: ['equation', 'num', 'multi'],
  },
  'T-cs-ratio': {
    id: 'T-cs-ratio',
    gen: csratio,
    version: csratio.version,
    skills: ['CS-RATIO'],
    tier: 2,
    forCards: ['ang-07', 'ang-08', 'wp-05', 'wp-10', 'wp-11'],
    forCard: 'wp-05',
    needs: [],
    par: 165,
    module: 'M4',
    sheet: 'WP',
    label: 'Word Problems: Ratio',
    blurb: 'Parts of 180 or 90, supplement : complement, and ratio answers.',
    partTypes: ['equation', 'num', 'multi', 'ratio'],
  },
  'T-cs-quad': {
    id: 'T-cs-quad',
    gen: csquad,
    version: csquad.version,
    skills: ['CS-QUAD'],
    tier: 3,
    forCards: ['ang-09', 'wp-12'],
    forCard: 'wp-12',
    needs: ['QUAD-SOLVE'],
    par: 240,
    module: 'M5',
    sheet: 'WP',
    label: 'Word Problems: Product',
    blurb: 'Quadratic set-ups where one root may have to go.',
    partTypes: ['equation', 'roots', 'reject', 'num'],
  },

  // --- T07b: figures (generators in js/gen/fig*.js and segmid.js — owned by T07b) -----------------
  'T-fig-xlines-L': {
    id: 'T-fig-xlines-L',
    gen: genXlinesL,
    version: genXlinesL.version,
    skills: ['FIG-ALG'],
    tier: 3,
    forCards: ['doc-07'],
    forCard: 'doc-07',
    needs: [],
    par: 180,
    module: 'M6',
    sheet: 'DOC',
    label: 'Crossing lines, linear',
    blurb: 'Two lines through a point; one linear equation in the labels.',
    partTypes: ['equation', 'multi'],
  },
  'T-fig-xlines-Q': {
    id: 'T-fig-xlines-Q',
    gen: genXlinesQ,
    version: genXlinesQ.version,
    skills: ['FIG-ALG', 'QUAD-SOLVE'],
    tier: 4,
    forCards: ['ang-10'],
    forCard: 'ang-10',
    needs: ['QUAD-SOLVE'],
    par: 300,
    module: 'M6',
    sheet: 'AP-4',
    label: 'Crossing lines, quadratic',
    blurb: 'ang-10’s figure with a quadratic label — keep or reject each root.',
    partTypes: ['equation', 'roots', 'reject', 'cases'],
  },
  'T-fig-system': {
    id: 'T-fig-system',
    gen: genFigSystem,
    version: genFigSystem.version,
    skills: ['FIG-ALG', 'SYS'],
    tier: 3,
    forCards: ['doc-07'],
    forCard: 'doc-07',
    needs: ['SYS'],
    par: 180,
    module: 'M12',
    sheet: 'DOC',
    label: 'Two lines, two unknowns',
    blurb: 'doc-07’s form: vertical + linear-pair equations in x and y.',
    partTypes: ['equation', 'multi'],
  },
  'T-fig-bisect-L': {
    id: 'T-fig-bisect-L',
    gen: genBisectL,
    version: genBisectL.version,
    skills: ['BISECT-L'],
    tier: 4,
    forCards: ['doc-05'],
    forCard: 'doc-05',
    needs: [],
    par: 300,
    module: 'M7',
    sheet: 'DOC',
    label: 'Bisector verdict, linear',
    blurb: 'Does the ray bisect? Solve, halve, decide, justify.',
    partTypes: ['strip'],
  },
  'T-fig-bisect-Q': {
    id: 'T-fig-bisect-Q',
    gen: genBisectQ,
    version: genBisectQ.version,
    skills: ['BISECT-Q', 'QUAD-SOLVE'],
    tier: 4,
    forCards: ['ang-05'],
    forCard: 'ang-05',
    needs: ['QUAD-SOLVE'],
    par: 300,
    module: 'M7',
    sheet: 'AP-2',
    label: 'Bisector verdict, quadratic',
    blurb: 'ang-05’s two cases: each root gets its own verdict.',
    partTypes: ['roots', 'cases', 'strip'],
  },
  'T-seg-mid': {
    id: 'T-seg-mid',
    gen: genSegMid,
    version: genSegMid.version,
    skills: ['SEG-ALG', 'QUAD-SOLVE'],
    tier: 4,
    forCards: ['ang-04'],
    forCard: 'ang-04',
    needs: ['QUAD-SOLVE'],
    par: 300,
    module: 'M8',
    sheet: 'AP-2',
    label: 'Midpoint triangle',
    blurb: 'ang-04’s triangle: midpoints, one positive root, a perimeter.',
    partTypes: ['roots', 'reject', 'multi'],
  },
  'T-fig-pairs': {
    id: 'T-fig-pairs',
    gen: genFigPairs,
    version: genFigPairs.version,
    skills: ['PAIRS'],
    tier: 2,
    forCards: ['ang-wu-1', 'ang-wu-2', 'ang-wu-3', 'ang-wu-4', 'ang-wu-5'],
    forCard: 'ang-wu-1',
    needs: [],
    par: 90,
    module: 'M2',
    sheet: 'AP-1',
    label: 'Angle pairs',
    blurb: 'A fresh fan every time — name the pairs the warm-up asks for.',
    partTypes: ['pairs'],
  },
};

// ---------------------------------------------------------------------------------------------
// the API (tests/gen.test.mjs, the screens and the planner all go through these)
// ---------------------------------------------------------------------------------------------

/** every registered template id, in registration order (a function: the registry grows at load time) */
export function templateIds() {
  return Object.keys(templates);
}

/** getTemplate('T-cs-lin') → the entry (with `id`), or undefined. Never throws on an unknown name. */
export function getTemplate(id) {
  if (typeof id !== 'string') return undefined;
  const entry = Object.prototype.hasOwnProperty.call(templates, id) ? templates[id] : undefined;
  if (entry && !entry.id) entry.id = id;                    // entries appended by another ticket
  if (entry && entry.forCard === undefined) entry.forCard = (entry.forCards ?? [])[0] ?? null;
  return entry;
}

/** the older name for getTemplate (kept: T07a's own callers use it) */
export function templateOf(id) {
  return getTemplate(id) ?? null;
}

/** has('T-cs-lin') → boolean */
export function has(id) {
  return getTemplate(id) !== undefined;
}

/** every entry, in registration order */
export function allTemplates() {
  return templateIds().map(getTemplate);
}

/**
 * generate(id, seed, params?) → the item, stamped with its S3 identity.
 * Throws on an unknown template (a silent null would let a broken pool ship).
 * @param {string} id     a registered template id
 * @param {string|number} seed   the seed STRING (S3: hashed with the template name)
 * @param {object} [params]      variety knobs the template understands (frame / ask / mode / …)
 */
export function generate(id, seed = '', params = {}) {
  const def = getTemplate(id);
  if (!def) throw new Error(`unknown template: ${id}`);
  const key = String(seed ?? '');
  const item = def.gen(key, params && typeof params === 'object' ? params : {});
  if (!item || typeof item !== 'object') throw new Error(`${id}: generator returned no item`);
  const tag = tagFor(id, key);
  return {
    ...item,
    id: `${id}#${tag}`,
    template: id,
    templateVersion: item.templateVersion ?? def.version,
    seed,
    seedKey: `${id}|${key}`,
    seedTag: tag,
  };
}

/** the templateVersion to store beside a frozen seed (S6 `frozen`), or null */
export function versionOf(id) {
  const def = getTemplate(id);
  return def ? def.version : null;
}

/** every ENTRY offered as the Infinite version of an original card ('ang-10' → [T-fig-xlines-Q]) */
export function templatesFor(cardId) {
  return allTemplates().filter((t) => (t.forCards ?? []).includes(cardId) || t.forCard === cardId);
}

// The three `templatesForX` helpers return template IDS (the shape the planner, the Binder and the
// T07c tests use); `templatesFor(cardId)` above returns the ENTRIES (the shape the T07b tests use).
// Both are kept deliberately — `templatesFor` is the entry view, `templatesForCard` the id view.

/** every template ID offered as the Infinite version of an original card ('wp-07' → ['T-cs-lin']) */
export function templatesForCard(cardId) {
  return templatesFor(cardId).map((t) => t.id);
}

/** every template ID that drives a skill ('CS-LIN' → ['T-cs-lin']) */
export function templatesForSkill(skill) {
  return allTemplates().filter((t) => (t.skills ?? []).includes(skill)).map((t) => t.id);
}

/** every template ID of a module ('M4' → ['T-cs-lin','T-cs-ratio']) */
export function templatesForModule(moduleId) {
  return allTemplates().filter((t) => t.module === moduleId).map((t) => t.id);
}

/**
 * modelOf(item) → the resolved figure model of a generated figure item, or null for a text item.
 * A generated figure carries its whole spec (`item.figure.spec`), so nothing here reads data/figures.js.
 */
export function modelOf(item) {
  const f = item && item.figure;
  if (!f || !f.spec) return null;
  return resolveFigure(f.spec, f);
}

export default templates;

/* === T07c === */
// Algebra + M1 generators (S8 #7c): factoring · quadratics · systems · notation · vocabulary ·
// classification. Each module exports a `templates` array of descriptors whose `gen(rng, opts?)`
// takes an Rng; `t07c()` below wraps one into this registry's `gen(seed, params)` contract and
// stamps the S2 item identity (`T-<template>#<seedTag>`, `templateVersion`, `seed`, `seedKey`).
//
// `params` is optional and lets a Boss / the placement force a variety knob, e.g.
//   templates['T-quad-ctx'].gen('seed', { frame: 'angles', bothValid: true })   frames: rect|angles|zero
//   templates['T-quad-solve'].gen('seed', { mode: 'a1' })                       modes:  a1|a2
//   templates['T-sys'].gen('seed', { mode: 'elim' })                            modes:  sub|elim|general
//   templates['T-notation'].gen('seed', { kind: 'ray' })                        kinds:  see js/gen/notation.js
//   templates['T-vocab'].gen('seed', { mode: 'type', key: 'linear-pair' })
import { templates as t07cFactor } from '../js/gen/factor.js';
import { templates as t07cQuad } from '../js/gen/quad.js';
import { templates as t07cSys } from '../js/gen/sys.js';
import { templates as t07cNotation } from '../js/gen/notation.js';
import { templates as t07cVocab } from '../js/gen/vocab.js';
import { templates as t07cClassify } from '../js/gen/classify.js';

/** S3 seeding: a seed STRING is hashed with the template name; a stored uint32 replays a frozen Variant. */
function t07cRng(id, seed) {
  return typeof seed === 'number' ? mulberry32(seed >>> 0) : rngFrom(id, String(seed ?? ''));
}

/** a js/gen descriptor (`gen(rng, opts)`) → this registry's TemplateEntry (`gen(seed, params)`). */
function t07c(desc) {
  const gen = (seed = 0, params = {}) => {
    const rng = t07cRng(desc.id, seed);
    const raw = desc.gen(rng, params && typeof params === 'object' ? params : {});
    const tag = seedTag(rng.seed);
    return {
      module: desc.module, sheet: desc.sheet, tier: desc.tier, par: desc.par,
      skills: desc.skills.slice(), needs: desc.needs ?? [], forCards: desc.forCards ?? [],
      ...raw,
      id: `${desc.id}#${tag}`,
      template: desc.id,
      templateVersion: desc.version,
      seed: rng.seed >>> 0,
      seedKey: typeof seed === 'number' ? String(seed >>> 0) : String(seed ?? ''),
      seedTag: tag,
      generated: true,
    };
  };
  gen.version = desc.version;
  gen.template = desc.id;
  return {
    gen,
    version: desc.version,
    skills: desc.skills.slice(),
    tier: desc.tier,
    // S4(b): fac-* / quad-* / cls-* / not-* are FAMILY-templated originals — `forCards` lists the
    // cards whose Infinite view IS this template (the Variant record carries `forCard`).
    forCards: (desc.forCards ?? []).slice(),
    needs: desc.needs ?? [],
    par: desc.par,
    module: desc.module,
    sheet: desc.sheet,
    label: desc.label,
    blurb: desc.blurb ?? '',
    family: desc.family ?? null,      // the S2 family tile in save.variants (fam-sys, fam-quad-*)
    modes: desc.modes ?? null,
    frames: desc.frames ?? null,
    kinds: desc.kinds ?? null,
    partTypes: desc.partTypes ?? [],
  };
}

const T07C_FOR_CARDS = {
  'T-factor-a1': ['fac-02', 'fac-03', 'fac-04', 'fac-05', 'fac-06', 'fac-07', 'fac-10', 'fac-17'],
  'T-factor-a2': ['fac-01', 'fac-11', 'fac-12', 'fac-13', 'fac-14', 'fac-15'],
  'T-factor-gcf': ['fac-08', 'fac-09', 'fac-18'],
  'T-factor-neg': ['fac-16'],
  'T-quad-solve': ['quad-01', 'quad-02', 'quad-03'],
  'T-quad-ctx': [],
  'T-sys': [],
  'T-notation': ['not-01', 'not-02', 'not-03', 'not-04', 'not-05', 'not-06', 'not-07', 'not-08', 'not-09'],
  'T-vocab': [],
  'T-classify': ['cls-01', 'cls-02', 'cls-03', 'cls-04'],
};
const T07C_BLURB = {
  'T-factor-a1': 'Kuta §6 with a = 1 — two numbers that multiply and add.',
  'T-factor-a2': 'Kuta §6 with a > 1 — the ac-method and grouping.',
  'T-factor-gcf': 'GCF first, then the trinomial inside.',
  'T-factor-neg': 'Negative lead: pull out the −1 before anything else.',
  'T-quad-solve': 'Solve by factoring — both roots, integers or halves.',
  'T-quad-ctx': 'A quadratic inside a story: keep, reject, and say why.',
  'T-sys': 'Two equations, two unknowns — substitution or elimination.',
  'T-notation': 'Read and write the §0 symbols; ray AB ≠ ray BA.',
  'T-vocab': 'The 23 §0 terms, with confusable-group distractors.',
  'T-classify': 'Six measures — exactly one right angle and one straight angle.',
};

for (const desc of [...t07cFactor, ...t07cQuad, ...t07cSys, ...t07cNotation, ...t07cVocab, ...t07cClassify]) {
  templates[desc.id] = t07c({ ...desc, forCards: T07C_FOR_CARDS[desc.id] ?? [], blurb: T07C_BLURB[desc.id] ?? '' });
}
/* === /T07c === */