// js/job/index.js — THE JOB's Fault Index (COMPOSED-GAME G2 "The Fault Index", G5 #5) and the
// Backcheck rules (G2 "Backchecks", G3.7 #10). J7.
//
// 68 entries, one per tag in `data/misconceptions.js`, grouped by that file's own 11 `AREAS`. A tag is
// SEALED when it has been resolved cleanly 3 times across 3 distinct days with zero re-triggers in that
// window. Live tells pay ×1.25 (`econ.tellFor`); `resolve()` sets `cleared` and the multiplier drops to
// 1.00 the same tick; sealing retires the tag from the tell pool for good.
//
// DOM-free and clock-free, like every file under js/job/ (G8): no `document`, no `window`, no CSS, no
// `Math.random`, and no reading of the wall clock — a day is always PASSED IN as an ISO string, because
// G3.7 proof 5 forbids any payoff term in the layer from reading elapsed time. The module is pure:
// `trigger()` / `resolve()` / `spend()` / `mint()` return a NEW save and mutate nothing, the same
// contract `crew.allocate()` and `guard.pushHeat()` ship (notes/J4.md, notes/J3.md).
//
// The tell is SKILL-KEYED, not card-keyed (G4, G10 #26): it is the make's most-triggered unsealed,
// unresolved tag, counted out of `save.errors` — the log the graders already write — so ASN-PLP and
// ASN-ANG carry a tell even though `data/cards/asn.js` holds zero `tag:` entries and no card-data
// migration happens anywhere in this layer. Attributing an error line to a make needs an id→skills
// LOOKUP, which the caller passes exactly as it passes one to `call.qHatFor` (notes/J2.md "qHatFor
// needs a card index"): `tellFor(save, 'FAC2', { cards: byId })`. With no index the answer is an honest
// `null`, never a fabricated tag.
//
// ── WHY A RESOLVED TAG IS STILL OFFERED (the seal's only road; exploit-hunt R1 BLOCKER) ───────────
// A seal takes THREE resolutions on three distinct days, and `js/job/state.js applyTarget` is the only
// caller of `resolve()` in the app: it resolves the tag the priced target's TELL named, and nothing
// else. So a tell pool that dropped a tag the instant it was first resolved closed the loop after
// resolution #1 — 68 tags, both milestones, the completion certificate and the retirement half of
// G3.7 proof 3(e) were all unreachable, and the only retirement left was `cleared`, which the next
// miss undoes. `tellDetail` therefore keeps a CLEARED-BUT-UNSEALED tag in the pool, strictly BEHIND
// every live one, so the next clean clear of that make can resolve it again and the seal can land.
// It costs nothing: `econ.tellFor` reads `cleared` and prices such a record at 1.00, and a live tag
// always outranks it, so **no posted value anywhere moves** — the re-offer exists only so the third
// resolution is reachable by playing the game (`tests/job-index.test.mjs` §2b seals through
// `state.applyTarget` over three simulated days, never by calling `resolve()` directly).
//
// ── AND ONLY A CLEAN CLEAR RESOLVES ONE (round 2) ────────────────────────────────────────────────
// G2 seals on resolutions that were CLEAN, so a card the student got wrong twice and right on the
// third attempt must advance nothing and must leave the fault LIVE at ×1.25 — the certificate says
// "the sixty-eight mistakes I no longer make". The caller resolves on ANY clear and passes no verdict,
// so `resolve()` reads one: `opts.clean` when it is given, else the rung `applyTarget` has already
// stamped for this very target (`inProgress.game.last`), else — no live job at all — clean, which is
// what this module always did. See `resolvedCleanly()` and `tests/job-index.test.mjs` §2c.

import { AREAS, MISCONCEPTIONS, TAGS, lookup } from '../../data/misconceptions.js';
import { FAULT_INDEX, BACKCHECK, TAG_RECORD_DEFAULT, CAPS, COPY, RUNGS } from '../../data/job.js';
import { SKILL_IDS, skillById } from '../../data/skills.js';
import { tellFor as tellMultOf } from './econ.js';
import { areaOfTag, wingOfTag, AREA_IDS } from './guard.js';

/* ------------------------------------------------------------------ re-exports and constants */

export { TAGS, AREAS, MISCONCEPTIONS } from '../../data/misconceptions.js';
export { AREA_IDS, areaOfTag, wingOfTag } from './guard.js';
export { FAULT_INDEX, BACKCHECK } from '../../data/job.js';

/** 68 — the size of the collection (G2). Computed from the catalogue, checked against the constant. */
export const TAG_COUNT = TAGS.length;

/** The three numbers that make a seal (G2: "3 clean resolutions across 3 distinct days, no re-trigger"). */
export const SEAL = Object.freeze({
  resolutions: FAULT_INDEX.sealResolutions,
  distinctDays: FAULT_INDEX.sealDistinctDays,
  requiresNoRetrigger: FAULT_INDEX.sealRequiresNoRetrigger,
});

/** G2 milestones the trophy predicates read (`index-25`, `index-68`). */
export const MILESTONES = FAULT_INDEX.milestones;

/** Every refusal `trigger` / `resolve` / `spend` / `mint` can return. Never an exception. */
export const REFUSALS = Object.freeze({
  UNKNOWN_TAG: 'unknown-tag',
  SEALED: 'sealed',
  ON_VAULT: 'on-vault',
  NONE_HELD: 'none-held',
  AT_CAP: 'at-cap',
  ALREADY_MINTED: 'already-minted',
  NO_DUES: 'no-dues',
  DUES_OPEN: 'dues-open',
  NO_DAY: 'no-day',
  NOT_CLEAN: 'not-clean',
});

/** The four states one cell of the index can be in, in the order the panel prints them. */
export const STATES = Object.freeze(['sealed', 'cleared', 'live', 'untouched']);

const EMPTY = Object.freeze({});
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nat = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const isoOrNull = (x) => (typeof x === 'string' && x ? x : null);
const known = (tag) => typeof tag === 'string' && Object.hasOwn(MISCONCEPTIONS, tag);

/** Catalogue order, for a deterministic tie-break that never reaches for a random number. */
const ORDER = Object.freeze(Object.fromEntries(TAGS.map((t, i) => [t, i])));

/* ------------------------------------------------------------------ records */

/** A brand-new Fault Index record. Same shape as `store.freshTag()` (G7; `days` is a COUNT). */
export function freshTag() {
  return { ...TAG_RECORD_DEFAULT };
}

/** `save.game.tags`, as an object that is safe to read. Never the caller's own reference to write into. */
export function tagsOf(save) {
  const g = isObj(save) && isObj(save.game) ? save.game : EMPTY;
  return isObj(g.tags) ? g.tags : EMPTY;
}

/** One normalised record for a KNOWN tag — a fresh default when the save has never touched it. */
export function recordOf(save, tag) {
  if (!known(tag)) return null;
  const raw = tagsOf(save)[tag];
  const r = freshTag();
  if (isObj(raw)) {
    r.resolved = nat(raw.resolved);
    r.triggered = nat(raw.triggered);
    r.days = Array.isArray(raw.days) ? raw.days.length : nat(raw.days);
    r.lastDay = isoOrNull(raw.lastDay);
    r.cleared = raw.cleared === true;
    r.sealed = raw.sealed === true;
  }
  return r;
}

/** Does this record satisfy the seal? (The no-re-trigger half is enforced by `trigger()` — see below.) */
export function sealsOn(record) {
  const r = isObj(record) ? record : EMPTY;
  return nat(r.resolved) >= SEAL.resolutions && nat(r.days) >= SEAL.distinctDays;
}

/** 'sealed' | 'cleared' | 'live' | 'untouched' — the cell's state, which is what the panel colours by. */
export function stateOf(record) {
  const r = isObj(record) ? record : EMPTY;
  if (r.sealed === true) return 'sealed';
  if (r.cleared === true) return 'cleared';
  return nat(r.triggered) > 0 ? 'live' : 'untouched';
}

/** True iff the tag is retired from the tell pool for good. */
export function isSealed(save, tag) {
  const r = recordOf(save, tag);
  return !!r && r.sealed === true;
}

/** Every sealed tag id, in catalogue order. This is the collection's score. */
export function sealedOf(save) {
  const t = tagsOf(save);
  return TAGS.filter((tag) => isObj(t[tag]) && t[tag].sealed === true);
}

/** True iff the tag is still paying a tell: triggered, not resolved, not sealed (G2). */
export function isLive(save, tag) {
  const r = recordOf(save, tag);
  return !!r && r.sealed !== true && r.cleared !== true && nat(r.triggered) > 0;
}

/** 1.00 or 1.25 — the `tell` factor of `postedFor`, straight out of `econ.tellFor` (J1 owns the number). */
export function tellMultiplierOf(save, tag) {
  return tellMultOf(recordOf(save, tag));
}

/* ------------------------------------------------------------------ writing, purely */

/** Shallow-copy `save` with a new `game.tags` map. Nothing else in the save is touched. */
function withTags(save, tags) {
  const s = isObj(save) ? save : {};
  const g = isObj(s.game) ? s.game : {};
  return { ...s, game: { ...g, tags } };
}

function result(extra) {
  return {
    ok: false, reason: null, tag: null, changed: false, sealed: false, justSealed: false,
    from: null, record: null, tags: EMPTY, save: null, ...extra,
  };
}

/**
 * The tag was triggered again — one miss carrying it (G2 "`tell` only pays while the fault is live").
 *
 * A trigger on an UNSEALED tag breaks the seal window: `resolved`, `days` and `lastDay` restart, which
 * is the machine form of G2's "with zero re-triggers in that window". `triggered` is a LIFETIME count
 * and never restarts — it is what `tellFor` ranks by. A trigger on a SEALED tag counts and nothing
 * else: sealing "retires it from the tell pool for good", so a sealed cell never re-opens.
 *
 * PURE. `res.save` is a new save; the one you passed in is untouched.
 *
 * @param {object} save
 * @param {string} tag one of the 68
 * @param {{day?: string|null}} [opts] accepted and ignored — a trigger needs no date, because `lastDay`
 *   records the last RESOLUTION day (see below). Callers may pass one for symmetry with `resolve`.
 */
export function trigger(save, tag, opts = {}) {
  if (!known(tag)) return result({ reason: REFUSALS.UNKNOWN_TAG, tag: typeof tag === 'string' ? tag : null, save });
  const from = recordOf(save, tag);
  const r = { ...from };
  r.triggered = from.triggered + 1;
  if (from.sealed !== true) {
    r.cleared = false;
    r.resolved = 0;
    r.days = 0;
    // `lastDay` is the last RESOLUTION day — the other half of `days` (G7's record is a count plus a
    // last date and nothing more). A broken window has no resolution days yet, so it clears with them.
    r.lastDay = null;
  }
  const tags = { ...tagsOf(save), [tag]: r };
  return result({
    ok: true, tag, from, record: r, tags, save: withTags(save, tags),
    changed: true, sealed: r.sealed === true,
  });
}

/**
 * Was the clear that is resolving this tag CLEAN? G2 seals on resolutions that were **clean**
 * ("resolved cleanly 3 times across 3 distinct days"), and G8's J7 row repeats it, so every other
 * clear — a hinted one, an attempt-2 one, an attempt-3 one — must advance NOTHING: not `resolved`,
 * not `days`, and not the retirement of the ×1.25 that G2 calls the best-paying thing in the game.
 *
 * Three sources, in this order:
 *
 *  1. `opts.clean` — the grader's own verdict, when the caller passes one. It always wins.
 *  2. The rung `state.js applyTarget` has already stamped on the live job record for the very target
 *     it is resolving for (`inProgress.game.last`, written two statements above its `resolve()` call).
 *     `RUNGS.CLEAN` is rung 0 — first try, zero hints — which is `xp.isClean()` exactly, so HINT1,
 *     ATT2 and ATT3 all read as not clean. `last.ok !== true` means the stamp is not a clear at all,
 *     so it cannot be this resolution's rung and is not read.
 *  3. Nothing to read — no live job, i.e. a direct module call, a migration, a unit test: clean. That
 *     is the lenient reading this module already shipped, so those callers see no change.
 *
 * (2) is a BRIDGE and it is deliberate. `state.js applyTarget` is the only caller of `resolve()` in
 * `site/js`; it gates its call on `cleared` (ANY clear) rather than on `clean`, and `state.js` is not
 * this lane's file to edit. Reading the stamp that caller has already written is the only way this
 * module can honour G2 from inside its own file, and it is strictly better than the `result.clean`
 * flag a caller might pass instead: `rung` is `rungOf(result)`, so a synthetic result that carries
 * `{cleared, firstTry, hints}` but no `clean` key still reads correctly. The invariant it rests on —
 * `last.rung` belongs to the target being resolved, i.e. it is stamped BEFORE the Fault Index block —
 * is asserted through the shipped machine in `tests/job-index.test.mjs` §2c, so a caller that ever
 * reorders those two statements fails a test instead of silently re-opening the hole. When the caller
 * does start passing `clean`, rule 1 takes over and this reads nothing.
 */
function resolvedCleanly(save, opts) {
  if (opts.clean === true) return true;
  if (opts.clean === false) return false;
  const live = isObj(save) && isObj(save.inProgress) ? save.inProgress.game : null;
  const last = isObj(live) && isObj(live.last) ? live.last : null;
  if (!last || last.ok !== true || typeof last.rung !== 'number' || !Number.isFinite(last.rung)) return true;
  return Math.trunc(last.rung) === RUNGS.CLEAN;
}

/**
 * The tag was resolved cleanly — the student met it again and got it right OUTRIGHT (G2). Sets
 * `cleared`, so `tellMultiplierOf` drops to 1.00 THE SAME TICK, counts the resolution, and seals the
 * tag on the third clean resolution that falls on a third distinct day.
 *
 * `opts.day` is required to move `days`. With no day the resolution still counts and still clears the
 * tell, but the seal cannot advance and `reason` says `no-day` — callers pass `days.todayISO()`.
 *
 * A clear that was NOT clean counts for nothing: the record is left exactly as it was, `changed` is
 * false, `reason` is `not-clean`, and the fault stays live at ×1.25 until it is met and beaten
 * outright. `resolvedCleanly()` above is how that is decided — `opts.clean` when the caller passes it,
 * otherwise the rung the state machine stamped for this target.
 *
 * PURE.
 */
export function resolve(save, tag, opts = {}) {
  if (!known(tag)) return result({ reason: REFUSALS.UNKNOWN_TAG, tag: typeof tag === 'string' ? tag : null, save });
  const from = recordOf(save, tag);
  if (from.sealed === true) {
    return result({ ok: true, reason: REFUSALS.SEALED, tag, from, record: from, tags: tagsOf(save), save: isObj(save) ? save : null, sealed: true });
  }
  if (!resolvedCleanly(save, opts)) {
    return result({ ok: true, reason: REFUSALS.NOT_CLEAN, tag, from, record: from, tags: tagsOf(save), save: isObj(save) ? save : null });
  }
  const day = isoOrNull(opts.day);
  const r = { ...from };
  r.cleared = true;
  r.resolved = from.resolved + 1;
  if (day && day !== from.lastDay) { r.days = from.days + 1; r.lastDay = day; }
  const justSealed = sealsOn(r);
  if (justSealed) r.sealed = true;
  const tags = { ...tagsOf(save), [tag]: r };
  return result({
    ok: true, reason: day ? null : REFUSALS.NO_DAY, tag, from, record: r, tags,
    save: withTags(save, tags), changed: true, sealed: r.sealed === true, justSealed,
  });
}

/** The debrief's one dry line for a tag that sealed this tick (`COPY.sealed`). */
export function sealedLine(tag) {
  return COPY.sealed({ tag });
}

/* ------------------------------------------------------------------ the rollup Stats draws */

/** One cell: the catalogue entry, its record, its state and its wing. */
function cellOf(save, tag) {
  const e = lookup(tag);
  const record = recordOf(save, tag);
  return {
    tag, title: e.title, fix: e.fix, area: e.area,
    wing: wingOfTag(tag),
    resolved: record.resolved, triggered: record.triggered, days: record.days,
    lastDay: record.lastDay, cleared: record.cleared, sealed: record.sealed,
    state: stateOf(record),
    tell: tellMultOf(record),
    record,
  };
}

/**
 * areaRollup(save) → all 11 AREAS, in `data/misconceptions.js`'s own order, each carrying EVERY one of
 * its tags — including the ones the save has never seen, because the Fault Index is a collection of 68
 * and an empty cell is part of the picture (G2, G5 #5). `Σ area.tags.length === 68` always.
 *
 * `opts.sort`: 'catalogue' (default — a stable grid that does not reshuffle under the student) or
 * 'triggered' (most-triggered first, then catalogue order).
 */
export function areaRollup(save, opts = {}) {
  const byArea = new Map(AREAS.map((a) => [a.id, []]));
  for (const tag of TAGS) {
    const cell = cellOf(save, tag);
    (byArea.get(cell.area) ?? byArea.get('general')).push(cell);
  }
  const sortBy = opts.sort === 'triggered'
    ? (x, y) => y.triggered - x.triggered || ORDER[x.tag] - ORDER[y.tag]
    : (x, y) => ORDER[x.tag] - ORDER[y.tag];
  return AREAS.map((a) => {
    const tags = byArea.get(a.id).sort(sortBy);
    const count = (state) => tags.filter((c) => c.state === state).length;
    return {
      id: a.id,
      label: a.label,
      wing: wingOfTag(tags[0] ? tags[0].tag : null),
      total: tags.length,
      sealed: count('sealed'),
      cleared: count('cleared'),
      live: count('live'),
      untouched: count('untouched'),
      triggered: tags.reduce((t, c) => t + c.triggered, 0),
      resolutions: tags.reduce((t, c) => t + c.resolved, 0),
      tags,
    };
  });
}

/** The collection's headline numbers — what the panel's header and the two milestones read. */
export function indexProgress(save) {
  let sealed = 0, cleared = 0, live = 0, triggered = 0, resolutions = 0;
  for (const tag of TAGS) {
    const r = recordOf(save, tag);
    const st = stateOf(r);
    if (st === 'sealed') sealed++;
    else if (st === 'cleared') cleared++;
    else if (st === 'live') live++;
    triggered += r.triggered;
    resolutions += r.resolved;
  }
  const total = TAG_COUNT;
  return {
    sealed, cleared, live, untouched: total - sealed - cleared - live,
    touched: sealed + cleared + live, triggered, resolutions,
    total, pct: total ? sealed / total : 0,
    milestones: MILESTONES.map((need) => ({ need, have: Math.min(need, sealed), met: sealed >= need })),
    complete: sealed >= total,
  };
}

/* ------------------------------------------------------------------ the tell */

/** id → skill-id list, from whatever index the caller holds. Mirrors `call.js`'s own resolver. */
function skillsResolver(index, fallback) {
  if (typeof index === 'function') return (id) => skillList(index(id));
  if (index instanceof Map) return (id) => skillList(index.get(id));
  if (Array.isArray(index)) {
    const idx = new Map();
    for (const c of index) if (c && typeof c.id === 'string') idx.set(c.id, c);
    return (id) => skillList(idx.get(id));
  }
  if (isObj(index)) return (id) => skillList(index[id]);
  return typeof fallback === 'function' ? fallback : () => [];
}

function skillList(v) {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x);
  if (isObj(v) && Array.isArray(v.skills)) return v.skills.filter((x) => typeof x === 'string' && x);
  return [];
}

/** The template id behind an error line: the `template` field, or the `T-xxx#seed` item id. */
function templateOf(entry) {
  const tpl = typeof entry.template === 'string' && entry.template ? entry.template : null;
  if (tpl) return tpl;
  const item = typeof entry.item === 'string' ? entry.item : '';
  return item.startsWith('T-') ? item.split('#')[0] : null;
}

/**
 * Which makes one line of `save.errors` belongs to. Sources, in priority order:
 *   1. the entry's own `skills` / `skill` (nothing writes these today; honoured if anything ever does)
 *   2. `opts.cards`   — an id→card / id→skills index: `byId` from data/cards.js, a Map, an array, or a fn
 *   3. `opts.templates` — the same, for generated items, keyed by template id
 *   4. `save.cards[id].skills` / `save.variants[tpl].skills`, when the save happens to carry them
 * An entry nothing can name contributes to nothing — never to a guess.
 */
function makesOfEntry(entry, cardsOf, templatesOf) {
  const own = skillList(entry.skills ?? entry.skill);
  if (own.length) return own;
  const item = typeof entry.item === 'string' ? entry.item : '';
  const tpl = templateOf(entry);
  const out = [];
  for (const s of cardsOf(item)) out.push(s);
  if (!out.length && typeof entry.forCard === 'string' && entry.forCard) for (const s of cardsOf(entry.forCard)) out.push(s);
  if (!out.length && tpl) for (const s of templatesOf(tpl)) out.push(s);
  return out;
}

/**
 * tellDetail(save, skillId, opts) — the whole computation behind the envelope's `tell:` line.
 *
 * Counts, out of `save.errors` ALONE, how often each of the 68 tags has been triggered ON THIS MAKE,
 * drops every SEALED tag, and returns the most-triggered survivor: a live fault if the make has one,
 * otherwise a resolved-but-unsealed tag at 1.00, which is the only road to resolutions 2 and 3 (see
 * the header). Ties break by the most recent trigger, then by catalogue order — deterministic, and
 * with no random number anywhere.
 *
 * `opts.cards` / `opts.templates` are the id→skills lookups (see `makesOfEntry`); `opts.primaryOnly`
 * restricts attribution to `skills[0]`, the make the composer labels an item with.
 *
 * @returns {{tag: string|null, record: object|null, triggered: number, lastAt: number|null,
 *            candidates: Array<{tag, triggered, lastAt, live}>, scanned: number, attributed: number,
 *            source: 'errors'|'none'|'no-index'}}
 */
export function tellDetail(save, skillId, opts = {}) {
  const want = typeof skillId === 'string' ? skillId : null;
  const cardsOf = skillsResolver(opts.cards, (id) => skillList(isObj(save) && isObj(save.cards) ? save.cards[id] : null));
  const templatesOf = skillsResolver(opts.templates, (id) => skillList(isObj(save) && isObj(save.variants) ? save.variants[id] : null));
  const errors = isObj(save) && Array.isArray(save.errors) ? save.errors : [];

  const counts = new Map();     // tag → {triggered, lastAt}
  let scanned = 0, attributed = 0;
  for (const e of errors) {
    if (!isObj(e)) continue;
    scanned++;
    const makes = makesOfEntry(e, cardsOf, templatesOf);
    if (!makes.length) continue;
    attributed++;
    if (!want) continue;
    const hit = opts.primaryOnly ? makes[0] === want : makes.includes(want);
    if (!hit) continue;
    const at = Number.isFinite(e.t) ? e.t : null;
    for (const tag of (Array.isArray(e.tags) ? e.tags : [])) {
      if (!known(tag)) continue;
      const row = counts.get(tag) ?? { triggered: 0, lastAt: null };
      row.triggered++;
      if (at != null && (row.lastAt == null || at > row.lastAt)) row.lastAt = at;
      counts.set(tag, row);
    }
  }

  // SEALED tags are gone for good. A cleared-but-unsealed one stays, ranked behind every live tag,
  // because `state.applyTarget` resolves the tag the tell names and a seal needs three of those: drop
  // it here and resolution #2 is unreachable (see the header). It is priced at 1.00 by `econ.tellFor`,
  // and it can never displace a live tag, so offering it moves no payout.
  const candidates = [...counts.entries()]
    .map(([tag, row]) => {
      const r = recordOf(save, tag);
      return { tag, triggered: row.triggered, lastAt: row.lastAt, live: r.cleared !== true, sealed: r.sealed === true };
    })
    .filter((c) => !c.sealed)
    .map(({ tag, triggered, lastAt, live }) => ({ tag, triggered, lastAt, live }))
    .sort((a, b) => Number(b.live) - Number(a.live)
      || b.triggered - a.triggered
      || (b.lastAt ?? -Infinity) - (a.lastAt ?? -Infinity)
      || ORDER[a.tag] - ORDER[b.tag]);

  const source = candidates.length ? 'errors' : (scanned > 0 && attributed === 0 ? 'no-index' : 'none');
  const top = candidates[0] ?? null;
  // The record handed back carries the PER-MAKE trigger count out of the error log, not the index's
  // own lifetime one: the tell is "this make's most-triggered unsealed unresolved tag" (G4), and it is
  // live the moment the graders have logged it — the index record exists to say whether it has been
  // RESOLVED or SEALED since. That is exactly the triple `econ.tellFor` reads.
  const rec = top
    ? { ...recordOf(save, top.tag), triggered: Math.max(recordOf(save, top.tag).triggered, top.triggered) }
    : null;
  return {
    tag: top ? top.tag : null,
    // `live` says which of the two kinds of tell this is: a live fault paying ×1.25, or a resolved,
    // unsealed one riding at 1.00 so the next clean clear can carry it a day closer to its seal.
    record: top ? { ...rec, tag: top.tag, live: top.live, title: lookup(top.tag).title, fix: lookup(top.tag).fix, area: areaOfTag(top.tag), wing: wingOfTag(top.tag, want) } : null,
    triggered: top ? top.triggered : 0,
    lastAt: top ? top.lastAt : null,
    candidates, scanned, attributed, source,
  };
}

/**
 * tellFor(save, skillId, opts) → the make's live tell, or `null`.
 *
 * The record it returns carries `{triggered, cleared, sealed}`, which is exactly what `econ.tellFor`
 * reads, so J5's board can hand it straight through:
 *   postBoard(save, today, { tellFor: (skillId) => tellFor(save, skillId, { cards: byId }) })
 */
export function tellFor(save, skillId, opts = {}) {
  return tellDetail(save, skillId, opts).record;
}

/**
 * THE `tellFor` HOOK `board.postBoard` takes — the single definition of it (integration, from
 * notes/J7.md §7 and notes/J13.md Request 2). Every surface that posts a board must pass the SAME
 * hook or it prints a posted value another surface will re-price: `screens/job.js` and
 * `screens/home.js` both call this. Never throws: a board that cannot read the index posts at the
 * no-tell price rather than not posting at all.
 *
 * `cards` is the card index (`data/cards.js` `byId`) the caller already holds — this module does not
 * import it, so the hook costs its callers nothing they were not already paying.
 */
export const tellHookFor = (save, opts = {}) => (skillId) => {
  try { return tellFor(save, skillId, opts); } catch { return null; }
};

/** The tell for every one of the 19 makes at once — `{ [skillId]: record|null }`, in table order. */
export function tellsFor(save, opts = {}) {
  const out = {};
  for (const id of SKILL_IDS) out[id] = tellFor(save, id, opts);
  return out;
}

/** The make's student-facing name, for the envelope line (`COPY.envelope`). */
export function makeName(skillId) {
  const s = skillById[skillId];
  return s ? s.name : String(skillId ?? '');
}

/* ------------------------------------------------------------------ Backchecks (G2, G3.7 #10) */

/**
 * A Backcheck shields the STAKE and only the stake: on a miss the chain holds and LOOSE is not taken.
 * It does not change the answer, the bucket drop, the mastery hit, the error-log entry, the Rematch, or
 * the `calls[]` entry the rating window reads (G12 #26). `econ.settle({shielded: true})` is the stake
 * half; the caller still writes the SAME `call.callEntry(...)` it would write for an unshielded miss.
 */
export function backchecksOf(save) {
  const g = isObj(save) && isObj(save.game) ? save.game : EMPTY;
  const b = isObj(g.backchecks) ? g.backchecks : EMPTY;
  return { held: Math.min(BACKCHECK.max, nat(b.held)), mintedDay: isoOrNull(b.mintedDay), max: BACKCHECK.max };
}

function withBackchecks(save, backchecks) {
  const s = isObj(save) ? save : {};
  const g = isObj(s.game) ? s.game : {};
  return { ...s, game: { ...g, backchecks } };
}

/** May one be spent right now? Not on the vault (G2), and only if one is held. */
export function canSpend(save, ctx = {}) {
  const { held } = backchecksOf(save);
  if (ctx.vault === true && BACKCHECK.allowedOnVault !== true) return { ok: false, reason: REFUSALS.ON_VAULT, held };
  if (held < 1) return { ok: false, reason: REFUSALS.NONE_HELD, held };
  return { ok: true, reason: null, held };
}

/**
 * Spend one. PURE — returns a new save. The caller shields the stake with `econ.settle({shielded:true})`
 * and writes the rating entry regardless; this function moves the counter and nothing else.
 */
export function spend(save, ctx = {}) {
  const check = canSpend(save, ctx);
  const b = backchecksOf(save);
  if (!check.ok) return { ok: false, reason: check.reason, held: b.held, from: b.held, changed: false, save: isObj(save) ? save : null };
  const backchecks = { held: b.held - 1, mintedDay: b.mintedDay };
  return { ok: true, reason: null, held: backchecks.held, from: b.held, changed: true, save: withBackchecks(save, backchecks) };
}

/**
 * The day's mint (G2, G12 #38): 1 per day for a day on which `dues ≥ 1` and every one of them was
 * cleared — a day with zero dues mints nothing — or 1 per vault cracked with no Backcheck spent. Cap 3
 * held, cap 1 minted per day, whichever the source.
 *
 * PURE. `ctx = { day, dues, duesCleared, vault, spentOnVault }`; `day` is an ISO string, never a clock.
 */
export function canMint(save, ctx = {}) {
  const b = backchecksOf(save);
  const day = isoOrNull(ctx.day);
  if (b.held >= BACKCHECK.max) return { ok: false, reason: REFUSALS.AT_CAP, held: b.held };
  if (day && b.mintedDay === day) return { ok: false, reason: REFUSALS.ALREADY_MINTED, held: b.held };
  if (ctx.vault === true) {
    return ctx.spentOnVault === true
      ? { ok: false, reason: REFUSALS.DUES_OPEN, held: b.held }
      : { ok: true, reason: null, held: b.held, source: 'vault' };
  }
  const dues = nat(ctx.dues);
  if (dues < BACKCHECK.requiresDuesAtLeast) return { ok: false, reason: REFUSALS.NO_DUES, held: b.held };
  const cleared = ctx.duesCleared === true || nat(ctx.duesCleared) >= dues;
  if (BACKCHECK.requiresAllDuesCleared && !cleared) return { ok: false, reason: REFUSALS.DUES_OPEN, held: b.held };
  return { ok: true, reason: null, held: b.held, source: 'dues' };
}

/** Mint the day's Backcheck if the rule allows it. PURE — returns a new save when it does. */
export function mint(save, ctx = {}) {
  const check = canMint(save, ctx);
  const b = backchecksOf(save);
  if (!check.ok) return { ok: false, reason: check.reason, held: b.held, from: b.held, changed: false, source: null, save: isObj(save) ? save : null };
  const backchecks = { held: Math.min(BACKCHECK.max, b.held + BACKCHECK.mintPerDay), mintedDay: isoOrNull(ctx.day) ?? b.mintedDay };
  return { ok: true, reason: null, held: backchecks.held, from: b.held, changed: true, source: check.source, save: withBackchecks(save, backchecks) };
}

/* ------------------------------------------------------------------ the cap, for J10's budget */

/** The index never grows past 68 records; a save carrying more is trimmed in catalogue order. */
export function capTags(tags) {
  const src = isObj(tags) ? tags : EMPTY;
  const out = {};
  let n = 0;
  for (const tag of TAGS) {
    if (!isObj(src[tag])) continue;
    if (n >= CAPS.tags) break;
    out[tag] = src[tag];
    n++;
  }
  return out;
}

export default {
  TAGS, TAG_COUNT, AREAS, AREA_IDS, SEAL, MILESTONES, STATES, REFUSALS,
  freshTag, tagsOf, recordOf, sealsOn, stateOf, isSealed, sealedOf, isLive, tellMultiplierOf,
  trigger, resolve, sealedLine, areaRollup, indexProgress,
  tellFor, tellDetail, tellsFor, makeName,
  backchecksOf, canSpend, spend, canMint, mint, capTags,
};
