/**
 * notes/repair-call-evidence.mjs — the four measurements behind notes/repair-call.md.
 *
 *     node notes/repair-call-evidence.mjs
 *
 * Reproducible on purpose: two of the `call` lane's round-3 findings are BLOCKERs that this ticket
 * REFUTES rather than fixes, and a refutation is worth nothing without the command that shows it.
 * Reads only the shipped modules; writes nothing. (Convention: notes/check-m1.mjs, notes/verify-t06b.mjs.)
 *
 *   1. findings 11 / 18 — "the rating weight is read AFTER the outcome it weighs"      → STALE
 *   2. finding  12      — "Called 5 is unreachable by honest play, ceiling 8.213"      → STALE
 *   3. findings 24 / 35 / 36 — two published numerals in COMPOSED-GAME.md              → CONFIRMED (doc)
 *   4. S3              — the demotion is a continuous SLIDE, which is why the repair is a FLOOR
 */
import {
  qHatDetail, weightFor, callEntry, credit, honestCall, callLevel, CALL_IDS,
  wTimesEcDiscrete, ratingDetail, rankFor, expectedCredit, expectedRating,
  disagreementBands, INFORMATIVE_MIN,
} from '../site/js/job/call.js';
import { RANK_MEAN_WC, RANK_THRESHOLDS, RATING, CAPS, RANKS } from '../site/data/job.js';

const rule = (s) => console.log(`\n${'='.repeat(92)}\n${s}\n${'='.repeat(92)}`);

/* ---------------------------------------------------------------- 1. findings 11 / 18 */
rule('1 · findings 11 / 18 — is the anti-farming weight endogenous to the outcome it weighs?');

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;
/* ten sittings on one make, 7 clears, the OLDEST a miss — the critics' own state (q̂ = 0.7) */
const hist = Array.from({ length: 10 }, (_, i) => (
  { at: T0 - (10 - i) * DAY, ok: i > 0 && i < 8, attempt: 1, hints: 0, ms: 9000 }));
const LOCK = T0 + 1000;                                   // state.lockCall's own `at`
const base = {
  cards: { C1: { skills: ['ASN-PLP'], history: hist } },
  inProgress: { game: { locked: { call: 85, n: 1, at: LOCK } } },      // the seal lockCall writes
};
/* screens/card.js:922 pushes the sitting being scored BEFORE state.applyTarget is called */
const branch = (cleared) => {
  const s = structuredClone(base);
  s.cards.C1.history.push({ at: LOCK + 1, ok: cleared, attempt: 1, hints: 0, ms: 9000 });
  return s;
};
const read = (s, opts) => qHatDetail(s, 'ASN-PLP', { cards: { C1: ['ASN-PLP'] }, ...opts });

const C = read(branch(true), {});
const M = read(branch(false), {});
console.log(`q̂ at the seal (the DEFAULT cut) : clear ${C.qHat} · miss ${M.qHat} · sealed ${C.sealed}/${M.sealed}`);
console.log(`w stored through callEntry      : clear ${callEntry({ call: 85, ok: true, qHat: C.qHat }).w}`
  + ` · miss ${callEntry({ call: 85, ok: false, qHat: M.qHat }).w}`
  + ` · ratio ${weightFor(M.qHat) / weightFor(C.qHat)}`);
const LC = read(branch(true), { before: null });
const LM = read(branch(false), { before: null });
console.log('THE CONTROL — before:null, the pre-round-3 read the critics measured:');
console.log(`  q̂ after a clear ${LC.qHat} → w ${weightFor(LC.qHat).toFixed(6)}`
  + ` | q̂ after a miss ${LM.qHat} → w ${weightFor(LM.qHat).toFixed(6)}`
  + ` | ratio ${(weightFor(LM.qHat) / weightFor(LC.qHat)).toFixed(6)}   ← the finding's own 0.64 / 0.84 / 1.3125`);
console.log(`VERDICT: ${C.qHat === M.qHat ? 'STALE — exogenous by default (and the control is alive)' : 'the finding stands'}`);

/* ---------------------------------------------------------------- 2. finding 12 */
rule('2 · finding 12 — can an honest policy reach Called 5?');

const slot = (w, p, ok) => (w >= INFORMATIVE_MIN ? w * credit(p, ok) : 0);
const exo = (q, p) => { const w = weightFor(q); return q * slot(w, p, true) + (1 - q) * slot(w, p, false); };
const ceilingOver = (qs) => {
  let best = { v: -Infinity };
  /* strictly greater, so a tie keeps the LOWER rung — call.js's own `TIE` convention */
  for (const q of qs) for (const id of CALL_IDS) { const v = exo(q, callLevel(id).p); if (v > best.v + 1e-12) best = { v, q, call: id }; }
  return best;
};
const cont = ceilingOver(Array.from({ length: 501 }, (_, i) => 0.5 + i / 1000));
const grid = ceilingOver(Array.from({ length: 11 }, (_, k) => k / 10));   // a 10-sitting window's q̂ grid
console.log(`continuous peak : mean w·c ${cont.v.toFixed(4)} at q̂ ${cont.q} rung ${cont.call}`
  + ` (honestCall ${honestCall(cont.q)}, w·E[c] ${wTimesEcDiscrete(cont.q).toFixed(4)})`);
console.log(`reachable grid  : mean w·c ${grid.v.toFixed(4)} at q̂ ${grid.q} rung ${grid.call}`
  + `  ← the honest per-slot maximum a 10-sitting window can express`);
console.log(`Called 5 asks for RANK_MEAN_WC ${RANK_MEAN_WC.at(-1)} (rating ${RANK_THRESHOLDS.at(-1)});`
  + ` the grid buys rating ${(RATING.base + RATING.scale * grid.v).toFixed(3)}`);
/* the same policy through the shipped scorer, with the outcomes PROPORTIONED to q̂ (not all clears:
   that would print the ceiling of the window rather than what the policy earns) */
const clears = Math.round(grid.q * CAPS.calls);
const win = Array.from({ length: CAPS.calls }, (_, i) => (
  { p: callLevel(grid.call).p, ok: i < clears, w: weightFor(grid.q), at: i }));
const d = ratingDetail(win, CAPS.calls);
console.log(`through the SHIPPED scorer: a 50-slot window at that policy, ${clears} of 50 cleared →`
  + ` ratingDetail ${d.value.toFixed(3)} · n ${d.n} · ${RANKS[d.rank - 1].name}`);
console.log(`VERDICT: ${grid.v >= RANK_MEAN_WC.at(-1) ? 'STALE — Called 5 is reachable by honest play; 8.213 / 1.607 is the ENDOGENOUS regime' : 'the finding stands'}`);

/* ---------------------------------------------------------------- 3. findings 24 / 35 / 36 */
rule('3 · findings 24 / 35 / 36 — two published numerals (the code is right, COMPOSED-GAME.md is not)');

console.log('G3.1 Sanity row "systematic over-calling (95 on q̂ = .5 material)" — published mean −4.90:');
for (const id of [70, 85, 95]) {
  const p = callLevel(id).p;
  console.log(`  call ${id}: w ${weightFor(0.5).toFixed(4)} · E[c] ${expectedCredit(p, 0.5).toFixed(2)}`
    + ` · w·E[c] ${(weightFor(0.5) * expectedCredit(p, 0.5)).toFixed(2)} · rating ${expectedRating(0.5, { call: id }).toFixed(2)}`);
}
console.log('  → −4.90 is the 85 call; the 95 call is −8.10 (the rating column, 0.00, is right either way)');
const bands = disagreementBands();
console.log('G3.1 "2.1 percentage points wide":');
for (const b of bands) {
  console.log(`  [${b.from.toFixed(6)}, ${b.to.toFixed(6)}) money ${b.money} rank ${b.rank} → ${b.widthPoints.toFixed(4)} pp`);
}
const tot = bands.reduce((s, b) => s + b.widthPoints, 0);
console.log(`  total ${tot.toFixed(4)} pp → ${tot.toFixed(1)}, not 2.1`);

/* ---------------------------------------------------------------- 4. S3 */
rule('4 · S3 — the demotion is a continuous SLIDE, so the repair is a FLOOR, not `held = !measured`');

const step = (k) => {
  const w = [];
  for (let i = 0; i < k; i++) w.push(callEntry({ call: 85, ok: true, qHat: 0.85, skill: 'X', at: i }));
  /* a MASTERED make: q̂ = 1 ⟹ w = 0 ⟹ callEntry writes the blank slot {p: null, w: 0} */
  for (let i = k; i < RATING.N; i++) w.push(callEntry({ call: 85, ok: true, qHat: 1, skill: 'X', at: i }));
  return w;
};
let rank = ratingDetail(step(RATING.N), RATING.N).rank;
const start = rank;
let fell = 0; let heldMeasured = 0;
for (let k = RATING.N; k >= 0; k -= 5) {
  const r = ratingDetail(step(k), RATING.N, { rank });
  const bare = rankFor(r.value);
  if (bare < start) fell++;
  if (r.measured && r.held) heldMeasured++;
  console.log(`  k=${String(k).padStart(2)} rating ${r.value.toFixed(3)} · without the floor ${RANKS[bare - 1].name}`
    + ` · with it ${RANKS[r.rank - 1].name} · measured ${r.measured} · held ${r.held}`);
  rank = r.rank;
}
console.log(`start ${RANKS[start - 1].name} → finish ${RANKS[rank - 1].name} ·`
  + ` steps the floor rescued: ${fell} · of which MEASURED (i.e. invisible to \`held = !measured\`): ${heldMeasured}`);
