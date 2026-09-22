// asn-reason.js — T-asn-reason (J5b; module M9, skills ASN-PLP + ASN-ANG, sheet ASN/QZ).
//
// COMPOSED-GAME G4 "Supply: what the packet can actually feed, per wing", response 2:
//   "One new generator, on content that already exists. `T-asn-reason` (J5b) builds a reason-chip
//    drill family from the 54 one-line reasons already in `data/asn.js` — no new content authoring,
//    no `site/content/`, no PNG, no `orig`. It renews ASN-PLP and ASN-ANG at Variant `scope 0.8`."
//
// EVERY line of content this file serves is read from `data/asn.js` (the 54 reason sets: one reason
// + two distractors each, ticket T06d) and `data/cards/asn.js` (the statement each reason justifies,
// our own transcription of content/SOURCE.md §4/§5). This module authors NO statement, NO reason and
// NO distractor of its own — only the frames that wrap them, the way every generator does. It never
// touches `orig`, `site/content/`, a PNG or a teacher key (BUILD-POLICY §1).
//
// Two asks, both about the REASON (the verdict alone is the original card's ask, and re-asking it
// would be the same lock, not a re-keyed one):
//   'reason'   the statement and its verdict are given → which of the three lines is the reason?
//              part `mc`, chips = data/asn.js's chipsFor(id), a wrong chip tags 'wrong-reason'
//   'verdict'  the statement AND the bank's reason are given → which verdict do they make it?
//              part `asn`, graded by js/grader/asn.js, a wrong letter tags overgeneralised /
//              undergeneralised / flipped-verdict — the tags that catalogue already owns
//
// The second half of this file is the SUPPLY arithmetic G4 asks the board to print
// (`RECALL 8 locks available today`) and the `repeat · scope 0.5` price of an untemplated original
// re-served inside its Leitner interval. It lives here because J5b owns supply; it is pure, DOM-free
// and takes the template registry as a PARAMETER so that `data/templates.js` → this file stays a
// one-way edge (importing the registry back would close a cycle).
//
// DOM-free. Pure. No global random source — every draw comes from the seeded stream (js/rng.js).

import { seedTag, rngFrom } from '../rng.js';
import { REASONS, REASON_IDS, chipsFor } from '../../data/asn.js';
import { byId as asnCardById, verdictWord } from '../../data/cards/asn.js';
import { cards as ALL_CARDS } from '../../data/cards.js';
import { WINGS } from '../../data/job.js';
import { isDue, intervalDays, DAY_MS } from '../schedule.js';

/* =================================================================================================
   the generator
   ================================================================================================= */

export const TEMPLATE_ID = 'T-asn-reason';
export const VERSION = 1;

/** G4/G2: a Variant pays `xp.scopeFor({isVariant:true})` = 0.8. Published here so a test can pin it. */
export const SCOPE = 0.8;

/** the two asks, with their draw weights (the reason chip is the family's reason for existing) */
const MODE_WEIGHTS = Object.freeze([['reason', 5], ['verdict', 3]]);
export const MODES = Object.freeze(MODE_WEIGHTS.map((m) => m[0]));

/** The 54 in-scope reason ids that also have a card (asn-01..36, qz-01..18). bonus-* carry no chips. */
export const POOL = Object.freeze(REASON_IDS.filter((id) => {
  const r = REASONS[id];
  const card = asnCardById[id];
  return !!r && typeof r.reason === 'string' && (r.distractors ?? []).length === 2
    && !!card && !card.bonus && (card.skills ?? []).length > 0;
}));

/** 'ASN-PLP' | 'ASN-ANG' → the ids of the statements that skill owns. */
export const POOL_BY_SKILL = Object.freeze(
  ['ASN-PLP', 'ASN-ANG'].reduce((acc, s) => {
    acc[s] = Object.freeze(POOL.filter((id) => asnCardById[id].skills[0] === s));
    return acc;
  }, {}),
);

export const SKILLS = Object.freeze(['ASN-PLP', 'ASN-ANG']);

/** What a verdict letter promises, in one phrase — the frame H1 is built from. */
const LETTER_FRAME = Object.freeze({
  A: 'it holds in every case',
  S: 'it holds in one case and fails in another',
  N: 'it fails in every case',
});

function poolFor(opts = {}) {
  if (opts.ref && POOL.includes(opts.ref)) return [opts.ref];
  const bySkill = POOL_BY_SKILL[opts.skill];
  return bySkill && bySkill.length ? bySkill : POOL;
}

/**
 * build(rng, opts) → the item (unstamped; `data/templates.js generate()` stamps the S3 identity).
 * @param {import('../rng.js').Rng} rng   the seeded stream
 * @param {{mode?:'reason'|'verdict', ref?:string, skill?:'ASN-PLP'|'ASN-ANG'}} [opts]
 */
export function build(rng, opts = {}) {
  const pool = poolFor(opts);
  const ref = opts.ref && POOL.includes(opts.ref) ? opts.ref : rng.pick(pool);
  const card = asnCardById[ref];
  const mode = MODES.includes(opts.mode)
    ? opts.mode
    : rng.weighted(MODE_WEIGHTS.map((m) => m[0]), MODE_WEIGHTS.map((m) => m[1]));

  const letter = card.parts[0].answer;
  const word = verdictWord(letter);
  const statement = card.stem;
  // every chip comes from data/asn.js's own accessor — the correct one first, then its two distractors
  const chips = chipsFor(ref);
  const reason = chips.find((c) => c.correct).text;
  const distractors = chips.filter((c) => !c.correct).map((c) => c.text);
  const skill = card.skills[0];

  let stem;
  let part;
  let answer;
  const misconceptions = [];

  if (mode === 'reason') {
    stem = `“${statement}” is ${word}. Which line is the reason?`;
    answer = reason;
    part = {
      id: 'reason',
      type: 'mc',
      prompt: stem,
      answer: reason,
      distractors: distractors.map((text) => ({
        text,
        why: `That line does not justify ${word} for this statement — ${LETTER_FRAME[letter]}.`,
        tag: 'wrong-reason',
      })),
    };
    for (const text of distractors) {
      misconceptions.push({
        part: 'reason',
        answer: text,
        tag: 'wrong-reason',
        msg: `${word} — ${reason}`,
      });
    }
  } else {
    stem = `“${statement}” — ${reason} · Which verdict does that make it?`;
    answer = word;
    part = {
      id: 'verdict',
      type: 'asn',
      answer: letter,
      reason,
      // the reason is already on the stem in this ask, so there is no chip stage to run
      distractors: [],
      askReasonOnMiss: false,
    };
    if (card.parts[0].disputed) part.disputed = card.parts[0].disputed;
  }

  const hints = mode === 'reason'
    ? [
      `${word} means ${LETTER_FRAME[letter]}. The reason has to say why.`,
      card.hints[0],
      card.hints[1],
    ]
    : [
      'Read the reason first — it names the cases that decide it.',
      card.hints[0],
      card.hints[1],
    ];

  return {
    id: `${TEMPLATE_ID}#${seedTag(rng.seed)}`,
    template: TEMPLATE_ID,
    params: { mode, ref, skill },
    prompt: stem,
    stem,
    figure: null,
    skills: [skill],
    needs: [],
    tier: 1,
    par: 20,
    module: 'M9',
    sheet: card.sheet,
    parts: [part],
    answer,
    hints,
    solution: [{ say: `${word} — ${reason}` }],
    misconceptions,
    generated: true,
  };
}

/**
 * The registry's own contract: `gen(seedString, params) → item` (the T07a entry shape; the S3 seeding
 * rule is applied once, in `data/templates.js rngFor()`, so a frozen Variant replays byte-identically).
 */
export function gen(seed = '', params = {}) {
  // the S3 rule, spelled the way data/templates.js `rngFor()` spells it
  const rng = rngFrom(TEMPLATE_ID, String(seed ?? ''));
  return build(rng, params && typeof params === 'object' ? params : {});
}
gen.version = VERSION;
gen.template = TEMPLATE_ID;

/** The registry entry, so `data/templates.js` adds exactly one line of its own. */
export const template = Object.freeze({
  id: TEMPLATE_ID,
  gen,
  version: VERSION,
  skills: [...SKILLS],
  tier: 1,
  // no `forCards`: this family is not the Infinite view of any one statement, so no review, rematch
  // or Binder path for an asn-*/qz-* original changes behaviour (COMPOSED-GAME prime directive).
  forCards: [],
  forCard: null,
  // a reason drill is the layer ABOVE the verdict: both ASN skills must be met (m ≥ 40 or placed)
  // before the composer offers it, so a fresh save still meets the statements themselves first.
  needs: [...SKILLS],
  par: 20,
  module: 'M9',
  sheet: 'ASN',
  label: 'Always / Sometimes / Never: the reason',
  blurb: 'The bank’s one-line reasons, asked as chips — and the verdict they justify.',
  modes: [...MODES],
  partTypes: ['mc', 'asn'],
});

export const templates = Object.freeze([template]);

/* =================================================================================================
   supply — what each wing can feed today (G4), and the price of a blessed repeat
   ================================================================================================= */

/** G4 response 3 / `data/job.js SCOPE_MIRROR.repeat`: an untemplated original re-served early. */
export const REPEAT_SCOPE = 0.5;

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
const primarySkillOf = (card) => (Array.isArray(card?.skills) && card.skills.length ? card.skills[0] : null);
const plannable = (card) => !!card && !card.bonus && Array.isArray(card.skills) && card.skills.length > 0;
const recordOf = (save, id) => (save && save.cards && typeof save.cards === 'object' ? save.cards[id] : null);
const seen = (rec) => !!rec && rec.lastAt != null;

/** The printed price line, DERIVED from the number so the copy can never drift from the constant. */
function scopeNote(label, scope) {
  const s = Math.round(scope * 100) / 100;
  return `${label} · scope ${s % 1 === 0 ? s.toFixed(1) : String(s)}`;
}

/**
 * repeatFor(cardId, save, opts) — what an original costs when the board re-serves it.
 *
 * G4 response 3: "Untemplated recall repeats are blessed and visibly unprofitable. A `def-*`/`fact-*`
 * original re-served inside its Leitner interval pays `scope 0.5` and the envelope says
 * `repeat · scope 0.5`."
 *
 * @param {string} cardId
 * @param {object} save
 * @param {{now?:number, templatesFor?:(id:string)=>Array}} [opts]
 *        `templatesFor` is the registry's own `templatesFor(cardId)`; pass it so a card that CAN be
 *        re-keyed is re-keyed instead of repeated. Omitted → the card is treated as untemplated.
 * @returns {{repeat:boolean, scope:number|null, note:string|null, reason:string,
 *            templated:boolean, due:boolean, seen:boolean, daysEarly:number}}
 */
export function repeatFor(cardId, save, opts = {}) {
  const now = num(opts.now, Date.now());
  const list = typeof opts.templatesFor === 'function' ? (opts.templatesFor(cardId) ?? []) : [];
  const templated = list.length > 0;
  const rec = recordOf(save, cardId);
  const everSeen = seen(rec);
  const due = everSeen ? isDue(rec, now) : false;
  const daysEarly = everSeen && rec.due != null && !due ? Math.max(0, (rec.due - now) / DAY_MS) : 0;

  if (!everSeen) return { repeat: false, scope: null, note: null, reason: 'unseen', templated, due, seen: false, daysEarly: 0 };
  if (due) return { repeat: false, scope: null, note: null, reason: 'due', templated, due, seen: true, daysEarly: 0 };
  if (templated) {
    return { repeat: false, scope: null, note: null, reason: 'templated', templated, due, seen: true, daysEarly };
  }
  return {
    repeat: true,
    scope: REPEAT_SCOPE,
    note: scopeNote('repeat', REPEAT_SCOPE),
    reason: 'repeat',
    templated, due, seen: true, daysEarly,
  };
}

/** The envelope's price line for a repeat: `repeat · scope 0.5`. */
export function repeatNote() {
  return scopeNote('repeat', REPEAT_SCOPE);
}

/**
 * skillSupply(save, opts) → { [skillId]: {...} } — what one skill can feed today.
 *
 *   due        cards of this skill whose Leitner record is due now
 *   fresh      plannable originals never answered (the new-card supply)
 *   repeatable cleared, NOT due, and untemplated — servable only as a `repeat · scope 0.5`
 *   families   the template ids registered for this skill (each one renews without limit)
 *   renewable  families.length > 0
 *
 * @param {object} save
 * @param {{now?:number, cards?:Array, templatesForSkill?:(s:string)=>string[],
 *          templatesFor?:(id:string)=>Array}} [opts]
 */
export function skillSupply(save, opts = {}) {
  const now = num(opts.now, Date.now());
  const bank = Array.isArray(opts.cards) ? opts.cards : ALL_CARDS;
  const forSkill = typeof opts.templatesForSkill === 'function' ? opts.templatesForSkill : () => [];
  const forCard = typeof opts.templatesFor === 'function' ? opts.templatesFor : () => [];

  /** @type {Record<string, any>} */
  const out = {};
  const touch = (id) => (out[id] ??= {
    id, due: 0, fresh: 0, repeatable: 0, cleared: 0, originals: 0,
    families: [], renewable: false, locks: 0,
  });

  for (const wing of WINGS) for (const s of wing.skills) touch(s);

  for (const card of bank) {
    if (!plannable(card)) continue;
    const skill = primarySkillOf(card);
    if (!skill) continue;
    const row = touch(skill);
    row.originals++;
    const rec = recordOf(save, card.id);
    if (!seen(rec)) { row.fresh++; continue; }
    row.cleared++;
    if (isDue(rec, now)) { row.due++; continue; }
    if ((forCard(card.id) ?? []).length === 0) row.repeatable++;
  }

  for (const id of Object.keys(out)) {
    const row = out[id];
    row.families = (forSkill(id) ?? []).slice();
    row.renewable = row.families.length > 0;
    row.locks = row.due + row.fresh + row.families.length;
  }
  return out;
}

/**
 * wingSupply(save, opts) → the per-wing supply the board sheet prints (G4: `RECALL 8 locks available
 * today`, and the thin-board state when a wing runs dry).
 *
 * `locks` counts the cards a wing can post today (due + never-answered) PLUS one per renewable
 * family: a family is a floor, not a ceiling — a renewable wing never runs dry, which is the whole
 * point of registering T-asn-reason for ASN-PLP and ASN-ANG.
 *
 * @param {object} save
 * @param {{now?:number, cards?:Array, wings?:Array, templatesForSkill?:Function, templatesFor?:Function}} [opts]
 * @returns {{wings:Record<string,object>, order:string[], lines:string[], total:number, thin:string[]}}
 */
export function wingSupply(save, opts = {}) {
  const wings = Array.isArray(opts.wings) && opts.wings.length ? opts.wings : WINGS;
  const skills = skillSupply(save, opts);

  /** @type {Record<string, any>} */
  const out = {};
  const order = [];
  let total = 0;
  const thin = [];

  for (const wing of wings) {
    const rows = wing.skills.map((s) => skills[s]).filter(Boolean);
    const families = [...new Set(rows.flatMap((r) => r.families))];
    const row = {
      id: wing.id,
      label: wing.label ?? wing.id,
      w: num(wing.w, 0),
      skills: wing.skills.slice(),
      due: rows.reduce((t, r) => t + r.due, 0),
      fresh: rows.reduce((t, r) => t + r.fresh, 0),
      repeatable: rows.reduce((t, r) => t + r.repeatable, 0),
      originals: rows.reduce((t, r) => t + r.originals, 0),
      families,
      renewable: families.length > 0,
      renewableSkills: rows.filter((r) => r.renewable).map((r) => r.id),
      locks: 0,
    };
    row.locks = row.due + row.fresh + families.length;
    out[wing.id] = row;
    order.push(wing.id);
    total += row.locks;
    if (!row.renewable && row.due + row.fresh === 0) thin.push(wing.id);
  }

  // G6's `supply` line, built from the numbers rather than re-typed: `RECALL 8 locks available today`
  const lines = order.map((id) => `${out[id].label} ${out[id].locks} locks available today`);
  return { wings: out, order, lines, total, thin };
}

/** The Leitner interval a record is inside, in days (0 when it has never been answered). */
export function intervalOf(rec) {
  return seen(rec) ? intervalDays(rec.bucket ?? 0) : 0;
}

export default templates;
