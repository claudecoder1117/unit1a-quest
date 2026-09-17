// screens/boss.js — the Boss screen (COMPOSED S8 #12; S1 glossary "Boss — a 6-item run with 3 hearts
// ending on an elite original"; S2 boss table; S3 "Boss seed cyrb53(boss|attempt)" + the B4 equation
// rule; S4 "Hearts" and "Bosses"; S5 motion; S9 "nothing rushes thinking").
//
//   mountBoss(params, query)               → (el) => cleanup        route handler for `#/boss/:id`
//   createBossRun(host, bossId, opts)      → { el, destroy(), state }
//   composeBoss(bossId, seed, T)           → { boss, seed, slots }  PURE (tests/boss.test.mjs)
//   prepareItem(raw, boss) · checkQuestion(item, seed) · missLine(item, tags) · recordBossRun(save, run)
//
// The run: 5 Variants drawn from the boss's own modules (tier 2–4 where the module has such a template,
// every boss skill that HAS a template covered at least once) + the elite original last. 3 hearts, no
// hints, no cap timer and no visible clock — par and splits appear after the fact. One submit = one
// heart (S1); `almost` / `malformed` are free and never charge. B4's `equation` slot is required (a
// wrong or blank setup costs no heart but forfeits flawless and the +300); every other boss drops the
// optional setup slot from its items, because S3 makes it required in B4 and nowhere else.
// 0 hearts → CONTINUE?: the worked solution of the item that killed you plus a one-tap check question
// about it buys one heart back and flags the run `*` (never PB-, never flawless-eligible). Decline →
// knocked out: XP, mastery and tiles are kept (every item wrote them as it finished), the stamp is not.
// A miss names the skill in words with a Drill 5 link. RETRY SAME SEED replays the identical six items;
// on a same-seed re-run the per-item splits are compared against the ghost. Boss XP once per seed (S4).
//
// Import-safe in Node: no DOM at module scope, and the generator registry is imported lazily (the shell
// boots without the 15 generator modules, exactly as screens/card.js does).

import { bus, h } from '../app.js';
import { getState, update, flush, markStreakDay } from '../store.js';
import { todayISO } from '../days.js';
import { bosses, bossById, moduleById } from '../../data/modules.js';
import { getCard } from '../../data/cards.js';
import { skillById } from '../../data/skills.js';
import { lookup as lookupTag } from '../../data/misconceptions.js';
import { cyrb53, seedTag, rngFrom } from '../rng.js';
import { mathfmt } from '../mathfmt.js';
import { isMastered, MOCK_MISS_M } from '../mastery.js';
import { createCardView, session, setCombo, fmtClock } from './card.js';

/* ------------------------------------------------------------------ constants */

export const HEARTS = 3;
export const BOSS_XP = 150;            // S4: "Win = module Boss stamp + 150 XP"
export const FLAWLESS_XP = 300;        // S4: "flawless (3 hearts, no `*`) = +300 + trophy"
export const CONTINUE_HEARTS = 1;      // S4 Hearts: a passed check question buys ONE heart back
const AUTOSAVE_MS = 5000;              // S6: "5 s autosave inside Mock/Boss + flush on visibilitychange"

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const reduceMotion = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : true);

/* ------------------------------------------------------------------ lazy registry */

let tplP = null;
/** The generator registry, imported on first use (the shell's first paint must not pull js/gen/*). */
export function loadTemplates() {
  if (!tplP) tplP = import('../../data/templates.js');
  return tplP;
}

/* ------------------------------------------------------------------ seeds */

/** S3: the Boss seed is `cyrb53(boss|attempt)`; six hex characters is what the corner of a card shows. */
export function bossSeed(bossId, attempt = 1) {
  return seedTag(cyrb53(`${bossId}|${attempt}`) >>> 0);
}

/** The run record's kind (`boss:B4`) — trophies.js `bossOf()` reads exactly this shape. */
export const runKind = (bossId) => `boss:${bossId}`;

/** Every finished run of one boss, oldest first. */
export function bossRuns(save, bossId, { seed = null } = {}) {
  const runs = Array.isArray(save?.runs) ? save.runs : [];
  return runs.filter((r) => isObj(r) && r.kind === runKind(bossId) && (seed == null || r.seed === seed));
}

/** The next attempt number for a boss (1 on a fresh save) — feeds `bossSeed` for "RETRY (new seed)". */
export function nextAttempt(save, bossId) {
  let max = 0;
  for (const r of bossRuns(save, bossId)) max = Math.max(max, num(r.attempt, 0));
  return Math.max(max + 1, bossRuns(save, bossId).length + 1);
}

/* ------------------------------------------------------------------ composition (S2 + S4) */

/** ms → a signed split string (`+4.2s` / `−1.8s`). */
export function fmtDelta(ms) {
  if (!Number.isFinite(ms)) return '';
  const s = Math.abs(ms) / 1000;
  const body = `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  return (ms < 0 ? '−' : '+') + body;
}

const tierOf = (x) => Math.min(4, Math.max(1, Math.floor(num(x?.tier, 1))));

/**
 * composeBoss(bossId, seed, T) → { boss, seed, slots } — PURE and deterministic in (bossId, seed).
 * `T` is the `data/templates.js` module namespace (injected so this file stays importable without it).
 *
 * slots: five Variant/original slots then the elite original, each
 *   { n, kind:'variant'|'card', template?, params?, seed?, id?, skill, tier, elite }
 *
 * Rules (S2 "Bosses", S4 "Bosses (7, S2)"):
 *   • an explicit `pool` (B7) wins — its counts are trimmed to the five slots, never below one of each,
 *     so The Triangle is never six near-identical midpoint problems;
 *   • `extra` asks (B2's one pairs item) are placed first and count against the five;
 *   • otherwise the candidates are the boss's own modules' templates: every boss skill that HAS such a
 *     template is covered once (a template whose PRIMARY skill it is, when one exists), then the rest of
 *     the slots go to the least-used candidate of tier ≥ 2 (tier 2–4; the tier floor is dropped only
 *     when a module has nothing above tier 1, because covering the skill matters more — B1's VOC/CLASS);
 *   • a module with no generator at all (M9) falls back to its own Original Set, elite excluded;
 *   • the five are ordered by tier ascending, so a boss never opens on its hardest item.
 */
export function composeBoss(bossId, seed, T) {
  const boss = bossById[bossId];
  if (!boss || !T) return null;
  const rng = rngFrom('boss', bossId, String(seed ?? ''));
  const want = Math.max(1, num(boss.variants, 5));
  const entry = (id) => T.getTemplate(id) || null;
  const picks = [];                                  // { template, params } | { card }

  if (boss.pool.length) {
    const groups = boss.pool
      .map((p) => ({ template: p.template, params: { ...(p.params || {}) }, count: Math.max(1, Math.floor(num(p.count, 1))) }))
      .filter((g) => entry(g.template));
    let total = groups.reduce((n, g) => n + g.count, 0);
    while (total > want && groups.length) {          // trim the widest group first, never below one
      const shrinkable = groups.filter((g) => g.count > 1);
      const g = rng.pick(shrinkable.length ? shrinkable : groups);
      if (g.count <= 1 && shrinkable.length === 0) break;
      g.count -= 1; total -= 1;
    }
    while (total < want && groups.length) { rng.pick(groups).count += 1; total += 1; }
    for (const g of groups) for (let i = 0; i < g.count; i++) picks.push({ template: g.template, params: g.params });
  } else {
    for (const ex of boss.extra) {
      if (!entry(ex.template)) continue;
      for (let i = 0; i < Math.max(1, Math.floor(num(ex.count, 1))); i++) {
        if (picks.length < want) picks.push({ template: ex.template, params: { ...(ex.params || {}) } });
      }
    }
    const cand = [];
    const seen = new Set();
    for (const mid of boss.modules) {
      for (const tid of moduleById[mid]?.templates ?? []) {
        const e = entry(tid);
        if (e && !seen.has(tid)) { seen.add(tid); cand.push(e); }
      }
    }
    const covered = (sk) => picks.some((p) => p.template && (entry(p.template)?.skills ?? []).includes(sk));
    for (const sk of boss.skills) {
      if (picks.length >= want) break;
      if (covered(sk)) continue;
      const primary = cand.filter((e) => (e.skills ?? [])[0] === sk);
      const any = cand.filter((e) => (e.skills ?? []).includes(sk));
      const pool = primary.length ? primary : any;
      if (!pool.length) continue;                    // a skill with no generator (B2's ASN-*) — see below
      picks.push({ template: rng.pick(pool).id, params: {} });
    }
    while (picks.length < want && cand.length) {
      const counts = new Map();
      for (const p of picks) if (p.template) counts.set(p.template, (counts.get(p.template) || 0) + 1);
      const tiered = cand.filter((e) => tierOf(e) >= 2);
      const from = tiered.length ? tiered : cand;
      const min = Math.min(...from.map((e) => counts.get(e.id) || 0));
      const least = from.filter((e) => (counts.get(e.id) || 0) === min);
      picks.push({ template: rng.pick(least).id, params: {} });
    }
    if (picks.length < want) {                       // no generator for this module (M9): its own set
      const originals = boss.modules
        .flatMap((mid) => moduleById[mid]?.originals ?? [])
        .filter((id) => id !== boss.elite && getCard(id));
      for (const id of rng.shuffle(originals)) {
        if (picks.length >= want) break;
        if (picks.some((p) => p.card === id)) continue;
        picks.push({ card: id });
      }
    }
  }

  const slots = picks.map((p, i) => {
    const itemSeed = `${seed}#${i + 1}`;
    if (p.card) {
      const c = getCard(p.card);
      return { kind: 'card', id: p.card, seed: itemSeed, skill: (c?.skills ?? [])[0] ?? null, tier: tierOf(c), label: p.card, elite: false };
    }
    const e = entry(p.template);
    return {
      kind: 'variant', template: p.template, params: p.params || {}, seed: itemSeed,
      skill: (e?.skills ?? [])[0] ?? null, tier: tierOf(e), label: e?.label || p.template, elite: false,
    };
  });
  slots.sort((a, b) => a.tier - b.tier);             // Array#sort is stable: the draw order breaks ties

  const eliteCard = getCard(boss.elite);
  slots.push({
    kind: 'card', id: boss.elite, seed: `${seed}#elite`, skill: (eliteCard?.skills ?? [])[0] ?? null,
    tier: tierOf(eliteCard), label: boss.elite, elite: true,
  });
  slots.forEach((s, i) => { s.n = i + 1; });

  return { boss, seed: String(seed ?? ''), slots };
}

/**
 * prepareItem(raw, boss) → the item the Card engine mounts.
 * S3: the `equation` setup slot is "optional only on Cards" and REQUIRED in Boss B4. So B4 forces
 * `optional:false` on every equation part (the widget then shows no "Skip setup" button, because
 * `ctx.boss` is set too) and every other boss drops the slot instead of showing a box that cannot be
 * skipped and does not have to be answered. Never mutates the source card/item.
 */
export function prepareItem(raw, boss) {
  if (!raw || !Array.isArray(raw.parts)) return raw;
  const required = !!boss?.equationRequired;
  const parts = [];
  for (const p of raw.parts) {
    if (p && p.type === 'equation' && p.optional !== false) {
      if (required) parts.push({ ...p, optional: false });
      continue;
    }
    parts.push(p);
  }
  if (!parts.length) return raw;                     // an item that is nothing but a setup stays whole
  return { ...raw, parts };
}

/** The ids of an item's equation parts — a wrong one costs no heart in B4 (S3). */
export function equationPartIds(item) {
  const out = new Set();
  for (const p of item?.parts ?? []) if (p && p.type === 'equation') out.add(p.id ?? null);
  return out;
}

/* ------------------------------------------------------------------ the miss line (S4) */

/**
 * One sentence per skill, in words, for the moment of the miss — S4's own example is
 * "You still confuse vertical with linear pairs". Each line names the skill and says what it wants;
 * a catalogued misconception tag is more specific still and wins when the grader returned one.
 */
export const SKILL_MISS = Object.freeze({
  VOC: 'Vocabulary: the definition decides it, not what the picture looks like.',
  NOTE: 'Notation: the symbol says which object it is — ray, segment, line, or a measure.',
  CLASS: 'Angle types: the number decides the bucket, and 90 and 180 are exactly one each.',
  CSARITH: 'Complement and supplement: 90 − x and 180 − x, taken in the order the sentence says.',
  PAIRS: 'Pairs in a figure: vertical angles and a linear pair are not the same thing.',
  'ASN-PLP': 'Always / Sometimes / Never on points, lines and planes: one counterexample settles it.',
  'ASN-ANG': 'Always / Sometimes / Never on angles: try 45 and 45, then try 40 and 60.',
  'CS-LIN': 'Word problems, linear: write the sentence as one equation before you solve anything.',
  'CS-RATIO': 'Ratio word problems: the parts add to 180 or to 90 before anything else happens.',
  'CS-QUAD': 'Product word problems: the setup is a quadratic, and both roots have to be checked.',
  SYS: 'Systems: two equations, two unknowns — eliminate one variable, then solve.',
  'FIG-ALG': 'Diagram algebra: name the relationship in the figure before writing the equation.',
  'BISECT-L': 'Does it bisect: solve for x first, then compare the two halves.',
  'BISECT-Q': 'Two cases: every root gets its own verdict, and both have to be stated.',
  'SEG-ALG': 'Midpoint triangle: the tick marks tell you which segments are equal.',
  FAC1: 'Factoring with a = 1: two numbers that multiply to c and add to b.',
  FAC2: 'Factoring with a > 1: multiply a·c, split the middle term, then group.',
  'QUAD-SOLVE': 'Solve by factoring: set each factor to 0 — there are two roots.',
  'QUAD-CTX': 'Reject the root: a length or an angle cannot be negative or zero, and you have to say why.',
});

/**
 * missLine(item, tags) → { text, skill, skillName, drill, title }
 * S4: "A miss names the skill in words at the moment of the miss … → link 'Drill 5: Pairs in a Figure'".
 * A catalogued misconception tag says it better than the skill name, so it wins when one is present.
 */
export function missLine(item, tags = []) {
  const skill = (item?.skills ?? []).find((s) => skillById[s]) ?? (item?.skills ?? [])[0] ?? null;
  const skillName = skill ? (skillById[skill]?.name ?? skill) : null;
  const drill = skill ? `#/run/drill/${skill}` : null;
  for (const t of Array.isArray(tags) ? tags : []) {
    const m = lookupTag(t);
    if (m && m.known) return { text: m.fix, title: m.title, skill, skillName, drill };
  }
  const fallback = skillName ? `That one is ${skillName}.` : 'That one is gone.';
  return { text: (skill && SKILL_MISS[skill]) || fallback, title: skillName, skill, skillName, drill };
}

/* ------------------------------------------------------------------ CONTINUE? (S4 Hearts) */

/**
 * checkQuestion(item, seed) → { prompt, options:[{text, ok}] } | null
 * The one-tap check question that buys a heart back: it can only be answered by someone who actually
 * read the worked solution. First move of the solution when there are steps to choose between,
 * otherwise the hint ladder's H1 (the "relationship" rung, S3). null → nothing to ask; the panel then
 * asks for a plain "I read it" tap rather than inventing a question.
 */
export function checkQuestion(item, seed = '') {
  const rng = rngFrom('boss-check', String(seed), String(item?.id ?? ''));
  const uniq = (list) => {
    const out = [];
    for (const t of list) { const s = String(t ?? '').trim(); if (s && !out.includes(s)) out.push(s); }
    return out;
  };
  const steps = uniq((item?.solution ?? []).map((s) => s?.say || s?.math || ''));
  const hints = uniq(item?.hints ?? []);
  let prompt = null, correct = null, decoys = [], kind = null, wrong = null;
  // r2: the first-move question was a giveaway (its options were the step headings printed 40 px above).
  // Ask for a VALUE the working arrives at instead — the last line of the form `x = 10` — with two decoy
  // values taken from the other numbers in the working (near-misses are fabricated when there are too few).
  const maths = uniq((item?.solution ?? []).map((s) => s?.math || '').filter((m) => !/\n/.test(m)));
  const valued = maths.map((m) => m.match(VALUE_LINE)).filter(Boolean);
  if (valued.length) {
    const hit = valued[valued.length - 1];
    const v = hit[1];
    const val = hit[2];
    const asNum = (s) => Number(String(s).replace(/−/g, '-'));
    const show = (n) => String(n).replace(/-/g, '−');
    const seen = new Set([asNum(val)]);
    const pool = [];
    for (const m of maths) {
      for (const n of m.match(/[−-]?\d+(?:\.\d+)?/g) ?? []) {
        const k = asNum(n);
        if (!Number.isFinite(k) || seen.has(k)) continue;
        seen.add(k); pool.push(show(n));
      }
    }
    const picks = rng.shuffle(pool).slice(0, 2);
    const kv = asNum(val);
    for (const f of [kv * 2, kv + 10, kv - 10, kv + 1]) {          // only when the working has < 2 other numbers
      if (picks.length >= 2) break;
      if (!Number.isFinite(f) || seen.has(f)) continue;
      seen.add(f); picks.push(show(f));
    }
    kind = 'value';
    prompt = `In the solution you just read, what did ${v} come out as?`;
    correct = `${v} = ${val}`;
    decoys = picks.map((p) => `${v} = ${p}`);
    wrong = `Not that one — find the line where ${v} is solved, then pick again.`;
  } else if (steps.length >= 3) {
    kind = 'first';
    prompt = 'Which line is the FIRST move in the solution you just read?';
    correct = steps[0];
    decoys = steps.slice(1);
    wrong = 'Not that one — it is in the solution, but not the first move. Read it again and pick another.';
  } else if (hints.length >= 3) {
    kind = 'hint';
    prompt = 'Which line names the relationship this problem turns on?';
    correct = hints[0];
    decoys = hints.slice(1);
    wrong = 'Not that one — read the solution again and pick another.';
  } else {
    return null;
  }
  const options = rng.shuffle([{ text: correct, ok: true }, ...decoys.slice(0, 2).map((t) => ({ text: t, ok: false }))]);
  return { prompt, options, kind, wrong };
}

/** A solved-value line in a worked solution: `x = 10`, `n = 20`, `x = −8`, `x = 67.5` (a lone letter on the left). */
const VALUE_LINE = /^\s*([a-z])\s*=\s*([−-]?\d+(?:\.\d+)?)\s*°?\s*$/i;

/* ------------------------------------------------------------------ ghost + splits (S4) */

/**
 * ghostFor(save, bossId, seed) → the run the splits are compared against, or null.
 * S4: "Split deltas vs the ghost … only on same-seed re-runs" and "PB compared only on same-seed
 * retries". A `*` run is never the ghost (it was not run under boss rules).
 */
export function ghostFor(save, bossId, seed) {
  let best = null;
  for (const r of bossRuns(save, bossId, { seed })) {
    if (r.flagged === true || r.won !== true) continue;
    if (!Array.isArray(r.splits) || !r.splits.length) continue;
    const ms = num(r.submittedAt) - num(r.startedAt);
    if (!best || ms < num(best.submittedAt) - num(best.startedAt)) best = r;
  }
  return best;
}

/** The best per-item time ever recorded on this seed, per slot n (for the gold "best split" flash). */
export function bestSplits(save, bossId, seed) {
  const out = new Map();
  for (const r of bossRuns(save, bossId, { seed })) {
    if (r.flagged === true) continue;
    for (const s of Array.isArray(r.splits) ? r.splits : []) {
      if (!isObj(s) || !Number.isFinite(s.ms)) continue;
      const prev = out.get(s.n);
      if (prev == null || s.ms < prev) out.set(s.n, s.ms);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ mastery (S4) */

/** The subset of `ids` that is Mastered right now (snapshot it BEFORE the item is graded). */
export function masteredSet(save, ids = []) {
  const out = new Set();
  for (const id of ids) if (isMastered(save?.skills?.[id])) out.add(id);
  return out;
}

/**
 * S4: "A Mock or Boss miss on a Mastered skill drops `m` to 69 immediately."
 * Only ever lowers: the Card engine's own EMA may already have taken the skill below 69 on the first
 * wrong, and the harsher number is the honest one.
 */
export function applyBossMiss(save, ids = [], mastered = new Set()) {
  if (!isObj(save) || !isObj(save.skills)) return save;
  for (const id of ids) {
    if (!mastered.has(id)) continue;
    const rec = save.skills[id];
    if (!isObj(rec)) continue;
    if (num(rec.m) > MOCK_MISS_M) rec.m = MOCK_MISS_M;
  }
  return save;
}

/* ------------------------------------------------------------------ the run record (S6) */

/**
 * recordBossRun(save, run) → { record, xp, flawless, pb } — call INSIDE store.update().
 *
 * run: { bossId, seed, attempt, startedAt, submittedAt, hearts, flagged, setupMiss, won, ko, tabAway,
 *        items:[{ n, id, skill, tier, ok, credit, ms, raw, flagged }] }
 *
 * S4: win = +150, flawless (3 hearts, no `*`, and in B4 no missed setup) = +300 on top; "Mock/Boss XP
 * granted once per seed" — a second win on the same seed pays nothing. A `*` run never writes a PB.
 */
export function recordBossRun(save, run) {
  const bossId = run.bossId;
  const seed = String(run.seed ?? '');
  const startedAt = num(run.startedAt, Date.now());
  const submittedAt = num(run.submittedAt, Date.now());
  const ms = Math.max(0, submittedAt - startedAt);
  const items = (Array.isArray(run.items) ? run.items : []).map((it) => ({
    id: it.id ?? null, skill: it.skill ?? null, tier: num(it.tier, 1),
    raw: typeof it.raw === 'string' ? it.raw.slice(0, 200) : '',
    credit: Math.max(0, Math.min(1, num(it.credit, it.ok ? 1 : 0))),
    ms: Math.max(0, num(it.ms)), flagged: !!it.flagged, n: num(it.n, 0), clean: it.clean === true,
  }));
  const won = !!run.won;
  const flagged = !!run.flagged;
  const hearts = Math.max(0, Math.min(HEARTS, num(run.hearts)));
  const flawless = won && !flagged && !run.setupMiss && hearts === HEARTS;

  const already = bossRuns(save, bossId, { seed }).some((r) => r.xpAwarded === true);
  const xp = won && !already ? BOSS_XP + (flawless ? FLAWLESS_XP : 0) : 0;

  const prevBest = bossRuns(save, bossId, { seed })
    .filter((r) => r.won === true && r.flagged !== true)
    .reduce((best, r) => {
      const t = num(r.submittedAt) - num(r.startedAt);
      return best == null || t < best ? t : best;
    }, null);
  const pb = won && !flagged && (prevBest == null || ms < prevBest);

  const splits = items.filter((it) => it.n > 0).map((it) => ({ n: it.n, ms: it.ms, cum: 0 }));
  let acc = 0;
  for (const s of splits) { acc += s.ms; s.cum = acc; }
  if (isObj(run.ghost)) {
    const g = new Map((Array.isArray(run.ghost.splits) ? run.ghost.splits : []).map((s) => [s.n, s]));
    for (const s of splits) { const gs = g.get(s.n); if (gs && Number.isFinite(gs.cum)) s.delta = s.cum - gs.cum; }
  }

  const record = {
    kind: runKind(bossId), id: bossId, n: bossRuns(save, bossId).length + 1, attempt: num(run.attempt, 1),
    seed, startedAt, submittedAt, limitMs: null, tabAway: num(run.tabAway), status: 'done',
    items, score: items.filter((it) => it.credit >= 1).length, pred: null, splits,
    flagged, won, ko: !!run.ko, hearts, flawless, setupMiss: !!run.setupMiss, pb, xpAwarded: xp > 0, xp,
  };

  if (!Array.isArray(save.runs)) save.runs = [];
  save.runs.push(record);

  if (xp > 0) {
    const today = todayISO();
    save.xp = num(save.xp) + xp;
    const d = save.daily[today] ?? (save.daily[today] = { xp: 0, clears: 0, goalMet: false, mockDone: false });
    d.xp = num(d.xp) + xp;
    if (!d.goalMet && d.xp >= num(save.settings?.dailyGoal, 400)) { d.goalMet = true; markStreakDay(save, today); }
  }
  if (!isObj(save.counters)) save.counters = {};
  save.counters.bossRuns = num(save.counters.bossRuns) + 1;
  if (won) save.counters.bossWins = num(save.counters.bossWins) + 1;

  return { record, xp, flawless, pb };
}

/* ------------------------------------------------------------------ route handler */

function queryFlag(query, key) {
  const v = query?.get?.(key);
  return v != null && v !== '0' && v !== 'false';
}

/** `screens['/boss/:id']` */
export function mountBoss(params, query) {
  return (el) => {
    const run = createBossRun(el, params.id, {
      seed: query?.get?.('seed') || null,
      attempt: query?.get?.('attempt') ? Number(query.get('attempt')) : null,
      autostart: queryFlag(query, 'start'),
    });
    return () => run.destroy();
  };
}

/* ------------------------------------------------------------------ the run */

/**
 * createBossRun(host, bossId, opts) → { el, destroy, state }
 * opts: { seed, attempt, autostart, onFinish(record) }
 */
export function createBossRun(host, bossId, opts = {}) {
  const boss = bossById[bossId] ?? null;
  const root = h('section.screen.boss-screen', { dataset: { boss: bossId, phase: 'loading' } });
  host.append(root);

  if (!boss) {
    root.append(h('div.boss-panel',
      h('h1.boss-h1', 'No such boss'),
      h('p.muted', `“${bossId}” is not one of the seven (${bosses.map((b) => b.id).join(', ')}).`),
      h('p', h('a.btn', { href: '#/today' }, 'Back to Today'))));
    return { el: root, destroy: () => root.remove(), state: null };
  }

  const save0 = getState();
  const resumeRec = isObj(save0.inProgress) && save0.inProgress.kind === runKind(bossId) ? save0.inProgress : null;
  const attempt = Number.isFinite(opts.attempt) && opts.attempt > 0
    ? Math.floor(opts.attempt)
    : (opts.seed ? num(resumeRec?.attempt, 1) : num(resumeRec?.attempt, null) ?? nextAttempt(save0, bossId));
  const seed = String(opts.seed || resumeRec?.seed || bossSeed(bossId, attempt));
  const resumable = resumeRec && resumeRec.seed === seed && num(resumeRec.idx, 0) > 0 && num(resumeRec.idx, 0) < 6;

  const st = {
    boss, bossId, seed, attempt, slots: [], idx: 0, hearts: HEARTS, flagged: false, setupMiss: false,
    items: [], startedAt: Date.now(), itemAt: Date.now(), itemWrongs: 0, itemRecorded: false, mastered: new Set(),
    ko: false, done: false, destroyed: false, phase: 'intro', view: null, cur: null, curEq: new Set(),
    ghost: null, bests: new Map(), stash: null, tabAway: 0, T: null, record: null,
  };
  if (resumable) {                                   // so the intro shows the state you are walking back into
    st.hearts = Math.max(1, Math.min(HEARTS, num(resumeRec.hearts, HEARTS)));
    st.flagged = resumeRec.flagged === true;
  }

  /* ---- chrome ---- */
  const back = h('a.boss-back', { href: '#/today', 'aria-label': 'Leave the boss' }, '←');
  const title = h('div.boss-title', h('span.boss-id.mono', boss.id), h('h1.boss-name', boss.name));
  const hearts = h('div.boss-hearts', { role: 'img', 'aria-label': `${HEARTS} hearts` });
  const head = h('header.boss-head', back, title, hearts);
  const counter = h('span.boss-count.mono', '');
  const seedChip = h('span.boss-seed.mono.muted', `seed ${seed}`);
  const flagChip = h('span.boss-flag', { hidden: true, title: 'This run used CONTINUE — it cannot set a personal best or count as flawless.' }, '*');
  const splitChip = h('span.boss-split.mono', { hidden: true });
  const strip = h('div.boss-strip', counter, seedChip, flagChip, splitChip);
  const missBox = h('div.boss-miss', { hidden: true, role: 'status', 'aria-live': 'polite' });
  const stageHost = h('div.boss-stage');
  root.append(head, strip, missBox, stageHost);

  const cleanups = [];
  const on = (target, evt, fn) => { target.addEventListener(evt, fn); cleanups.push(() => target.removeEventListener(evt, fn)); };

  /* ---- combo (S4: "Boss and Mock never touch the combo") ---- */
  const combo0 = session.combo;
  const keepCombo = () => { if (session.combo !== combo0) setCombo(combo0); };

  function drawHearts() {
    hearts.replaceChildren();
    for (let i = 0; i < HEARTS; i++) {
      hearts.append(h('span.boss-heart', { dataset: { full: String(i < st.hearts) }, 'aria-hidden': 'true' }, '♥'));
    }
    hearts.setAttribute('aria-label', `${st.hearts} of ${HEARTS} hearts left`);
  }

  function drawStrip() {
    counter.textContent = st.phase === 'run' ? `Item ${st.idx + 1} of ${st.slots.length || 6}` : '';
    seedChip.hidden = st.phase === 'intro';          // the intro panel prints the seed with its ghost note
    flagChip.hidden = !st.flagged;
    root.dataset.phase = st.phase;
  }

  /** r1: the miss line lives in the dock (`.w-dock-body`, right above the key row and Submit) while a
   *  Card is mounted — that is where the student is looking when a heart goes — and at the top of the
   *  screen otherwise. The Card engine's dock.destroy() detaches its body, so re-home on every show. */
  function placeMiss() {
    const body = typeof document !== 'undefined' ? document.querySelector('#dock .w-dock-body') : null;
    if (body) { if (missBox.parentNode !== body) body.append(missBox); }
    else if (missBox.parentNode !== root) root.insertBefore(missBox, stageHost);
  }
  function showMiss(line, { heart = true, setup = false, extra = null } = {}) {
    placeMiss();
    missBox.classList.toggle('is-setup', setup);
    missBox.replaceChildren(...[
      h('p.boss-miss-line', heart == null ? null : h('strong', heart ? 'Heart lost. ' : 'No heart lost. '), line.text),
      extra,
      // r2: the skill name is a span so the collapsed (keyboard-open) dock row can show just "Drill 5"
      line.drill ? h('a.btn.btn-ghost.boss-drill', { href: line.drill, 'aria-label': `Drill 5: ${line.skillName}` }, 'Drill 5', h('span.boss-drill-skill', `: ${line.skillName}`)) : null,
    ].filter(Boolean));
    missBox.hidden = false;
    if (typeof document !== 'undefined' && stageHost.contains(document.activeElement)) keepInView(document.activeElement);
    missBox.classList.remove('is-in');
    if (!reduceMotion()) requestAnimationFrame(() => missBox.classList.add('is-in'));
    else missBox.classList.add('is-in');
  }
  const clearMiss = () => { missBox.hidden = true; missBox.classList.remove('is-setup'); missBox.replaceChildren(); };

  /** S5: the heart shatters — four shards, 300 ms, transform/opacity only. */
  function shatter(index) {
    const pip = hearts.children[index];
    if (!pip) return;
    pip.dataset.full = 'false';
    if (reduceMotion()) return;
    pip.classList.add('is-break');
    for (let i = 0; i < 4; i++) pip.append(h('span.boss-shard', { dataset: { i: String(i) }, 'aria-hidden': 'true' }));
    setTimeout(() => { if (pip.isConnected) { pip.classList.remove('is-break'); pip.querySelectorAll('.boss-shard').forEach((s) => s.remove()); } }, 340);
  }

  /* ---- progress (S6: inProgress + 5 s autosave + visibilitychange flush) ---- */
  function writeProgress() {
    if (st.destroyed || st.done || st.phase === 'intro') return;
    update((s) => {
      const stash = st.stash ?? (isObj(s.inProgress) && s.inProgress.kind === 'page' ? s.inProgress : null);
      st.stash = stash;
      s.inProgress = {
        kind: runKind(bossId), seed: st.seed, attempt: st.attempt, queue: null, idx: st.idx,
        hearts: st.hearts, xp: 0, startedAt: st.startedAt, flagged: st.flagged, setupMiss: st.setupMiss,
        items: st.items, stash,
      };
    });
  }
  function endProgress() {
    update((s) => { s.inProgress = st.stash && st.stash.kind === 'page' ? st.stash : null; });
    st.stash = null;
  }
  const autosave = setInterval(() => { try { writeProgress(); flush(); } catch { /* memory store */ } }, AUTOSAVE_MS);
  cleanups.push(() => clearInterval(autosave));
  if (typeof document !== 'undefined') {
    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') { st.tabAway += 1; try { writeProgress(); flush(); } catch { /* ignore */ } }
    });
  }

  /* ---- hearts: one submit = one heart (S1) ---- */
  cleanups.push(bus.on('card:wrong', (ev) => {
    if (st.destroyed || st.phase !== 'run' || !st.cur || !ev || ev.id !== st.cur.item.id) return;
    keepCombo();
    if (st.itemWrongs === 0) update((s) => applyBossMiss(s, st.cur.item.skills, st.mastered));
    st.itemWrongs += 1;
    const line = missLine(st.cur.item, ev.tags);
    if (st.curEq.has(ev.part)) {                     // S3: a wrong/blank B4 setup costs no heart …
      st.setupMiss = true;                           // … but forfeits flawless and the +300
      showMiss({ ...line, text: `${boss.name} grades the equation setup: the flawless bonus is gone, but the hearts are untouched.` }, { heart: false });
      return;
    }
    const before = st.hearts;
    st.hearts = Math.max(0, st.hearts - 1);
    drawHearts();                                    // r1: draw the new state FIRST — drawHearts() rebuilds the pips, …
    if (st.hearts < before) shatter(st.hearts);      // … so the shards must be appended to the pip that will stay
    showMiss(line);
    if (st.hearts === 0) setTimeout(() => offerContinue(), reduceMotion() ? 0 : 360);
  }));
  cleanups.push(bus.on('card:cleared', () => keepCombo()));
  cleanups.push(bus.on('card:solution', () => keepCombo()));

  /* ---- r1: a BLANK B4 setup is not a dead end (S3: "a wrong or blank setup costs no heart but forfeits
     flawless"). The engine grades an empty required box as `malformed` (free, no progress); here that
     offers an explicit way past it — skip the setup, keep the hearts, lose the flawless bonus. ---- */
  cleanups.push(bus.on('card:graded', (ev) => {
    if (st.destroyed || st.phase !== 'run' || !st.cur || !ev || ev.id !== st.cur.item.id) return;
    if (ev.kind !== 'malformed' || !st.curEq.has(ev.part)) return;
    const entry = (st.view?.state?.entries ?? []).find((e) => e.group?.id === ev.part && !e.finished);
    if (!entry) return;
    let raw = null;
    try { raw = entry.w?.raw?.(); } catch { raw = null; }
    if (String(raw ?? '').trim() !== '') return;     // a malformed attempt, not an empty one
    const skip = h('button.btn.btn-ghost.boss-skip-setup', { type: 'button' }, 'Skip the setup ', h('span.muted.fs-1', '(no heart · flawless gone)'));
    on(skip, 'click', () => skipSetup(entry));
    showMiss({ text: 'The setup box is empty — type the equation, or skip it and answer the question.' }, { heart: null, setup: true, extra: skip });
  }));
  function skipSetup(entry) {
    if (st.destroyed || st.phase !== 'run' || !st.view || entry.finished) return;
    entry.finished = true; entry.ok = false; entry.revealed = false; entry.skipped = true;
    entry.box.dataset.state = 'skipped';
    // r2: the widget's own skip() refuses in a boss (the slot is required), so the blank submit's
    // "! Type the equation." verdict and the amber field mark would survive the skip. Clear the verdict
    // and the field state, dim the box as skipped (widgets.css `[data-skipped]`) and say so in the hint.
    try { entry.w.clear?.(); } catch { /* proxy */ }
    const wroot = entry.w?.el ?? entry.body?.querySelector?.('.w-equation') ?? null;
    if (wroot) {
      wroot.dataset.skipped = 'true';
      wroot.dataset.kind = '';
      const hint = wroot.querySelector('.w-eq-hint');
      if (hint) { hint.dataset.kind = 'skipped'; hint.textContent = 'Setup skipped — no heart lost; the flawless bonus is gone.'; }
    }
    try { entry.w.lock(true); } catch { /* proxy */ }
    st.setupMiss = true;
    writeProgress();
    try { flush(); } catch { /* memory store */ }
    showMiss({ text: `Setup skipped: ${boss.name} grades the equation setup, so the flawless bonus is gone — the hearts are untouched.` }, { heart: false, setup: true });
    const next = (st.view.state?.entries ?? []).find((e) => !e.finished);
    if (next?.w?.focus) { try { next.w.focus(); } catch { /* not focusable */ } }
  }

  /* ---- r1: keep the focused answer box above the dock and below the sticky head (S9 #9: input + key
     row + Submit visible at 375 with the keyboard open). The Card engine auto-focuses the first box
     after its widgets land; `scrollTo(0, 0)` in mountItem has already run by then. ---- */
  function keepInView(t) {
    if (!t || !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') || typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      if (!t.isConnected) return;
      const r = t.getBoundingClientRect();
      const dockH = document.getElementById('dock')?.offsetHeight ?? 0;
      // r2: with the keyboard open the head is no longer sticky (polish.css), so the app header is the floor
      const hdrH = document.querySelector('.hdr')?.getBoundingClientRect().bottom ?? 0;
      const topH = Math.max(head.getBoundingClientRect().bottom, hdrH);
      const vh = window.innerHeight;
      let dy = 0;
      if (r.bottom > vh - dockH - 12) dy = r.bottom - (vh - dockH - 12);
      else if (r.top < topH + 8) dy = r.top - (topH + 8);
      if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: reduceMotion() ? 'auto' : 'smooth' });
    });
  }
  on(stageHost, 'focusin', (e) => keepInView(e.target));

  /* ---- items ---- */
  /** Short enough for the result table at 375 px, long enough to say which item it was. */
  function slotLabel(slot) {
    if (!slot) return '';
    if (slot.elite) return `★ ${slot.id}`;
    if (slot.kind === 'card') return slot.id;
    return `◆ ${String(slot.template || slot.label).replace(/^T-/, '')}`;
  }

  async function mountItem() {
    const slot = st.slots[st.idx];
    if (!slot) return finish({ won: true });
    st.phase = 'run';
    drawStrip(); drawHearts();
    stageHost.replaceChildren();
    stageHost.append(h('p.muted.boss-loading', 'Rolling item ' + (st.idx + 1) + '…'));
    let raw;
    try {
      raw = slot.kind === 'variant' ? st.T.generate(slot.template, slot.seed, slot.params) : getCard(slot.id);
      if (!raw) throw new Error(`no card "${slot.id}"`);
    } catch (e) {
      console.error('boss item', e);
      stageHost.replaceChildren(h('div.boss-panel', h('h2', 'That item could not be built'), h('p.muted.mono', String(e?.message || e)),
        h('button.btn.btn-primary', { type: 'button', onclick: () => { st.idx += 1; mountItem(); } }, 'Skip it')));
      return;
    }
    const item = prepareItem(raw, boss);
    st.curEq = equationPartIds(item);
    st.itemWrongs = 0;
    st.itemRecorded = false;
    st.itemAt = Date.now();
    const save = getState();
    st.mastered = masteredSet(save, item.skills ?? []);
    stageHost.replaceChildren();
    const view = createCardView(stageHost, { item }, {
      kind: slot.kind === 'variant' ? 'variant' : 'card',
      mode: 'boss',                                   // no hints, strict graders (ctx.boss → strictGCF)
      hints: false,
      forCard: slot.kind === 'variant' ? (st.T.getTemplate(slot.template)?.forCard ?? null) : null,
      back: `/boss/${bossId}`,
      onDone: (result) => onItemDone(slot, result),
      onContinue: () => advance(),
    });
    st.view = view;
    st.cur = { slot, item, view };
    if (typeof scrollTo === 'function') scrollTo(0, 0);
  }

  function onItemDone(slot, result) {
    keepCombo();
    // The third wrong on one part reveals the solution INSIDE the Card engine, in the same task that
    // took the last heart — so this can fire on an item the CONTINUE? panel has already booked.
    if (st.itemRecorded || st.phase !== 'run') return;
    st.itemRecorded = true;
    const ms = Math.max(0, num(result?.elapsedMs, Date.now() - st.itemAt));
    const ok = result?.cleared === true;
    st.items.push({
      n: slot.n, id: result?.id ?? slot.id ?? slot.template, skill: slot.skill, tier: slot.tier,
      label: slotLabel(slot), ok, credit: ok ? 1 : 0, ms, clean: result?.clean === true,
      rarity: result?.rarity ?? null, xp: num(result?.xp), flagged: st.flagged,
      elite: !!slot.elite, template: slot.kind === 'variant' ? slot.template : null,
    });
    showSplit(slot.n, ms);
    writeProgress();
  }

  function showSplit(n, ms) {
    const cum = st.items.reduce((a, it) => a + it.ms, 0);
    const g = st.ghost ? (st.ghost.splits ?? []).find((s) => s.n === n) : null;
    const best = st.bests.get(n);
    const bits = [];
    if (g && Number.isFinite(g.cum)) {
      const d = cum - g.cum;
      bits.push(h('span.boss-delta', { dataset: { tone: d <= 0 ? 'good' : 'bad' } }, fmtDelta(d)));
    }
    if (best != null && ms < best) bits.push(h('span.boss-best', 'best split'));
    if (!bits.length) { splitChip.hidden = true; return; }
    splitChip.replaceChildren(...bits);
    splitChip.hidden = false;
    if (best != null && ms < best && !reduceMotion()) {
      splitChip.classList.remove('is-flash'); void splitChip.offsetWidth; splitChip.classList.add('is-flash');
    }
  }

  function advance() {
    clearMiss();
    splitChip.hidden = true;
    if (st.view) { try { st.view.destroy(); } catch { /* gone */ } st.view = null; st.cur = null; }
    st.idx += 1;
    writeProgress();
    if (st.idx >= st.slots.length) return finish({ won: true });
    mountItem();
  }

  /* ---- CONTINUE? (S4 Hearts) ---- */
  function offerContinue() {
    if (st.destroyed || st.done || st.phase === 'continue') return;
    const cur = st.cur;
    const item = cur?.item ?? null;
    const slot = cur?.slot ?? st.slots[st.idx];
    st.phase = 'continue';
    if (st.view) { try { st.view.destroy(); } catch { /* gone */ } st.view = null; st.cur = null; }
    if (item && !st.itemRecorded) {
      st.itemRecorded = true;
      st.items.push({
        n: slot?.n ?? st.idx + 1, id: item.id, skill: slot?.skill ?? (item.skills ?? [])[0] ?? null,
        tier: slot?.tier ?? 1, label: slot ? slotLabel(slot) : item.id, ok: false, credit: 0,
        ms: Math.max(0, Date.now() - st.itemAt), clean: false, rarity: null, xp: 0, flagged: true,
        elite: !!slot?.elite, template: slot?.kind === 'variant' ? slot.template : null, killed: true,
      });
    }
    clearMiss();
    drawHearts(); drawStrip();
    stageHost.replaceChildren(renderContinue(item, slot));
    if (typeof scrollTo === 'function') scrollTo(0, 0);
  }

  function renderContinue(item, slot) {
    const panel = h('div.boss-panel.boss-continue');
    const line = missLine(item, []);
    panel.append(
      h('p.boss-kicker.mono.muted', `Item ${slot?.n ?? st.idx + 1} of ${st.slots.length || 6} · ${slot ? slotLabel(slot) : ''}`),
      h('h2.boss-h2', 'CONTINUE?'),
      h('p.boss-lead', 'That was the last heart. Read the worked solution, answer one question about it, and you get ',
        h('strong', 'one heart'), ' back — the run then carries a ', h('span.boss-flag.is-inline', '*'),
        ' and cannot be flawless or set a personal best.'),
      line.drill ? h('p.muted.fs-1', `The skill: ${line.skillName}.`) : null,
    );
    const steps = item?.solution ?? [];
    if (steps.length) {
      panel.append(h('section.boss-sol', { 'aria-label': 'Worked solution' },
        h('div.card-side-h', 'Worked solution ', h('span.muted.fs-1.mono', item?.id ?? '')),
        h('ol.sol-steps', steps.map((s) => h('li.sol-step.is-in',
          h('span.sol-say', { html: mathfmt(s.say || '') }),
          s.math ? h('span.sol-math.mono', { html: mathfmt(s.math) }) : null)))));
    } else {
      panel.append(h('p.muted', 'This item has no written solution — read the question again and answer the check below.'));
    }

    const q = item ? checkQuestion(item, `${st.seed}|${st.idx}`) : null;
    const actions = h('div.boss-actions');
    const koBtn = h('button.btn.boss-decline', { type: 'button', onclick: () => finish({ won: false, ko: true }) }, 'No — end the run');

    if (!q) {
      actions.append(h('button.btn.btn-primary', { type: 'button', onclick: () => acceptContinue() }, 'I read it — continue'), koBtn);
      panel.append(actions);
      return panel;
    }
    const feedback = h('p.boss-check-feedback', { role: 'status', 'aria-live': 'polite', hidden: true });
    const list = h('ul.boss-check-options');
    for (const opt of q.options) {
      const btn = h('button.btn.boss-check-opt', { type: 'button' }, h('span', { html: mathfmt(opt.text) }));
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (opt.ok) {
          btn.dataset.state = 'ok';
          for (const b of list.querySelectorAll('button')) b.disabled = true;
          feedback.textContent = 'Right — one heart back.';
          feedback.dataset.tone = 'good';
          feedback.hidden = false;
          setTimeout(() => acceptContinue(), reduceMotion() ? 0 : 420);
        } else {
          btn.dataset.state = 'bad';
          btn.disabled = true;
          feedback.textContent = q.wrong || 'Not that one — read the solution again and pick another.';
          feedback.dataset.tone = 'bad';
          feedback.hidden = false;
        }
      });
      list.append(h('li', btn));
    }
    panel.append(h('div.boss-check', h('p.boss-check-q', q.prompt), list, feedback), actions);
    actions.append(koBtn);
    return panel;
  }

  function acceptContinue() {
    if (st.done || st.destroyed) return;
    st.hearts = CONTINUE_HEARTS;
    st.flagged = true;
    drawHearts(); drawStrip();
    st.idx += 1;
    writeProgress();
    if (st.idx >= st.slots.length) return finish({ won: true });
    mountItem();
  }

  /* ---- finish ---- */
  function finish({ won, ko = false }) {
    if (st.done || st.destroyed) return;
    st.done = true;
    st.phase = 'result';
    if (st.view) { try { st.view.destroy(); } catch { /* gone */ } st.view = null; st.cur = null; }
    const run = {
      bossId, seed: st.seed, attempt: st.attempt, startedAt: st.startedAt, submittedAt: Date.now(),
      hearts: st.hearts, flagged: st.flagged, setupMiss: st.setupMiss, won: !!won && !ko, ko: !!ko,
      tabAway: st.tabAway, items: st.items, ghost: st.ghost,
    };
    let out = null;
    update((s) => { out = recordBossRun(s, run); });
    endProgress();
    try { flush(); } catch { /* memory store */ }
    st.record = out?.record ?? null;
    clearMiss();
    drawHearts(); drawStrip();
    stageHost.replaceChildren(renderResult(out));
    if (typeof scrollTo === 'function') scrollTo(0, 0);
    opts.onFinish?.(out?.record ?? null);
  }

  function retryHref({ sameSeed }) {
    return sameSeed
      ? `#/boss/${bossId}?seed=${encodeURIComponent(st.seed)}&start=1`
      : `#/boss/${bossId}?attempt=${nextAttempt(getState(), bossId)}&start=1`;
  }

  function renderResult(out) {
    const rec = out?.record ?? null;
    const won = rec?.won === true;
    const flawless = rec?.flawless === true;
    const totalMs = num(rec?.submittedAt) - num(rec?.startedAt);
    const panel = h('div.boss-panel.boss-result', { dataset: { won: String(won) } });
    panel.append(
      h('h2.boss-h2', won ? (flawless ? 'FLAWLESS' : 'BOSS DOWN') : 'KNOCKED OUT'),
      h('p.boss-lead', won
        ? `${boss.name} is done — ${st.hearts} heart${st.hearts === 1 ? '' : 's'} left in ${fmtClock(totalMs)}.`
        : `${boss.name} stands. You keep every point of XP, every skill update and every tile you earned on the way — only the stamp is gone.`),
    );
    if (won) {
      const xp = num(out?.xp);
      panel.append(h('p.boss-xp',
        h('span.boss-xp-n.mono', { dataset: { zero: String(xp === 0) } }, `+${xp}`), h('span.muted', ' XP'),
        h('span.muted.fs-1', xp === 0
          ? '  ·  already paid on this seed (Boss XP is once per seed)'
          : flawless ? `  ·  ${BOSS_XP} win + ${FLAWLESS_XP} flawless` : `  ·  ${BOSS_XP} win`)));
      if (!flawless) {
        const why = st.flagged ? 'this run used CONTINUE (*)' : st.setupMiss ? 'the required setup was missed' : `${HEARTS - st.hearts} heart${HEARTS - st.hearts === 1 ? '' : 's'} lost`;
        panel.append(h('p.muted.fs-1', `No flawless bonus: ${why}.`));
      }
      if (rec?.pb) panel.append(h('p.boss-pb', 'New personal best on this seed.'));
    }

    panel.append(h('div.table-wrap', h('table.boss-table',
      h('thead', h('tr', h('th', '#'), h('th', 'Item'), h('th.num', 'Time'), h('th.num', 'Split'))),
      h('tbody', st.items.map((it) => {
        const split = (rec?.splits ?? []).find((s) => s.n === it.n);
        return h('tr', { dataset: { ok: String(it.ok) } },
          h('td.mono.boss-cell-n', String(it.n)),
          h('td.boss-cell-item',
            h('span.mono', h('span.boss-cell-mark', it.ok ? '✓' : '✗'), ' ', it.label),
            h('span.boss-cell-skill.muted.fs-1', it.skill ? (skillById[it.skill]?.name ?? it.skill) : '—')),
          h('td.mono.num', fmtClock(it.ms)),
          h('td.mono.num', split && Number.isFinite(split.delta)
            ? h('span.boss-delta', { dataset: { tone: split.delta <= 0 ? 'good' : 'bad' } }, fmtDelta(split.delta))
            : '—'));
      })))));

    const missedSkills = [...new Set(st.items.filter((it) => !it.ok).map((it) => it.skill).filter(Boolean))];
    if (missedSkills.length) {
      panel.append(h('div.boss-drills',
        h('div.card-side-h', 'What to drill'),
        h('ul.boss-drill-list', missedSkills.map((sk) => h('li',
          h('a.btn.btn-ghost', { href: `#/run/drill/${sk}` }, `Drill 5: ${skillById[sk]?.name ?? sk}`))))));
    }

    panel.append(h('div.boss-actions',
      h('a.btn.btn-primary', { href: retryHref({ sameSeed: true }) }, 'RETRY SAME SEED'),
      h('a.btn', { href: retryHref({ sameSeed: false }) }, won ? 'New seed' : 'RETRY (new seed)'),
      h('a.btn.btn-ghost', { href: '#/binder' }, 'Binder')));
    if (st.flagged) panel.append(h('p.muted.fs-1', 'This run is flagged * — it does not count as flawless and never writes a personal best.'));
    return panel;
  }

  /* ---- intro ---- */
  function renderIntro() {
    st.phase = 'intro';
    drawStrip(); drawHearts();
    const skills = boss.skills.map((s) => skillById[s]?.name ?? s);
    const eliteCard = getCard(boss.elite);
    const panel = h('div.boss-panel.boss-intro');
    panel.append(
      h('p.boss-kicker.mono.muted', `${boss.id} · ${boss.modules.join(' + ')}`),
      h('h2.boss-h2', boss.name),
      h('ul.boss-rules',
        h('li', h('strong', `${boss.variants} Variants`), ' then the elite original ', h('span.mono', boss.elite), eliteCard ? h('span.muted', ` — ${eliteCard.sheet} ${eliteCard.src ?? ''}`) : null),
        h('li', h('strong', '3 hearts'), ' — one wrong submit costs one. An “almost” costs nothing.'),
        h('li', h('strong', 'No hints'), ' and no clock. Your time is recorded and shown afterwards.'),
        boss.equationRequired ? h('li', h('strong', 'The equation setup is required here'), ' — a wrong or blank one costs no heart, but the flawless bonus goes.') : null,
        h('li', 'Quit any time: XP, mastery and tiles you earn on the way are yours either way.')),
      h('p.boss-skills.muted.fs-1', `Skills: ${skills.join(' · ')}`),
      h('p.boss-seedline.muted.fs-1', h('span.mono', `seed ${st.seed}`), st.ghost ? '  ·  a ghost from an earlier run on this seed will show splits' : '  ·  first run on this seed'),
    );
    const actions = h('div.boss-actions');
    if (resumable) {
      actions.append(h('button.btn.btn-primary', { type: 'button', onclick: () => resume() },
        `RESUME · item ${num(resumeRec.idx, 0) + 1} of 6`));
      actions.append(h('button.btn', { type: 'button', onclick: () => start() }, 'Start over'));
    } else {
      actions.append(h('button.btn.btn-primary', { type: 'button', onclick: () => start() }, 'ENTER'));
    }
    actions.append(h('a.btn.btn-ghost', { href: '#/today' }, 'Not now'));
    panel.append(actions);
    stageHost.replaceChildren(panel);
  }

  function start() {
    st.idx = 0; st.hearts = HEARTS; st.flagged = false; st.setupMiss = false; st.items = [];
    st.startedAt = Date.now();
    st.phase = 'run';            // before the write: writeProgress() deliberately ignores the intro phase
    writeProgress();
    mountItem();
  }

  function resume() {
    st.idx = Math.max(0, Math.min(st.slots.length - 1, num(resumeRec.idx, 0)));
    st.hearts = Math.max(1, Math.min(HEARTS, num(resumeRec.hearts, HEARTS)));
    st.flagged = resumeRec.flagged === true;
    st.setupMiss = resumeRec.setupMiss === true;
    st.items = Array.isArray(resumeRec.items) ? resumeRec.items.slice() : [];
    st.startedAt = num(resumeRec.startedAt, Date.now());
    st.stash = isObj(resumeRec.stash) ? resumeRec.stash : null;
    mountItem();
  }

  /* ---- init ---- */
  (async () => {
    try {
      st.T = await loadTemplates();
      if (st.destroyed) return;
      const composed = composeBoss(bossId, st.seed, st.T);
      st.slots = composed?.slots ?? [];
      const save = getState();
      st.ghost = ghostFor(save, bossId, st.seed);
      st.bests = bestSplits(save, bossId, st.seed);
      if (opts.autostart && !resumable) start();
      else if (opts.autostart && resumable) resume();
      else renderIntro();
      drawStrip();
    } catch (e) {
      console.error('boss', e);
      stageHost.replaceChildren(h('div.boss-panel', h('h2', 'The boss could not be built'),
        h('p.muted.mono', String(e?.message || e)), h('p', h('a.btn', { href: '#/today' }, 'Back to Today'))));
    }
  })();

  drawHearts();
  drawStrip();

  function destroy() {
    if (st.destroyed) return;
    st.destroyed = true;
    for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* gone */ } }
    if (st.view) { try { st.view.destroy(); } catch { /* gone */ } st.view = null; }
    if (!st.done && st.phase !== 'intro') { try { writeProgress(); flush(); } catch { /* ignore */ } }
    keepCombo();
    root.remove();
  }

  return { el: root, destroy, state: st, start, advance, finish };
}

export default mountBoss;
