/**
 * call.js — THE HIT RATE. designs/CUT-SPEC.md §5 "On screen".
 *
 * One question, asked once: **how often has this student got this skill right, unaided?**
 *
 * UNAIDED, AND THAT WORD IS THE WHOLE OF ROUND 4's EXPLOIT (r4, exploit-hunt). The mark used to be
 * filled by `result.cleared`, which `screens/card.js` sets for a clear bought with three hints and a
 * retry — and on the two hardest skills in the bank H3 states the answer ("set each factor equal to
 * 0 on its own", "the same binomial appears twice — pull it out"). So a student who can read set his
 * own rate to 1 at three taps a card: the row filled up, `sure` was buyable at will, and the evidence
 * the next bid was made against was evidence of nothing. The fix is one word in both places at once —
 * the game prices a CLEAN clear (`job/state.js answer`) and this file counts the same one — because a
 * rate that counts a different event from the one the pile pays for is not evidence, it is decoration
 * (CUT-SPEC §7 "Ninth": the bit the hit rate counts and the bit the game prices are the same bit).
 *
 * CLEAN IS NOT THIS MODULE'S INVENTION. It is the study layer's own Global rule 8 — first try, zero
 * hints — the bit `js/xp.js isClean`, `js/mastery.js`, `js/rarity.js` and the Leitner ladder in
 * `js/schedule.js` have always shared: a hinted clear leaves the bucket exactly where it was. The
 * game now reads what the rest of the app already wrote, and writes nothing.
 *
 * WHAT THE FACE-DOWN CARD DOES WITH THE ANSWER, and it is not a numeral. The rate is DRAWN, as one
 * mark per sitting — filled for a clear, struck for a miss, empty for a sitting the student has not
 * had (`screens/job.js hitMeterOf` / `marksEl`). `COPY.hits`'s `7 of 10` survives as that row's
 * `aria-label` and nowhere else: a count is what a screen reader needs and it is still never a
 * percentage, because `of` can be under 10 and a percentage would print a number the engine never
 * computed. It is not PRINTED because a ratio is two digit-runs, and CUT-BRIEF's hard limit is
 * three numbers on screen at once — the pile, the streak and what the question pays. The marks are
 * the fourth thing the student needs and the only form of it that costs no number:
 * `screens/job.js hitLineOf` returns `''` whenever there is any history at all, and `new` when
 * there is none. `tests/job-screen.test.mjs` pins both.
 *
 * DOM-FREE (BUILD-POLICY §2) and it imports nothing but `data/job.js`: the caller passes the card
 * index it already holds (`{ cards: byId }`), because this module is on Home's cold-open path and
 * `data/cards.js` is 236 KB.
 *
 * THE CUT AT THE SEAL, and why it is the default. The rate is what the call is priced against, so it
 * must not contain the answer being called. `qHatDetail` stops the history at the instant the call
 * was locked (`inProgress.game.call.at`), so a call is never weighed by its own outcome. Explicit
 * `before` wins; `before: null` opts out (a surface that wants the live rate, which must not feed a
 * priced call); otherwise the save's own seal supplies it.
 *
 * THE OTHER HALF OF A SKILL'S SITTINGS (r1, number-truth). A page deals CARDS and VARIANTS, and the
 * game prices both. Only a card writes `cards[id].history`: a cleared Variant bumps a counter on
 * `variants[template]` with no instant and no skill on it, and a missed one is written to `frozen`.
 * So a rate read from `cards` alone FREEZES on every Variant — the student answered three in a row,
 * the pile moved three times, and `4 of 5` never blinked. The count and the price have to be about
 * the same questions or the number on the face-down card is not evidence, it is decoration.
 *
 * Two stores already hold those sittings, so no new save state was invented for this (`store.js`:
 * "THE GAME HAS NO CAP HERE, and must never grow one"):
 *   · `runs[]` — every finished PAGE records one row per item, `{id, skill, credit, clean}`, on both
 *     routes: `makeRunRecord` writes it for `#/run/page` and `commitJobRun` writes the identical
 *     record for a game session (`tests/job-ledger.test.mjs` pins that identity). `clean` is
 *     `result.clean ?? (firstTry ∧ no hints)` — the SAME BIT, by construction;
 *   · `inProgress.queue` — the page being played right now, where `markItem` has already stamped
 *     `done` and the grade `result` on every question answered so far, including the one just
 *     answered. That is what makes the count move within the session.
 * A row whose id has a card record is DROPPED from both: the card history already holds it, and
 * counting it twice would be its own lie. The question on screen is never in its own rate.
 *
 * A REPEAT — the copy a missed review puts back on the page — IS counted here, though the game
 * prices it at nothing (`job/state.js sealRepeat`). The two are different questions: the rate
 * measures the student ("how often have you got this right"), and the pile measures the bid. They
 * have to disagree here, because `screens/card.js` writes a card's repeat into `cards[id].history`
 * whatever the game does with it — counting a card's second sitting and not a Variant's would be
 * the freeze this whole function exists to fix, one kind of question later.
 *
 * DEMOLITION (notes/DEMOLISH.md): 1,172 lines → this. The rating ladder, the credit function, the
 * rank thresholds, the Elo pair, the evidence bands, the disagreement bands and the regret line went
 * with the mechanics they priced (CUT-BRIEF "What is DELETED").
 */

import { QHAT } from '../../data/job.js';

const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

/** How many sittings of a skill the printed rate reads. `7 of 10` at full history. */
export const QHAT_WINDOW = QHAT.window;

/**
 * The call sealed for the CURRENT question — `inProgress.game.call = { id, at }` — or `null`.
 * Shape-tolerant on purpose: anything without a finite `at` is "no seal", the same answer a save
 * with no game in progress gives.
 * @param {object} save
 * @returns {{id?:string, at:number}|null}
 */
export function sealedCallOf(save) {
  const ip = save && typeof save === 'object' ? save.inProgress : null;
  const g = ip && typeof ip === 'object' ? ip.game : null;
  const c = g && typeof g === 'object' ? g.call : null;
  if (!c || typeof c !== 'object' || !Number.isFinite(c.at)) return null;
  return c;
}

/**
 * The student's measured clear rate on one skill, with its working shown.
 *
 * `source` says WHY a `null` is null: `'none'` is an honest empty history (the card prints `new`);
 * `'no-index'` means the save has card records but no card index resolved a single skill — the
 * caller forgot `opts.cards`.
 *
 * @param {object} save
 * @param {string} skillId
 * @param {{cards?: any, window?: number, primaryOnly?: boolean, before?: number|null}} [opts]
 * @returns {{qHat:number|null, hits:number, of:number, window:number, attempts:number,
 *            source:'history'|'none'|'no-index', before:number|null, sealed:boolean}}
 */
export function qHatDetail(save, skillId, opts = {}) {
  const size = Math.max(1, Math.floor(num(opts.window, QHAT_WINDOW)));
  const skillsOf = skillsResolver(opts.cards, save);
  const want = typeof skillId === 'string' ? skillId : null;
  const recs = save && typeof save.cards === 'object' && save.cards ? save.cards : null;
  const rows = [];
  let seen = 0;         // card records scanned
  let resolved = 0;     // …of which the index could name at least one skill
  if (want && recs) {
    for (const id of Object.keys(recs)) {
      seen++;
      const list = skillsOf(id);
      if (list.length) resolved++;
      const hit = opts.primaryOnly ? list[0] === want : list.includes(want);
      if (!hit) continue;
      const hist = recs[id] && recs[id].history;
      if (!Array.isArray(hist)) continue;
      for (const h of hist) { const e = histEntry(h); if (e) rows.push(e); }
    }
  }
  /* …and the sittings of the same skill no card record holds: the Variants of every page the save
     still keeps, and of the page in progress. Same bit, same skill, never a card twice. */
  const extra = want ? variantSittings(save, want) : { timed: [], live: [] };
  for (const e of extra.timed) rows.push(e);
  rows.sort((a, b) => a.at - b.at);
  /* THE CUT. Strictly `<`: the sitting written for THIS question is stamped at or after the lock and
     must not be in its own rate. */
  const seal = opts.before === undefined ? sealedCallOf(save) : null;
  const before = Number.isFinite(opts.before) ? opts.before : seal ? seal.at : null;
  const cut = Number.isFinite(before);
  /* The live page's rows carry no instant of their own — `markItem` stamps `done`, not a clock — so
     they are not cut: every one of them is a question ANSWERED BEFORE the one on screen, which is
     the only thing the cut is there to exclude. They are the newest sittings there are, so they sit
     at the end of the window. */
  const seenBefore = (cut ? rows.filter((e) => e.at < before) : rows).concat(extra.live);
  const win = seenBefore.slice(-size);
  const of = win.length;
  let hits = 0;
  /* THE EVENT, and it is the SAME BIT the game prices: a CLEAN clear — cleared on the first try with
     no hint revealed (`js/xp.js isClean`, Global rule 8), which `job/state.js answer` pays for and
     nothing else. CUT-SPEC §7 "Ninth". A clear bought with the ladder is a SITTING like any other —
     it is in `of`, and it draws a struck mark — so the row stays the count of the student's own
     sittings and only the fill changes. */
  for (const e of win) if (e.clean) hits++;
  return {
    qHat: of > 0 ? hits / of : null,
    hits,
    of,
    window: size,
    attempts: seenBefore.length,
    source: of > 0 ? 'history' : seen > 0 && resolved === 0 ? 'no-index' : 'none',
    /** the instant the history was cut at, or `null` for an uncut (live) read */
    before: cut ? before : null,
    /** did the cut come from the save's own sealed call rather than from the caller */
    sealed: cut && seal != null,
  };
}

/** `qHatDetail`'s rate alone, or `null` when the skill has no history. */
export function qHatFor(save, skillId, opts = {}) {
  return qHatDetail(save, skillId, opts).qHat;
}

/**
 * The sittings of one skill that live outside `cards[*].history` — the Variants.
 *
 * `timed` are the finished PAGES the save still keeps (`runs[]`, newest 40): one row per item,
 * stamped with the run's own `submittedAt`, so they cut at the seal like any other row. Only
 * `kind: 'page'` runs are read, because that is the record both routes write with the same item
 * shape (`screens/run.js makeRunRecord`) and the only queue the game prices; a Mock builds its own
 * rows and means something else by them.
 *
 * `live` is the page in progress: every item `markItem` has already marked `done`, except the one
 * at `idx` — the question on screen, which is never in its own rate.
 *
 * A row is a sitting only if it names a skill, names an id, and that id has no card record.
 * @returns {{timed: Array<{at:number, ok:boolean}>, live: Array<{at:null, ok:boolean}>}}
 */
function variantSittings(save, want) {
  const timed = [], live = [];
  if (!save || typeof save !== 'object') return { timed, live };
  const recs = save.cards && typeof save.cards === 'object' ? save.cards : null;
  /* a card's sittings are the card history's; a Variant has no card record, and never gets one */
  const notACard = (id) => typeof id === 'string' && !!id && !(recs && Object.prototype.hasOwnProperty.call(recs, id));
  const runs = Array.isArray(save.runs) ? save.runs : [];
  for (const r of runs) {
    if (!r || typeof r !== 'object' || r.kind !== 'page' || !Array.isArray(r.items)) continue;
    const at = num(r.submittedAt, num(r.startedAt, 0));
    for (const it of r.items) {
      if (!it || typeof it !== 'object' || !notACard(it.id) || it.skill !== want) continue;
      if (!Number.isFinite(+it.credit)) continue;               // a row with no verdict is not a sitting
      /* `clean` is `makeRunRecord`'s own field and it is always written; a row that does not carry
         one cannot say the clear was unaided, and an unprovable clear is not a filled mark. That is
         the same direction every other unknown in this layer takes — it lowers the rate, never
         raises it — and it is why the packed card history below is read the same way. */
      timed.push({ at, ok: +it.credit >= 1, clean: it.clean === true, attempt: 1, hints: 0 });
    }
  }
  const ip = save.inProgress && typeof save.inProgress === 'object' ? save.inProgress : null;
  const queue = ip && Array.isArray(ip.queue) ? ip.queue : [];
  const idx = Number.isInteger(ip?.idx) ? ip.idx : -1;
  for (let i = 0; i < queue.length; i++) {
    const it = queue[i];
    if (i === idx || !it || typeof it !== 'object' || it.done !== true) continue;
    const r = it.result;
    if (!r || typeof r !== 'object' || !notACard(it.id)) continue;
    const skill = r.skill ?? it.skill ?? (Array.isArray(it.skills) ? it.skills[0] : null);
    if (skill !== want) continue;
    /* the live page's rows hold `screens/card.js`'s own result object, so the clean bit is on them
       exactly as the card wrote it — the game reads it, it does not re-derive it */
    live.push({ at: null, ok: r.cleared === true, clean: cleanSitting(r), attempt: 1, hints: 0 });
  }
  return { timed, live };
}

/**
 * WAS THIS SITTING CLEAN — first try, no hint (Global rule 8)? The study layer's `clean` field when
 * the record carries one, and otherwise the definition itself, off the attempt and hint counts every
 * store in the app keeps beside the clear. Never a guess: a record that cannot say leaves the mark
 * unfilled.
 */
function cleanSitting(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.cleared === false || r.ok === false) return false;
  if (typeof r.clean === 'boolean') return r.clean;
  if (r.firstTry === false || r.solutionShown === true) return false;
  return num(r.hints, 0) <= 0 && num(r.attempt, 1) <= 1;
}

/** One card-history sitting, from either the unpacked object or the packed 5-array (store.js). */
function histEntry(h) {
  if (Array.isArray(h)) {
    if (h.length < 3) return null;
    const e = { at: num(h[0]), ok: !!h[1], attempt: num(h[2], 1), hints: num(h[3]) };
    return { ...e, clean: e.ok && cleanSitting(e) };
  }
  if (h && typeof h === 'object') {
    const e = { at: num(h.at), ok: !!h.ok, attempt: num(h.attempt, 1), hints: num(h.hints) };
    return { ...e, clean: e.ok && cleanSitting({ ...h, ...e }) };
  }
  return null;
}

/** id → skill-id list, from whatever shape of card index the caller has. */
function skillsResolver(cards, save) {
  if (typeof cards === 'function') return (id) => skillList(cards(id));
  if (cards instanceof Map) return (id) => skillList(cards.get(id));
  if (Array.isArray(cards)) {
    const idx = new Map();
    for (const c of cards) if (c && typeof c.id === 'string') idx.set(c.id, c);
    return (id) => skillList(idx.get(id));
  }
  if (cards && typeof cards === 'object') return (id) => skillList(cards[id]);
  return (id) => skillList(save && save.cards ? save.cards[id] : null);
}

function skillList(v) {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x);
  if (typeof v === 'object' && Array.isArray(v.skills)) return v.skills.filter((x) => typeof x === 'string' && x);
  return [];
}
