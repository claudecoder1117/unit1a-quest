// xp.js — the S4 XP formula, the three combo transitions, levels and ranks (COMPOSED S4 "XP per clear",
// "Levels", "Combo"; Global rule 8). Pure, DOM-free, imports nothing — `node --test` runs it as-is.
//
//   base  = {1:10, 2:20, 3:30, 4:50}[tier]
//   clean = firstTry ∧ hints === 0                       (THE definition: combo, mastery s = 100 and Foil reuse it)
//   qual  = firstTry ? (hints === 0 ? 1.5 : max(0.25, 1 − 0.25·hints)) : ({2:0.6, 3:0.3}[attempt] ?? 0)
//   combo = 1 + 0.1·min(comboBefore, 10)
//   speed = (clean ∧ tier ≤ 2 ∧ elapsed ≤ par) ? 5 : 0    (par: tier 1 → 20 s, tier 2 → 90 s; never on tier 3–4)
//   scope = isBonusBank ? 0 : isReview ? 1.25 : isDrill ? 1 : isVariant ? 0.8 : isMastered ? 0.5 : 1
//   xp    = round(base · qual · combo · scope) + speed + (isRematch ? 5 : 0)
//   abandoned multi-part cards pay × partsCorrect/partsTotal; solution shown → 0.
//
// Combo (session-scoped, S4): a clean clear INCREMENTS; a Gold-with-H1 clear (first try, exactly one hint)
// HOLDS (the multiplier still applies to that card); H2/H3, any wrong submit, or a reveal RESETS to 0 — so
// "retry-then-correct" is a reset at the wrong submit followed by a clear paid at combo 0.

export const BASE_XP = Object.freeze({ 1: 10, 2: 20, 3: 30, 4: 50 });
export const SPEED_PAR_S = Object.freeze({ 1: 20, 2: 90 });   // seconds; tiers 3–4 have no speed bonus
export const SPEED_BONUS = 5;
export const REMATCH_BONUS = 5;
export const COMBO_CAP = 10;
export const COMBO_STEP = 0.1;
export const QUAL_RETRY = Object.freeze({ 2: 0.6, 3: 0.3 });

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** clean = first try AND zero hints (Global rule 8). */
export function isClean(c) {
  return !!c && c.firstTry === true && Math.max(0, num(c.hints)) === 0;
}

/** Tier clamped to the authored range 1–4 (anything else reads as tier 1). */
export function tierOf(tier) {
  const t = Math.floor(num(tier, 1));
  return t >= 1 && t <= 4 ? t : 1;
}

export function baseFor(tier) {
  return BASE_XP[tierOf(tier)];
}

/**
 * The quality multiplier of a clear.
 * @param {{firstTry?:boolean, hints?:number, attempt?:number, solutionShown?:boolean}} c
 */
export function qualFor(c = {}) {
  if (c.solutionShown === true) return 0;
  const h = Math.max(0, Math.floor(num(c.hints)));
  if (c.firstTry === true) return h === 0 ? 1.5 : Math.max(0.25, 1 - 0.25 * h);
  const a = Number.isInteger(c.attempt) ? c.attempt : 2;
  return QUAL_RETRY[a] ?? 0;
}

/** 1 + 0.1·min(comboBefore, 10). */
export function comboMult(comboBefore) {
  return 1 + COMBO_STEP * Math.min(Math.max(0, Math.floor(num(comboBefore))), COMBO_CAP);
}

/** The silent par a tier-1/2 clean clear has to beat, in ms; null on tiers 3–4. */
export function speedParMs(tier) {
  const s = SPEED_PAR_S[tierOf(tier)];
  return s ? s * 1000 : null;
}

/** +5 for a clean tier ≤ 2 clear inside par, else 0. */
export function speedBonus({ clean, tier, elapsedMs } = {}) {
  const par = speedParMs(tier);
  if (!clean || par == null || !Number.isFinite(elapsedMs)) return 0;
  return elapsedMs <= par ? SPEED_BONUS : 0;
}

/** The scope multiplier — first matching flag wins, in the S4 order. */
export function scopeFor(f = {}) {
  if (f.isBonusBank) return 0;
  if (f.isReview) return 1.25;
  if (f.isDrill) return 1;
  if (f.isVariant) return 0.8;
  if (f.isMastered) return 0.5;
  return 1;
}

/** The word the breakdown prints next to `scope`, or '' when scope is 1 by default. */
export function scopeLabel(f = {}) {
  if (f.isBonusBank) return 'bonus bank';
  if (f.isReview) return 'review';
  if (f.isDrill) return 'drill';
  if (f.isVariant) return 'variant';
  if (f.isMastered) return 'mastered';
  return '';
}

/** The word the breakdown prints next to `qual`. */
export function qualLabel(c = {}) {
  if (c.solutionShown === true) return 'solution shown';
  const h = Math.max(0, Math.floor(num(c.hints)));
  if (c.firstTry === true) return h === 0 ? 'clean' : h === 1 ? '1 hint' : `${h} hints`;
  const a = Number.isInteger(c.attempt) ? c.attempt : 2;
  return a === 2 ? '2nd try' : a === 3 ? '3rd try' : `try ${a}`;
}

const fmtMult = (x) => {
  const s = (Math.round(x * 100) / 100).toString();
  return s;
};

/**
 * xpFor(clear) → the S4 XP for one clear, with every factor exposed and a printable breakdown
 * ("30 × 1.5 clean × 1.2 combo = 54").
 * @param {object} clear  { tier, firstTry, hints, attempt, solutionShown, comboBefore, elapsedMs,
 *                          isReview, isDrill, isVariant, isMastered, isBonusBank, isRematch,
 *                          partsCorrect, partsTotal, factor (an external ×, e.g. the Sure-miss ½) }
 */
export function xpFor(clear = {}) {
  const tier = tierOf(clear.tier);
  const base = BASE_XP[tier];
  const clean = isClean(clear);
  const qual = qualFor(clear);
  const comboBefore = Math.max(0, Math.floor(num(clear.comboBefore)));
  const combo = comboMult(comboBefore);
  const scope = scopeFor(clear);
  const speed = speedBonus({ clean, tier, elapsedMs: clear.elapsedMs });
  const rematch = clear.isRematch ? REMATCH_BONUS : 0;
  const total = num(clear.partsTotal, 0);
  const correct = num(clear.partsCorrect, total);
  const partsFactor = total > 0 && correct < total ? Math.max(0, correct) / total : 1;
  const factor = clear.factor == null ? 1 : Math.max(0, num(clear.factor, 1));

  const core = Math.round(base * qual * combo * scope);
  let xp = core + speed + rematch;
  if (partsFactor < 1) xp = Math.round(xp * partsFactor);
  if (factor !== 1) xp = Math.round(xp * factor);
  if (clear.solutionShown === true) xp = 0;
  xp = Math.max(0, xp);

  const parts = [`${base}`, `× ${fmtMult(qual)} ${qualLabel(clear)}`];
  if (combo !== 1) parts.push(`× ${fmtMult(combo)} combo`);
  if (scope !== 1) parts.push(`× ${fmtMult(scope)} ${scopeLabel(clear)}`);
  let breakdown = `${parts.join(' ')} = ${core}`;
  if (speed) breakdown += ` + ${speed} speed`;
  if (rematch) breakdown += ` + ${rematch} rematch`;
  if (partsFactor < 1) breakdown += ` × ${correct}/${total} parts`;
  if (factor !== 1) breakdown += ` × ${fmtMult(factor)}`;
  if (clear.solutionShown === true) breakdown = `solution shown = 0`;
  else if (speed || rematch || partsFactor < 1 || factor !== 1) breakdown += ` = ${xp}`;

  return Object.freeze({ xp, base, tier, clean, qual, combo, comboBefore, scope, speed, rematch, partsFactor, factor, breakdown });
}

/* ---------------------------------------------------------------- combo (S4) */

/** 'increment' | 'hold' | 'reset' — the exactly-three transitions a clear can cause. */
export function comboTransition(clear = {}) {
  if (isClean(clear)) return 'increment';
  if (clear.firstTry === true && Math.max(0, Math.floor(num(clear.hints))) === 1 && clear.solutionShown !== true) return 'hold';
  return 'reset';
}

/** The combo after a clear. */
export function nextCombo(comboBefore, clear = {}) {
  const before = Math.max(0, Math.floor(num(comboBefore)));
  const t = comboTransition(clear);
  return t === 'increment' ? before + 1 : t === 'hold' ? before : 0;
}

/** Does this event (a wrong submit, a hint, a reveal) reset the combo on the spot? */
export function eventResetsCombo(evt = {}) {
  if (evt.wrong === true || evt.reveal === true) return true;
  if (Number.isInteger(evt.hint)) return evt.hint >= 2;   // H2 / H3 reset; H1 holds
  return false;
}

/** 0 (none) · 1 (≥ 1) · 2 (≥ 5, amber ×1.5) · 3 (≥ 10, violet ×2.0). */
export function comboTier(combo) {
  const c = Math.max(0, Math.floor(num(combo)));
  return c >= 10 ? 3 : c >= 5 ? 2 : c >= 1 ? 1 : 0;
}

/** '×1.5' style label, '' at 0. */
export function comboLabel(combo) {
  const c = Math.max(0, Math.floor(num(combo)));
  return c >= 1 ? `×${comboMult(c).toFixed(1)}` : '';
}

/** Sound-on tick pitch: 440·2^(combo/12) Hz. */
export function comboPitch(combo) {
  return 440 * Math.pow(2, Math.max(0, Math.floor(num(combo))) / 12);
}

/* ---------------------------------------------------------------- levels + ranks (S4) */

/** XP needed to be level L: 50·L·(L−1) → L2 100 … L12 6600, L15 10500. */
export const xpForLevel = (L) => 50 * L * (L - 1);

/** The level an XP total sits at (≥ 1). */
export function levelFor(xp) {
  const x = Math.max(0, num(xp));
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + x / 12.5)) / 2));
}

export const RANKS = Object.freeze([[1, 'Point'], [3, 'Segment'], [5, 'Ray'], [7, 'Line'], [9, 'Angle'], [11, 'Linear Pair'], [13, 'Plane'], [15, 'Space']]);

/** Rank name at a level (ranks change at odd levels). */
export function rankFor(level) {
  const L = Math.max(1, Math.floor(num(level, 1)));
  let name = RANKS[0][1];
  for (const [l, n] of RANKS) if (L >= l) name = n;
  return name;
}

/** { level, rank, lo, hi, pct, toNext } for a level ring. */
export function levelProgress(xp) {
  const x = Math.max(0, num(xp));
  const level = levelFor(x);
  const lo = xpForLevel(level), hi = xpForLevel(level + 1);
  return Object.freeze({ level, rank: rankFor(level), lo, hi, pct: (x - lo) / (hi - lo), toNext: hi - x });
}

export default xpFor;
